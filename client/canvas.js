class DrawingCanvas {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.tool = 'pencil';
        this.color = '#000000';
        this.size = 5;
        this.drawingHistory = [];
        this.historyIndex = -1;
        this.strokeBoundaries = [];
        this.remoteDrawingUsers = new Map();
        this.pendingRemoteStrokeSave = false;
        this.currentStroke = null;
        this.cursorUpdateThrottle = 50;
        this.lastCursorUpdate = 0;

        this.setupEventListeners();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(rect.width * ratio);
        this.canvas.height = Math.floor(rect.height * ratio);
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.redraw();
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', (e) => {
            this.draw(e);
            this.updateCursorPosition(e);
        });
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', (e) => {
            this.stopDrawing(e);
            this.hideCursor();
        });

        this.canvas.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
            e.preventDefault();
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
            e.preventDefault();
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            const mouseEvent = new MouseEvent('mouseup');
            this.canvas.dispatchEvent(mouseEvent);
            e.preventDefault();
        }, { passive: false });

        ['touchstart','touchend','touchmove'].forEach(evt => {
            document.body.addEventListener(evt, (e) => {
                if (e.target === this.canvas) e.preventDefault();
            }, { passive: false });
        });
    }

    saveState(force = false, isAfterStroke = false) {
        if (!force && this.historyIndex >= 0 && this.historyIndex === this.drawingHistory.length - 1) {
            const currentState = this.canvas.toDataURL();
            const lastState = this.drawingHistory[this.historyIndex];
            if (currentState === lastState) return;
        }

        this.drawingHistory = this.drawingHistory.slice(0, this.historyIndex + 1);
        this.strokeBoundaries = this.strokeBoundaries.filter(b => b.index <= this.historyIndex);
        const data = this.canvas.toDataURL();
        this.drawingHistory.push(data);
        this.historyIndex++;
        if (isAfterStroke) this.strokeBoundaries.push({ index: this.historyIndex, isAfterStroke: true });

        const MAX_HISTORY = 50;
        if (this.drawingHistory.length > MAX_HISTORY) {
            const removedCount = this.drawingHistory.length - MAX_HISTORY;
            this.drawingHistory.shift();
            this.historyIndex -= removedCount;
            this.strokeBoundaries = this.strokeBoundaries
                .map(b => ({ ...b, index: b.index - removedCount }))
                .filter(b => b.index >= 0);
        }
    }

    startDrawing(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.isDrawing = true;
        this.lastX = x;
        this.lastY = y;
        this.saveState(true);
        this.currentStroke = {
            type: this.tool,
            color: this.color,
            size: this.size,
            points: [{ x, y }]
        };
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        if (this.tool === 'pencil') {
            this.ctx.lineTo(this.lastX, this.lastY);
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.size;
            this.ctx.stroke();
        }
        if (window.socket) {
            window.socket.emit('draw', {
                type: 'stroke_begin',
                fromX: this.lastX / this.canvas.width,
                fromY: this.lastY / this.canvas.height,
                tool: this.tool,
                color: this.color,
                size: this.size
            });
        }
    }

    draw(e) {
        if (!this.isDrawing) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.tool === 'pencil') {
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.size;
            this.ctx.moveTo(this.lastX, this.lastY);
            this.ctx.lineTo(x, y);
            this.ctx.stroke();
        } else if (this.tool === 'eraser') {
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.lineWidth = this.size * 2;
            this.ctx.beginPath();
            this.ctx.moveTo(this.lastX, this.lastY);
            this.ctx.lineTo(x, y);
            this.ctx.stroke();
            this.ctx.restore();
        }
        
        if (this.currentStroke) this.currentStroke.points.push({ x, y });

        if (window.socket) {
            window.socket.emit('draw', {
                type: 'draw',
                fromX: this.lastX / this.canvas.width,
                fromY: this.lastY / this.canvas.height,
                toX: x / this.canvas.width,
                toY: y / this.canvas.height,
                tool: this.tool,
                color: this.color,
                size: this.size
            });
        }

        this.lastX = x;
        this.lastY = y;
    }

    stopDrawing() {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        if (this.currentStroke && this.currentStroke.points.length > 0) {
            this.saveState(true, true);
            this.currentStroke = null;
        }
        if (this.pendingRemoteStrokeSave) {
            this.saveState(true, false);
            this.pendingRemoteStrokeSave = false;
        }
        if (window.socket) window.socket.emit('draw', { type: 'stroke_end' });
    }

    updateCursorPosition(e) {
        const now = Date.now();
        if (now - this.lastCursorUpdate < this.cursorUpdateThrottle) return;
        this.lastCursorUpdate = now;
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        if (window.socket && window.socket.connected) window.socket.emit('cursor_move', { x, y });
    }

    hideCursor() {
        if (window.socket && window.socket.connected) window.socket.emit('cursor_move', { x: -1, y: -1 });
    }

    clearCanvas() {
        if (window.socket) window.socket.emit('draw', { type: 'clear' });
    }

    undo() {
        if (window.socket) window.socket.emit('draw', { type: 'undo' });
    }

    redo() {
        if (window.socket) window.socket.emit('draw', { type: 'redo' });
    }

    redraw() {
        if (this.historyIndex < 0) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        const img = new Image();
        img.onload = () => {
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            const ratio = window.devicePixelRatio || 1;
            this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            this.ctx.restore();
        };
        img.src = this.drawingHistory[this.historyIndex];
    }

    handleIncomingDraw(data) {
        const { type, userId } = data;

        if (type === 'clear') {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.saveState();
            return;
        } 
        
        if (type === 'undo') {
            if (this.historyIndex < 0) return;
            let targetIndex = -1;
            for (let i = this.strokeBoundaries.length - 1; i >= 0; i--) {
                const boundary = this.strokeBoundaries[i];
                if (boundary.index <= this.historyIndex && boundary.isAfterStroke) {
                    targetIndex = boundary.index - 1;
                    break;
                }
            }
            if (targetIndex < 0) targetIndex = Math.max(-1, this.historyIndex - 1);
            if (this.strokeBoundaries.length > 0 && this.strokeBoundaries[this.strokeBoundaries.length - 1].index > targetIndex) {
                this.strokeBoundaries.pop();
            }
            this.historyIndex = targetIndex;
            if (this.historyIndex < 0) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            else this.redraw();
            return;
        }
        
        if (type === 'redo') {
            if (this.historyIndex < this.drawingHistory.length - 1) {
                this.historyIndex++;
                this.redraw();
            }
            return;
        }

        if (type === 'draw') {
            const { fromX, fromY, toX, toY, tool, color, size } = data;
            const scaledFromX = fromX * this.canvas.width;
            const scaledFromY = fromY * this.canvas.height;
            const scaledToX = toX * this.canvas.width;
            const scaledToY = toY * this.canvas.height;
            if (tool === 'eraser') {
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'destination-out';
                this.ctx.lineWidth = size * 2;
                this.ctx.beginPath();
                this.ctx.moveTo(scaledFromX, scaledFromY);
                this.ctx.lineTo(scaledToX, scaledToY);
                this.ctx.stroke();
                this.ctx.restore();
            } else {
                this.ctx.beginPath();
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = size;
                this.ctx.moveTo(scaledFromX, scaledFromY);
                this.ctx.lineTo(scaledToX, scaledToY);
                this.ctx.stroke();
            }
            return;
        }

        if (type === 'stroke_begin') {
            if (!this.remoteDrawingUsers.has(userId)) {
                this.remoteDrawingUsers.set(userId, { tool: data.tool, color: data.color, size: data.size });
                if (this.isDrawing) this.pendingRemoteStrokeSave = true;
                else this.saveState(true);
            }
            return;
        }
        if (type === 'stroke_end') {
            this.remoteDrawingUsers.delete(userId);
            setTimeout(() => this.saveState(true, true), 10);
            return;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.canvas = new DrawingCanvas();
});
export default DrawingCanvas;