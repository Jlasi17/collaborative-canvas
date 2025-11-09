const { v4: uuidv4 } = require('uuid');

class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.userRooms = new Map();
        this.userInfo = new Map();
        this.availableColors = [
            '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', 
            '#00FFFF', '#FFA500', '#800080', '#FFC0CB', '#A52A2A',
            '#808080', '#000000', '#008000', '#000080', '#800000'
        ];
        this.colorIndex = 0;
    }
    
    createRoom() {
        const roomId = this.generateRoomId();
        this.rooms.set(roomId, new Set());
        return roomId;
    }
    
    deleteRoom(roomId) {
        if (this.rooms.has(roomId)) {
            const users = this.rooms.get(roomId);
            users.forEach(userId => {
                this.userRooms.delete(userId);
            });
            this.rooms.delete(roomId);
        }
    }
    
    addUserToRoom(roomId, userId, userName = null) {
        this.removeUserFromAnyRoom(userId);
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set());
        }
        this.rooms.get(roomId).add(userId);
        this.userRooms.set(userId, roomId);
        if (!this.userInfo.has(userId)) {
            const color = this.getNextColor();
            this.userInfo.set(userId, {
                name: userName || `User ${userId.substring(0, 6)}`,
                color: color,
                cursor: null
            });
        }
    }
    
    getNextColor() {
        const color = this.availableColors[this.colorIndex % this.availableColors.length];
        this.colorIndex++;
        return color;
    }
    
    getUserInfo(userId) {
        return this.userInfo.get(userId) || null;
    }
    
    updateUserCursor(userId, cursor) {
        if (this.userInfo.has(userId)) {
            this.userInfo.get(userId).cursor = cursor;
        }
    }
    
    getUsersInRoomWithInfo(roomId) {
        if (!this.rooms.has(roomId)) {
            return [];
        }
        const userIds = Array.from(this.rooms.get(roomId));
        return userIds.map(userId => {
            const info = this.userInfo.get(userId) || { name: `User ${userId.substring(0, 6)}`, color: '#000000', cursor: null };
            return {
                id: userId,
                name: info.name,
                color: info.color,
                cursor: info.cursor
            };
        });
    }
    
    removeUserFromRoom(roomId, userId) {
        if (this.rooms.has(roomId)) {
            const users = this.rooms.get(roomId);
            users.delete(userId);
            this.userRooms.delete(userId);
            this.userInfo.delete(userId);
            if (users.size === 0) {
                this.rooms.delete(roomId);
            }
        }
    }
    
    removeUserFromAnyRoom(userId) {
        const roomId = this.userRooms.get(userId);
        if (roomId) {
            this.removeUserFromRoom(roomId, userId);
        }
    }
    
    getUserRoom(userId) {
        return this.userRooms.get(userId) || null;
    }
    
    getUsersInRoom(roomId) {
        if (this.rooms.has(roomId)) {
            return Array.from(this.rooms.get(roomId));
        }
        return [];
    }
    
    roomExists(roomId) {
        return this.rooms.has(roomId);
    }
    
    generateRoomId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (this.rooms.has(result)) {
            return this.generateRoomId();
        }
        return result;
    }
}

module.exports = RoomManager;