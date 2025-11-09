class DrawingState {
    constructor() {
        this.operations = [];
        this.strokes = [];
        this.undoneStrokes = [];
        this.canvasState = null;
        this.maxOperations = 1000;
        this.currentStroke = null;
    }

    addOperation(operation) {
        this.operations.push(operation);

        if (operation.type !== 'undo' && operation.type !== 'redo') {
            this.undoneStrokes = [];
        }

        if (operation.type === 'stroke_begin') {
            this.currentStroke = {
                userId: operation.userId,
                operations: [],
                timestamp: operation.timestamp || Date.now()
            };
        } else if (operation.type === 'stroke_end') {
            if (this.currentStroke) {
                this.strokes.push(this.currentStroke);
                this.currentStroke = null;
            }
        } else if (operation.type === 'draw' && this.currentStroke) {
            this.currentStroke.operations.push(operation);
        } else if (operation.type === 'clear') {
            this.strokes = [];
            this.operations = [];
            this.undoneStrokes = [];
            this.strokes.push({
                userId: operation.userId,
                type: 'clear',
                timestamp: operation.timestamp || Date.now()
            });
        }

        if (this.operations.length > this.maxOperations) {
            this.operations = this.operations.slice(-this.maxOperations);
        }

        if (this.strokes.length > 100) {
            this.strokes = this.strokes.slice(-100);
        }
    }

    getStrokes() {
        return this.strokes;
    }

    undoLastStroke() {
        if (this.strokes.length === 0) return null;
        const removed = this.strokes.pop();
        this.undoneStrokes.push(removed);
        return removed;
    }

    redoLastStroke() {
        if (this.undoneStrokes.length === 0) return null;
        const restored = this.undoneStrokes.pop();
        this.strokes.push(restored);
        return restored;
    }

    removeLastStroke() {
        if (this.strokes.length > 0) {
            return this.strokes.pop();
        }
        return null;
    }

    addStrokeBack(stroke) {
        this.strokes.push(stroke);
    }

    getOperations() {
        return this.operations;
    }

    getOperationsSince(timestamp) {
        return this.operations.filter(op => op.timestamp > timestamp);
    }

    updateCanvasState(imageData) {
        this.canvasState = imageData;
    }

    getCanvasState() {
        return this.canvasState;
    }

    clear() {
        this.operations = [];
        this.canvasState = null;
    }

    getSummary() {
        return {
            operationCount: this.operations.length,
            lastOperation: this.operations.length > 0 ? this.operations[this.operations.length - 1] : null,
            hasCanvasState: this.canvasState !== null
        };
    }
}

module.exports = DrawingState;