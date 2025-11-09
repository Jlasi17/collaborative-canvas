const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const RoomManager = require('./rooms');
const DrawingState = require('./drawing-state');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, '../client')));

app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const roomManager = new RoomManager();
const drawingStates = new Map();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    socket.on('create_room', () => {
        try {
            const roomId = roomManager.createRoom();
            socket.join(roomId);
            roomManager.addUserToRoom(roomId, socket.id);
            if (!drawingStates.has(roomId)) {
                drawingStates.set(roomId, new DrawingState());
            }
            const userInfo = roomManager.getUserInfo(socket.id);
            const users = roomManager.getUsersInRoomWithInfo(roomId);
            socket.emit('room_created', { 
                roomId,
                message: 'Room created successfully',
                userInfo: userInfo,
                users: users
            });
            console.log(`Room created: ${roomId} by ${socket.id}`);
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('room_error', { message: error.message });
        }
    });
    
    socket.on('join_room', ({ roomId }) => {
        try {
            if (!roomManager.roomExists(roomId)) {
                throw new Error('Room does not exist');
            }
            socket.join(roomId);
            roomManager.addUserToRoom(roomId, socket.id);
            if (!drawingStates.has(roomId)) {
                drawingStates.set(roomId, new DrawingState());
            }
            const userInfo = roomManager.getUserInfo(socket.id);
            const users = roomManager.getUsersInRoomWithInfo(roomId);
            socket.emit('room_joined', { 
                roomId,
                message: 'Joined room successfully',
                userInfo: userInfo,
                users: users
            });
            socket.to(roomId).emit('user_joined', { 
                userId: socket.id,
                roomId,
                userInfo: userInfo,
                users: users
            });
            console.log(`User ${socket.id} joined room: ${roomId}`);
        } catch (error) {
            console.error(`Error joining room ${roomId}:`, error);
            socket.emit('room_error', { message: error.message });
        }
    });
    
    socket.on('cursor_move', (data) => {
        try {
            const roomId = roomManager.getUserRoom(socket.id);
            if (!roomId) return;
            roomManager.updateUserCursor(socket.id, { x: data.x, y: data.y });
            const userInfo = roomManager.getUserInfo(socket.id);
            socket.to(roomId).emit('cursor_move', {
                userId: socket.id,
                x: data.x,
                y: data.y,
                color: userInfo ? userInfo.color : '#000000'
            });
        } catch (error) {
            console.error('Error handling cursor move:', error);
        }
    });
    
    socket.on('draw', (data) => {
        try {
            const roomId = roomManager.getUserRoom(socket.id);
            if (!roomId || !drawingStates.has(roomId)) return;
            const drawingState = drawingStates.get(roomId);
            const { type } = data;
            switch (type) {
                case 'stroke_begin':
                case 'draw':
                case 'stroke_end':
                    drawingState.addOperation({ ...data, userId: socket.id, timestamp: Date.now() });
                    socket.to(roomId).emit('draw', { ...data, userId: socket.id });
                    break;
                case 'clear':
                    drawingState.addOperation({ type: 'clear', userId: socket.id, timestamp: Date.now() });
                    socket.to(roomId).emit('draw', { type: 'clear', userId: socket.id });
                    socket.emit('draw', { type: 'clear', userId: socket.id });
                    break;
                case 'undo': {
                    const undoneStroke = drawingState.undoLastStroke();
                    if (undoneStroke) {
                        socket.to(roomId).emit('draw', {
                            type: 'undo',
                            userId: socket.id,
                            undoneStroke
                        });
                        socket.emit('draw', {
                            type: 'undo',
                            userId: socket.id,
                            undoneStroke
                        });
                    }
                    break;
                }
                case 'redo': {
                    const redoneStroke = drawingState.redoLastStroke();
                    if (redoneStroke) {
                        socket.to(roomId).emit('draw', {
                            type: 'redo',
                            userId: socket.id,
                            redoneStroke
                        });
                        socket.emit('draw', {
                            type: 'redo',
                            userId: socket.id,
                            redoneStroke
                        });
                    }
                    break;
                }
            }
        } catch (error) {
            console.error('Error handling draw event:', error);
        }
    });
    
    socket.on('request_canvas_state', () => {
        try {
            const roomId = roomManager.getUserRoom(socket.id);
            if (!roomId || !drawingStates.has(roomId)) return;
            const drawingState = drawingStates.get(roomId);
            socket.emit('canvas_state', {
                operations: drawingState.getOperations(),
            });
        } catch (error) {
            console.error('Error handling canvas state request:', error);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        const roomId = roomManager.getUserRoom(socket.id);
        if (roomId) {
            roomManager.removeUserFromRoom(roomId, socket.id);
            const users = roomManager.getUsersInRoomWithInfo(roomId);
            socket.to(roomId).emit('user_left', { 
                userId: socket.id,
                users: users
            });
            if (users.length === 0) {
                drawingStates.delete(roomId);
                roomManager.deleteRoom(roomId);
                console.log(`Room ${roomId} deleted (no users left)`);
            }
        }
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} in your browser`);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

module.exports = { server, io };