import DrawingCanvas from './canvas.js';
import WebSocketClient from './websocket.js';

class App {
    constructor() {
        this.canvas = new DrawingCanvas();
        this.wsClient = new WebSocketClient();
        this.setupUI();
        window.app = this;
    }
    
    setupUI() {
        const tools = document.querySelectorAll('.tool');
        tools.forEach(tool => {
            tool.addEventListener('click', () => {
                tools.forEach(t => t.classList.remove('active'));
                tool.classList.add('active');
                const toolId = tool.id;
                if (toolId === 'pencil' || toolId === 'eraser') {
                    this.canvas.tool = toolId;
                }
            });
        });
        
        const colorPicker = document.getElementById('color');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.canvas.color = e.target.value;
            });
        }
        
        const sizeSlider = document.getElementById('size');
        const sizeValue = document.getElementById('size-value');
        if (sizeSlider && sizeValue) {
            sizeSlider.addEventListener('input', (e) => {
                const size = e.target.value;
                this.canvas.size = size;
                sizeValue.textContent = `${size}px`;
            });
        }
        
        const clearBtn = document.getElementById('clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear the canvas? This cannot be undone.')) {
                    this.canvas.clearCanvas();
                }
            });
        }
        
        const undoBtn = document.getElementById('undo');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => this.canvas.undo());
        }
        
        const redoBtn = document.getElementById('redo');
        if (redoBtn) {
            redoBtn.addEventListener('click', () => this.canvas.redo());
        }
        
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) {
                    this.canvas.redo(); 
                } else {
                    this.canvas.undo();
                }
                e.preventDefault();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                this.canvas.clearCanvas();
                e.preventDefault();
            }
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        this.canvas.tool = 'pencil';
                        document.getElementById('pencil').classList.add('active');
                        document.getElementById('eraser').classList.remove('active');
                        break;
                    case 'e':
                        this.canvas.tool = 'eraser';
                        document.getElementById('eraser').classList.add('active');
                        document.getElementById('pencil').classList.remove('active');
                        break;
                }
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
});