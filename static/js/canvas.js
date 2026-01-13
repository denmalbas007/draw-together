/**
 * Canvas Drawing Engine - Production Version
 * Handles all canvas rendering and drawing operations
 * Supports: brush, eraser, line, rectangle, circle, text, fill
 */

class DrawingCanvas {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        
        // Drawing state
        this.isDrawing = false;
        this.isPanning = false;
        this.currentStroke = null;
        this.strokes = [];
        this.undoStack = [];
        this.layers = [];
        this.currentLayerId = 'layer_0';
        
        // Tool settings
        this.brushSize = 5;
        this.brushColor = '#000000';
        this.tool = 'brush'; // brush, eraser, line, rect, circle, text, fill, picker
        
        // Canvas dimensions and transform
        this.width = 1200;
        this.height = 800;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        
        // Shape preview
        this.shapeStart = null;
        this.previewCanvas = document.createElement('canvas');
        this.previewCanvas.width = this.width;
        this.previewCanvas.height = this.height;
        this.previewCtx = this.previewCanvas.getContext('2d');
        
        // Text input state
        this.textInput = null;
        
        // Callbacks
        this.onStrokeComplete = null;
        this.onCursorMove = null;
        this.onColorPicked = null;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
        
        // Touch support
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        
        // Keyboard for panning
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.isDrawing) {
                this.canvas.style.cursor = 'grab';
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.canvas.style.cursor = 'crosshair';
                this.isPanning = false;
            }
        });
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: ((e.clientX - rect.left) * scaleX - this.panX) / this.zoom,
            y: ((e.clientY - rect.top) * scaleY - this.panY) / this.zoom
        };
    }
    
    handleMouseDown(e) {
        // Check for space key (panning)
        if (e.buttons === 1 && e.getModifierState('Space')) {
            this.isPanning = true;
            this.lastPanPos = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grabbing';
            return;
        }
        
        const pos = this.getMousePos(e);
        
        if (this.tool === 'picker') {
            this.pickColor(pos);
            return;
        }
        
        if (this.tool === 'text') {
            this.startTextInput(pos);
            return;
        }
        
        if (this.tool === 'fill') {
            this.floodFill(pos);
            return;
        }
        
        this.startStroke(pos);
    }
    
    handleMouseMove(e) {
        const pos = this.getMousePos(e);
        
        // Handle panning
        if (this.isPanning) {
            const dx = e.clientX - this.lastPanPos.x;
            const dy = e.clientY - this.lastPanPos.y;
            this.panX += dx;
            this.panY += dy;
            this.lastPanPos = { x: e.clientX, y: e.clientY };
            this.redraw();
            return;
        }
        
        // Emit cursor position
        if (this.onCursorMove) {
            this.onCursorMove(pos.x, pos.y);
        }
        
        if (this.isDrawing) {
            this.continueStroke(pos);
        }
    }
    
    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = 'crosshair';
            return;
        }
        this.endStroke();
    }
    
    handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.setZoom(this.zoom * delta);
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const mouseEvent = { clientX: touch.clientX, clientY: touch.clientY };
            const pos = this.getMousePos(mouseEvent);
            
            if (this.tool === 'picker') {
                this.pickColor(pos);
                return;
            }
            
            this.startStroke(pos);
        }
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const mouseEvent = { clientX: touch.clientX, clientY: touch.clientY };
            const pos = this.getMousePos(mouseEvent);
            if (this.isDrawing) {
                this.continueStroke(pos);
            }
        }
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        this.endStroke();
    }
    
    startStroke(pos) {
        this.isDrawing = true;
        
        if (['line', 'rect', 'circle'].includes(this.tool)) {
            this.shapeStart = pos;
            return;
        }
        
        this.currentStroke = {
            id: 'stroke_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            points: [pos],
            color: this.tool === 'eraser' ? '#FFFFFF' : this.brushColor,
            size: this.tool === 'eraser' ? this.brushSize * 3 : this.brushSize,
            layer_id: this.currentLayerId,
            tool: this.tool
        };
    }
    
    continueStroke(pos) {
        if (!this.isDrawing) return;
        
        // Shape preview
        if (['line', 'rect', 'circle'].includes(this.tool) && this.shapeStart) {
            this.lastShapeEnd = pos; // Save last position for shape completion
            this.redraw();
            this.drawShapePreview(this.shapeStart, pos);
            return;
        }
        
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
        if (!this.isDrawing) return;
        this.isDrawing = false;
        
        // Handle shape completion
        if (['line', 'rect', 'circle'].includes(this.tool) && this.shapeStart && this.lastShapeEnd) {
            const stroke = {
                id: 'shape_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                points: [this.shapeStart, this.lastShapeEnd],
                color: this.brushColor,
                size: this.brushSize,
                layer_id: this.currentLayerId,
                tool: this.tool
            };
            
            this.strokes.push(stroke);
            this.undoStack = [];
            this.redraw();
            
            if (this.onStrokeComplete) {
                this.onStrokeComplete(stroke);
            }
            
            this.shapeStart = null;
            this.lastShapeEnd = null;
            return;
        }
        
        if (!this.currentStroke) return;
        
        if (this.currentStroke.points.length > 0) {
            this.strokes.push(this.currentStroke);
            this.undoStack = []; // Clear redo stack on new action
            
            if (this.onStrokeComplete) {
                this.onStrokeComplete(this.currentStroke);
            }
        }
        
        this.currentStroke = null;
    }
    
    drawShapePreview(start, end) {
        this.ctx.save();
        this.ctx.strokeStyle = this.brushColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        if (this.tool === 'line') {
            this.ctx.beginPath();
            this.ctx.moveTo(start.x, start.y);
            this.ctx.lineTo(end.x, end.y);
            this.ctx.stroke();
        } else if (this.tool === 'rect') {
            this.ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        } else if (this.tool === 'circle') {
            const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            this.ctx.beginPath();
            this.ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        
        this.ctx.restore();
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
        if (!stroke.points || stroke.points.length < 1) return;
        
        this.ctx.save();
        this.ctx.strokeStyle = stroke.color;
        this.ctx.lineWidth = stroke.size;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        const tool = stroke.tool || 'brush';
        const start = stroke.points[0];
        const end = stroke.points.length > 1 ? stroke.points[stroke.points.length - 1] : start;
        
        // Handle different tool types
        if (tool === 'line' && stroke.points.length >= 2) {
            this.ctx.beginPath();
            this.ctx.moveTo(start.x, start.y);
            this.ctx.lineTo(end.x, end.y);
            this.ctx.stroke();
        } else if (tool === 'rect' && stroke.points.length >= 2) {
            this.ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        } else if (tool === 'circle' && stroke.points.length >= 2) {
            const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            this.ctx.beginPath();
            this.ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
            this.ctx.stroke();
        } else if (tool === 'text' && stroke.text) {
            this.ctx.font = `${stroke.size}px sans-serif`;
            this.ctx.fillStyle = stroke.color;
            this.ctx.fillText(stroke.text, start.x, start.y);
        } else if (stroke.points.length === 1) {
            // Single point - draw a dot
            this.ctx.beginPath();
            this.ctx.arc(start.x, start.y, stroke.size / 2, 0, Math.PI * 2);
            this.ctx.fillStyle = stroke.color;
            this.ctx.fill();
        } else {
            // Default: brush/eraser - draw path
            this.ctx.beginPath();
            this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            
            for (let i = 1; i < stroke.points.length; i++) {
                this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
            
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }
    
    addRemoteStroke(stroke) {
        this.strokes.push(stroke);
        this.drawFullStroke(stroke);
    }
    
    removeStroke(strokeId) {
        const index = this.strokes.findIndex(s => s.id === strokeId);
        if (index !== -1) {
            this.strokes.splice(index, 1);
            this.redraw();
        }
    }
    
    clearLayer(layerId) {
        this.strokes = this.strokes.filter(s => s.layer_id !== layerId);
        this.redraw();
    }
    
    redraw() {
        this.ctx.save();
        
        // Clear canvas
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Apply transform
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.zoom, this.zoom);
        
        // Group strokes by layer and draw in order
        const visibleLayers = this.layers.filter(l => l.visible).map(l => l.id);
        
        for (const stroke of this.strokes) {
            if (visibleLayers.length === 0 || visibleLayers.includes(stroke.layer_id)) {
                this.drawFullStroke(stroke);
            }
        }
        
        this.ctx.restore();
    }
    
    // ============= Tools =============
    
    pickColor(pos) {
        const imageData = this.ctx.getImageData(pos.x, pos.y, 1, 1);
        const [r, g, b] = imageData.data;
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        
        if (this.onColorPicked) {
            this.onColorPicked(hex);
        }
        
        this.brushColor = hex;
        this.setTool('brush');
    }
    
    floodFill(pos) {
        const imageData = this.ctx.getImageData(0, 0, this.width, this.height);
        const data = imageData.data;
        
        const startX = Math.floor(pos.x);
        const startY = Math.floor(pos.y);
        const startIdx = (startY * this.width + startX) * 4;
        
        const startColor = {
            r: data[startIdx],
            g: data[startIdx + 1],
            b: data[startIdx + 2],
            a: data[startIdx + 3]
        };
        
        // Parse fill color
        const fillColor = this.hexToRgb(this.brushColor);
        
        // Don't fill if same color
        if (startColor.r === fillColor.r && 
            startColor.g === fillColor.g && 
            startColor.b === fillColor.b) {
            return;
        }
        
        const stack = [[startX, startY]];
        const visited = new Set();
        
        while (stack.length > 0 && stack.length < 100000) {
            const [x, y] = stack.pop();
            const key = `${x},${y}`;
            
            if (visited.has(key)) continue;
            if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
            
            const idx = (y * this.width + x) * 4;
            
            if (data[idx] !== startColor.r ||
                data[idx + 1] !== startColor.g ||
                data[idx + 2] !== startColor.b) {
                continue;
            }
            
            visited.add(key);
            
            data[idx] = fillColor.r;
            data[idx + 1] = fillColor.g;
            data[idx + 2] = fillColor.b;
            data[idx + 3] = 255;
            
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        
        this.ctx.putImageData(imageData, 0, 0);
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }
    
    startTextInput(pos) {
        if (this.textInput) {
            document.body.removeChild(this.textInput);
        }
        
        const input = document.createElement('input');
        input.type = 'text';
        input.style.cssText = `
            position: fixed;
            left: ${pos.x}px;
            top: ${pos.y}px;
            font-size: ${this.brushSize * 3}px;
            font-family: sans-serif;
            border: 2px solid #7c3aed;
            padding: 4px 8px;
            outline: none;
            background: white;
            color: ${this.brushColor};
            z-index: 1000;
        `;
        
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                this.drawText(pos, input.value);
                document.body.removeChild(input);
                this.textInput = null;
            } else if (e.key === 'Escape') {
                document.body.removeChild(input);
                this.textInput = null;
            }
        };
        
        document.body.appendChild(input);
        input.focus();
        this.textInput = input;
    }
    
    drawText(pos, text) {
        if (!text) return;
        
        this.ctx.font = `${this.brushSize * 3}px sans-serif`;
        this.ctx.fillStyle = this.brushColor;
        this.ctx.fillText(text, pos.x, pos.y);
        
        // Create stroke for syncing
        const stroke = {
            id: 'text_' + Date.now(),
            points: [pos],
            color: this.brushColor,
            size: this.brushSize * 3,
            layer_id: this.currentLayerId,
            tool: 'text',
            text: text
        };
        
        this.strokes.push(stroke);
        
        if (this.onStrokeComplete) {
            this.onStrokeComplete(stroke);
        }
    }
    
    // ============= Layer Management =============
    
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
            return layer.visible;
        }
        return null;
    }
    
    loadStrokes(strokes) {
        this.strokes = strokes;
        this.redraw();
    }
    
    // ============= Undo/Redo =============
    
    undo() {
        if (this.strokes.length > 0) {
            const stroke = this.strokes.pop();
            this.undoStack.push(stroke);
            this.redraw();
            return stroke;
        }
        return null;
    }
    
    redo() {
        if (this.undoStack.length > 0) {
            const stroke = this.undoStack.pop();
            this.strokes.push(stroke);
            this.redraw();
            return stroke;
        }
        return null;
    }
    
    // ============= Zoom/Pan =============
    
    setZoom(level) {
        this.zoom = Math.max(0.25, Math.min(4, level));
        this.redraw();
        return this.zoom;
    }
    
    zoomIn() {
        return this.setZoom(this.zoom * 1.25);
    }
    
    zoomOut() {
        return this.setZoom(this.zoom / 1.25);
    }
    
    resetView() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.redraw();
    }
    
    // ============= Export =============
    
    exportToPNG() {
        // Create a clean export without transform
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = this.width;
        exportCanvas.height = this.height;
        const exportCtx = exportCanvas.getContext('2d');
        
        exportCtx.fillStyle = '#FFFFFF';
        exportCtx.fillRect(0, 0, this.width, this.height);
        
        for (const stroke of this.strokes) {
            exportCtx.save();
            exportCtx.strokeStyle = stroke.color;
            exportCtx.lineWidth = stroke.size;
            exportCtx.lineCap = 'round';
            exportCtx.lineJoin = 'round';
            
            const tool = stroke.tool || 'brush';
            const start = stroke.points[0];
            const end = stroke.points.length > 1 ? stroke.points[stroke.points.length - 1] : start;
            
            if (tool === 'line' && stroke.points.length >= 2) {
                exportCtx.beginPath();
                exportCtx.moveTo(start.x, start.y);
                exportCtx.lineTo(end.x, end.y);
                exportCtx.stroke();
            } else if (tool === 'rect' && stroke.points.length >= 2) {
                exportCtx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
            } else if (tool === 'circle' && stroke.points.length >= 2) {
                const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
                exportCtx.beginPath();
                exportCtx.arc(start.x, start.y, radius, 0, Math.PI * 2);
                exportCtx.stroke();
            } else if (tool === 'text' && stroke.text) {
                exportCtx.font = `${stroke.size}px sans-serif`;
                exportCtx.fillStyle = stroke.color;
                exportCtx.fillText(stroke.text, start.x, start.y);
            } else if (stroke.points.length === 1) {
                exportCtx.beginPath();
                exportCtx.arc(start.x, start.y, stroke.size / 2, 0, Math.PI * 2);
                exportCtx.fillStyle = stroke.color;
                exportCtx.fill();
            } else {
                exportCtx.beginPath();
                exportCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
                for (let i = 1; i < stroke.points.length; i++) {
                    exportCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
                }
                exportCtx.stroke();
            }
            exportCtx.restore();
        }
        
        return exportCanvas.toDataURL('image/png');
    }
    
    getThumbnail(size = 200) {
        const thumbCanvas = document.createElement('canvas');
        const ratio = this.width / this.height;
        thumbCanvas.width = size;
        thumbCanvas.height = size / ratio;
        const thumbCtx = thumbCanvas.getContext('2d');
        thumbCtx.drawImage(this.canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        return thumbCanvas.toDataURL('image/jpeg', 0.7);
    }
    
    // ============= Settings =============
    
    setBrushSize(size) {
        this.brushSize = size;
    }
    
    setBrushColor(color) {
        this.brushColor = color;
    }
    
    setTool(tool) {
        this.tool = tool;
        
        // Update cursor
        switch (tool) {
            case 'picker':
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'text':
                this.canvas.style.cursor = 'text';
                break;
            case 'fill':
                this.canvas.style.cursor = 'cell';
                break;
            default:
                this.canvas.style.cursor = 'crosshair';
        }
    }
}

// Export for use
window.DrawingCanvas = DrawingCanvas;
