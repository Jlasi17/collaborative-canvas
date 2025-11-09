class WebSocketClient {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.userId = this.generateUserId();
        this.userInfo = null;
        this.users = new Map(); // userId -> user info
        this.cursorIndicators = new Map(); // userId -> cursor element
        this.setupEventListeners();
    }

    generateUserId() {
        return 'user-' + Math.random().toString(36).substr(2, 9);
    }

    connect() {
        // Connect to the server
        this.socket = io();
        this.setupSocketListeners();
        
        // Store socket in global scope for easy access
        window.socket = this.socket;
        
        this.updateStatus('Connecting to server...', 'connecting');
    }

    setupSocketListeners() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            this.updateStatus('Connected to server', 'connected');
            console.log('Connected to server with ID:', this.socket.id);
        });

        this.socket.on('disconnect', (reason) => {
            this.updateStatus('Disconnected from server', 'disconnected');
            console.log('Disconnected:', reason);
            
            // Try to reconnect after a delay
            if (reason === 'io server disconnect') {
                this.socket.connect();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateStatus('Connection error', 'error');
        });

        // Handle room-related events
        this.socket.on('room_created', (data) => {
            this.roomId = data.roomId;
            this.userInfo = data.userInfo;
            document.getElementById('room-id').value = data.roomId;
            this.updateStatus(`Room created: ${data.roomId}`, 'success');
            this.showNotification('Room created! Share the room ID with others to collaborate.');
            this.updateUsersList(data.users || []);
        });

        this.socket.on('room_joined', (data) => {
            this.roomId = data.roomId;
            this.userInfo = data.userInfo;
            this.updateStatus(`Joined room: ${data.roomId}`, 'success');
            this.showNotification(`Joined room: ${data.roomId}`);
            this.updateUsersList(data.users || []);
            
            // Request the current canvas state
            this.socket.emit('request_canvas_state');
        });

        this.socket.on('room_error', (data) => {
            console.error('Room error:', data.message);
            this.updateStatus(`Error: ${data.message}`, 'error');
            this.showNotification(`Error: ${data.message}`, 'error');
        });

        this.socket.on('user_joined', (data) => {
            this.showNotification(`User ${data.userInfo?.name || data.userId} joined the room`);
            console.log('User joined:', data.userId);
            this.updateUsersList(data.users || []);
        });

        this.socket.on('user_left', (data) => {
            this.showNotification(`User left the room`);
            console.log('User left:', data.userId);
            this.removeCursorIndicator(data.userId);
            this.updateUsersList(data.users || []);
        });
        
        // Handle cursor position updates
        this.socket.on('cursor_move', (data) => {
            if (data.userId === this.socket.id) return; // Don't show our own cursor
            
            if (data.x < 0 || data.y < 0) {
                this.removeCursorIndicator(data.userId);
            } else {
                this.updateCursorIndicator(data.userId, data.x, data.y, data.color);
            }
        });

        // Handle drawing events
        this.socket.on('draw', (data) => {
            // For undo/redo/clear, process even our own events (server is source of truth)
            // For regular drawing, skip our own events (we already drew them locally)
            const globalOperations = ['undo', 'redo', 'clear'];
            if (data.userId === this.socket.id && !globalOperations.includes(data.type)) {
                return; // Don't process our own regular drawing strokes
            }
            
            if (window.canvas) {
                window.canvas.handleIncomingDraw(data);
            }
        });

        // Handle canvas state synchronization
        this.socket.on('canvas_state', (data) => {
            if (data.imageData && window.canvas) {
                const img = new Image();
                img.onload = () => {
                    window.canvas.ctx.clearRect(0, 0, window.canvas.canvas.width, window.canvas.canvas.height);
                    window.canvas.ctx.drawImage(img, 0, 0, window.canvas.canvas.width, window.canvas.canvas.height);
                };
                img.src = data.imageData;
            }
        });
    }

    createRoom() {
        if (!this.socket || !this.socket.connected) {
            this.updateStatus('Not connected to server', 'error');
            return;
        }
        
        this.socket.emit('create_room');
    }

    joinRoom(roomId) {
        if (!this.socket || !this.socket.connected) {
            this.updateStatus('Not connected to server', 'error');
            return;
        }
        
        if (!roomId || roomId.trim() === '') {
            this.updateStatus('Please enter a room ID', 'error');
            return;
        }
        
        this.socket.emit('join_room', { roomId });
    }

    updateStatus(message, type = 'info') {
        const statusElement = document.getElementById('status');
        if (!statusElement) return;
        
        statusElement.textContent = message;
        statusElement.className = '';
        statusElement.classList.add(type);
    }

    showNotification(message, type = 'info') {
        // Simple notification system - could be enhanced with a proper notification library
        console.log(`[${type}] ${message}`);
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add to DOM
        document.body.appendChild(notification);
        
        // Auto-remove after delay
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    updateUsersList(users) {
        const usersList = document.getElementById('users-list');
        if (!usersList) return;
        
        // Clear existing list
        usersList.innerHTML = '';
        
        // Store users
        this.users.clear();
        users.forEach(user => {
            this.users.set(user.id, user);
        });
        
        // Render user list
        users.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            if (user.id === this.socket.id) {
                userItem.classList.add('you');
            }
            
            const colorDiv = document.createElement('div');
            colorDiv.className = 'user-color';
            colorDiv.style.backgroundColor = user.color;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'user-name';
            nameSpan.textContent = user.id === this.socket.id ? `${user.name} (You)` : user.name;
            
            userItem.appendChild(colorDiv);
            userItem.appendChild(nameSpan);
            usersList.appendChild(userItem);
        });
    }
    
    updateCursorIndicator(userId, x, y, color) {
        const canvas = document.getElementById('canvas');
        const overlay = document.getElementById('cursor-overlay');
        if (!canvas || !overlay) return;
        
        // x and y are normalized (0-1), convert to canvas coordinates
        const rect = canvas.getBoundingClientRect();
        const canvasX = x * rect.width;
        const canvasY = y * rect.height;
        
        let indicator = this.cursorIndicators.get(userId);
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'cursor-indicator';
            indicator.style.borderColor = color;
            indicator.style.color = color;
            overlay.appendChild(indicator);
            this.cursorIndicators.set(userId, indicator);
        }
        
        // Position relative to canvas container
        const container = canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        const relativeX = canvasX;
        const relativeY = canvasY;
        
        indicator.style.left = `${relativeX}px`;
        indicator.style.top = `${relativeY}px`;
        indicator.style.opacity = '1';
        
        // Hide cursor after 2 seconds of no updates
        clearTimeout(indicator.hideTimeout);
        indicator.hideTimeout = setTimeout(() => {
            indicator.style.opacity = '0';
        }, 2000);
    }
    
    removeCursorIndicator(userId) {
        const indicator = this.cursorIndicators.get(userId);
        if (indicator) {
            indicator.remove();
            this.cursorIndicators.delete(userId);
        }
    }

    setupEventListeners() {
        const createBtn = document.getElementById('create-room');
        const joinBtn = document.getElementById('join-room');
        const roomIdInput = document.getElementById('room-id');
        
        if (createBtn) {
            createBtn.addEventListener('click', () => this.createRoom());
        }
        
        if (joinBtn) {
            joinBtn.addEventListener('click', () => {
                const roomId = roomIdInput ? roomIdInput.value.trim() : '';
                this.joinRoom(roomId);
            });
        }
        
        if (roomIdInput) {
            roomIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const roomId = roomIdInput.value.trim();
                    this.joinRoom(roomId);
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.wsClient = new WebSocketClient();
    window.wsClient.connect();
});

export default WebSocketClient;
