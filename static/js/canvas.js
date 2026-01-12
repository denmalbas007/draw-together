/**
 * Canvas Drawing Engine
 * Handles all canvas rendering and drawing operations
 */

class DrawingCanvas {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        
        // Drawing state
        this.isDrawing = false;
        this.currentStroke = null;
        this.strokes = [];
        this.layers = [];
        this.currentLayerId = 'layer_0';
        
        // Tool settings
        this.brushSize = 5;
        this.brushColor = '#000000';
        this.tool = 'brush'; // brush, eraser
        
        // Canvas dimensions
        this.width = 1200;
        this.height = 800;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        
        // Hidden layer canvases
        this.layerCanvases = {};
        
        // Callbacks
        this.onStrokeComplete = null;
        this.onCursorMove = null;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
        
        // Touch support
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }
    
    handleMouseDown(e) {
        const pos = this.getMousePos(e);
        this.startStroke(pos);
    }
    
    handleMouseMove(e) {
        const pos = this.getMousePos(e);
        
        // Emit cursor position
        if (this.onCursorMove) {
            this.onCursorMove(pos.x, pos.y);
        }
        
        if (this.isDrawing) {
            this.continueStroke(pos);
        }
    }
    
    handleMouseUp(e) {
        this.endStroke();
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = { clientX: touch.clientX, clientY: touch.clientY };
        const pos = this.getMousePos(mouseEvent);
        this.startStroke(pos);
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = { clientX: touch.clientX, clientY: touch.clientY };
        const pos = this.getMousePos(mouseEvent);
        if (this.isDrawing) {
            this.continueStroke(pos);
        }
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        this.endStroke();
    }
    
    startStroke(pos) {
        this.isDrawing = true;
        this.currentStroke = {
            id: 'stroke_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            points: [pos],
            color: this.tool === 'eraser' ? '#FFFFFF' : this.brushColor,
            size: this.tool === 'eraser' ? this.brushSize * 3 : this.brushSize,
            layer_id: this.currentLayerId
        };
    }
    
    continueStroke(pos) {
        if (!this.currentStroke) return;
        
        this.currentStroke.points.push(pos);
        this.drawStrokeSegment(
            this.currentStroke.points[this.currentStroke.points.length - 2],
            pos,
            this.currentStroke.color,
            this.currentStroke.size
        );
    }
    
    endStroke() {
        if (!this.isDrawing || !this.currentStroke) return;
        
        this.isDrawing = false;
        
        if (this.currentStroke.points.length > 0) {
            this.strokes.push(this.currentStroke);
            
            if (this.onStrokeComplete) {
                this.onStrokeComplete(this.currentStroke);
            }
        }
        
        this.currentStroke = null;
    }
    
    drawStrokeSegment(from, to, color, size) {
        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = size;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
    }
    
    drawFullStroke(stroke) {
        if (stroke.points.length < 2) {
            // Single point - draw a dot
            if (stroke.points.length === 1) {
                this.ctx.beginPath();
                this.ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
                this.ctx.fillStyle = stroke.color;
                this.ctx.fill();
            }
            return;
        }
        
        this.ctx.beginPath();
        this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        
        for (let i = 1; i < stroke.points.length; i++) {
            this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        
        this.ctx.strokeStyle = stroke.color;
        this.ctx.lineWidth = stroke.size;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
    }
    
    addRemoteStroke(stroke) {
        this.strokes.push(stroke);
        this.drawFullStroke(stroke);
    }
    
    removeStroke(strokeId) {
        this.strokes = this.strokes.filter(s => s.id !== strokeId);
        this.redraw();
    }
    
    clearLayer(layerId) {
        this.strokes = this.strokes.filter(s => s.layer_id !== layerId);
        this.redraw();
    }
    
    redraw() {
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Group strokes by layer and draw in order
        const visibleLayers = this.layers.filter(l => l.visible).map(l => l.id);
        
        for (const stroke of this.strokes) {
            if (visibleLayers.length === 0 || visibleLayers.includes(stroke.layer_id)) {
                this.drawFullStroke(stroke);
            }
        }
    }
    
    setLayers(layers) {
        this.layers = layers;
        if (layers.length > 0 && !layers.find(l => l.id === this.currentLayerId)) {
            this.currentLayerId = layers[0].id;
        }
    }
    
    addLayer(layer) {
        this.layers.push(layer);
    }
    
    setCurrentLayer(layerId) {
        this.currentLayerId = layerId;
    }
    
    toggleLayerVisibility(layerId) {
        const layer = this.layers.find(l => l.id === layerId);
        if (layer) {
            layer.visible = !layer.visible;
            this.redraw();
        }
    }
    
    loadStrokes(strokes) {
        this.strokes = strokes;
        this.redraw();
    }
    
    undo() {
        // Find last stroke by current user (handled by app.js)
        return this.strokes.length > 0;
    }
    
    exportToPNG() {
        return this.canvas.toDataURL('image/png');
    }
    
    setBrushSize(size) {
        this.brushSize = size;
    }
    
    setBrushColor(color) {
        this.brushColor = color;
    }
    
    setTool(tool) {
        this.tool = tool;
    }
}

// Export for use
window.DrawingCanvas = DrawingCanvas;

