/**
 * Main Application Logic
 * Handles WebSocket connection and UI interactions
 */

let drawingCanvas = null;
let ws = null;
let userId = null;
let nickname = null;
let currentRoom = null;
let userCursors = {};
let userColors = {};

function initApp(roomId) {
    currentRoom = roomId;
    userId = localStorage.getItem('userId') || crypto.randomUUID();
    nickname = localStorage.getItem('nickname') || 'Artist_' + Math.random().toString(36).substr(2, 4);
    
    localStorage.setItem('userId', userId);
    
    // Initialize canvas
    const canvasEl = document.getElementById('main-canvas');
    drawingCanvas = new DrawingCanvas(canvasEl);
    
    // Set up callbacks
    drawingCanvas.onStrokeComplete = handleStrokeComplete;
    drawingCanvas.onCursorMove = handleCursorMove;
    
    // Connect WebSocket
    connectWebSocket();
    
    // Set up UI
    setupUI();
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${currentRoom}?user_id=${userId}&nickname=${encodeURIComponent(nickname)}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        updateConnectionStatus('connected');
        console.log('Connected to room:', currentRoom);
    };
    
    ws.onclose = () => {
        updateConnectionStatus('disconnected');
        console.log('Disconnected from room');
        // Try to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
}

function handleServerMessage(data) {
    switch (data.type) {
        case 'init':
            handleInit(data);
            break;
        case 'stroke':
            handleRemoteStroke(data.stroke);
            break;
        case 'remove_stroke':
            drawingCanvas.removeStroke(data.stroke_id);
            break;
        case 'user_joined':
            updateUsersList(data.users);
            showNotification(`${data.nickname} joined the room`);
            break;
        case 'user_left':
            updateUsersList(data.users);
            removeCursor(data.user_id);
            showNotification(`${data.nickname} left the room`);
            break;
        case 'cursor':
            updateRemoteCursor(data.user_id, data.x, data.y);
            break;
        case 'layer_added':
            drawingCanvas.addLayer(data.layer);
            renderLayersPanel();
            break;
        case 'layer_cleared':
            drawingCanvas.clearLayer(data.layer_id);
            break;
    }
}

function handleInit(data) {
    const room = data.room;
    
    // Set layers
    drawingCanvas.setLayers(room.layers);
    renderLayersPanel();
    
    // Load existing strokes
    drawingCanvas.loadStrokes(room.strokes);
    
    // Update users
    updateUsersList(data.users);
    
    // Assign colors to users
    data.users.forEach((user, i) => {
        userColors[user.id] = getColorForIndex(i);
    });
}

function handleStrokeComplete(stroke) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'stroke',
            id: stroke.id,
            points: stroke.points,
            color: stroke.color,
            size: stroke.size,
            layer_id: stroke.layer_id
        }));
    }
}

function handleRemoteStroke(stroke) {
    drawingCanvas.addRemoteStroke(stroke);
}

function handleCursorMove(x, y) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'cursor',
            x: Math.round(x),
            y: Math.round(y)
        }));
    }
}

function updateRemoteCursor(remoteUserId, x, y) {
    if (remoteUserId === userId) return;
    
    let cursor = document.getElementById(`cursor-${remoteUserId}`);
    const cursorsLayer = document.getElementById('cursors-layer');
    
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = `cursor-${remoteUserId}`;
        cursor.className = 'user-cursor';
        cursor.style.background = userColors[remoteUserId] || getColorForIndex(Object.keys(userCursors).length);
        
        // Get nickname for this user
        const usersListItems = document.querySelectorAll('#users-list li');
        let userName = 'User';
        usersListItems.forEach(li => {
            if (li.dataset.userId === remoteUserId) {
                userName = li.textContent;
            }
        });
        cursor.setAttribute('data-name', userName);
        
        cursorsLayer.appendChild(cursor);
    }
    
    // Position relative to canvas
    const canvas = document.getElementById('main-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    
    cursor.style.left = `${x * scaleX}px`;
    cursor.style.top = `${y * scaleY}px`;
    
    userCursors[remoteUserId] = { x, y };
}

function removeCursor(remoteUserId) {
    const cursor = document.getElementById(`cursor-${remoteUserId}`);
    if (cursor) {
        cursor.remove();
    }
    delete userCursors[remoteUserId];
}

function updateUsersList(users) {
    const list = document.getElementById('users-list');
    list.innerHTML = users.map(user => {
        const isMe = user.id === userId;
        return `<li data-user-id="${user.id}">${user.nickname}${isMe ? ' (you)' : ''}</li>`;
    }).join('');
    
    // Update colors
    users.forEach((user, i) => {
        userColors[user.id] = getColorForIndex(i);
    });
}

function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connection-status');
    statusEl.className = 'connection-status ' + status;
    statusEl.querySelector('.status-text').textContent = 
        status === 'connected' ? 'Connected' : 
        status === 'disconnected' ? 'Disconnected' : 'Connecting...';
}

function showNotification(message) {
    console.log('Notification:', message);
    // Could add a toast notification here
}

function getColorForIndex(index) {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
        '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
    ];
    return colors[index % colors.length];
}

function setupUI() {
    // Brush size
    const brushSizeInput = document.getElementById('brush-size');
    const sizeDisplay = document.getElementById('size-display');
    brushSizeInput.addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        drawingCanvas.setBrushSize(size);
        sizeDisplay.textContent = size + 'px';
    });
    
    // Color picker
    const colorPicker = document.getElementById('brush-color');
    colorPicker.addEventListener('input', (e) => {
        drawingCanvas.setBrushColor(e.target.value);
    });
    
    // Color presets
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const color = btn.dataset.color;
            drawingCanvas.setBrushColor(color);
            colorPicker.value = color;
        });
    });
    
    // Tools
    document.getElementById('tool-brush').addEventListener('click', () => {
        drawingCanvas.setTool('brush');
        document.getElementById('tool-brush').classList.add('active');
        document.getElementById('tool-eraser').classList.remove('active');
    });
    
    document.getElementById('tool-eraser').addEventListener('click', () => {
        drawingCanvas.setTool('eraser');
        document.getElementById('tool-eraser').classList.add('active');
        document.getElementById('tool-brush').classList.remove('active');
    });
    
    // Undo
    document.getElementById('undo-btn').addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'undo' }));
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'undo' }));
            }
        }
    });
    
    // Clear layer
    document.getElementById('clear-btn').addEventListener('click', () => {
        if (confirm('Clear current layer?')) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                    type: 'clear_layer', 
                    layer_id: drawingCanvas.currentLayerId 
                }));
            }
            drawingCanvas.clearLayer(drawingCanvas.currentLayerId);
        }
    });
    
    // Add layer
    document.getElementById('add-layer-btn').addEventListener('click', () => {
        const name = prompt('Layer name:', 'Layer ' + (drawingCanvas.layers.length + 1));
        if (name) {
            const layerId = 'layer_' + Date.now();
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                    type: 'add_layer',
                    id: layerId,
                    name: name
                }));
            }
            drawingCanvas.addLayer({ id: layerId, name: name, visible: true, order: drawingCanvas.layers.length });
            renderLayersPanel();
        }
    });
    
    // Save
    document.getElementById('save-btn').addEventListener('click', async () => {
        const response = await fetch(`/api/rooms/${currentRoom}/save`, { method: 'POST' });
        if (response.ok) {
            showNotification('Saved!');
            alert('Drawing saved!');
        }
    });
    
    // Export
    document.getElementById('export-btn').addEventListener('click', () => {
        const dataUrl = drawingCanvas.exportToPNG();
        const link = document.createElement('a');
        link.download = `drawing-${currentRoom}-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
    });
}

function renderLayersPanel() {
    const panel = document.getElementById('layers-panel');
    panel.innerHTML = drawingCanvas.layers.map(layer => `
        <div class="layer-item ${layer.id === drawingCanvas.currentLayerId ? 'active' : ''}" 
             data-layer-id="${layer.id}">
            <input type="checkbox" ${layer.visible ? 'checked' : ''} 
                   onclick="toggleLayer('${layer.id}', event)">
            <span class="layer-name">${layer.name}</span>
        </div>
    `).join('');
    
    panel.querySelectorAll('.layer-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                const layerId = item.dataset.layerId;
                drawingCanvas.setCurrentLayer(layerId);
                renderLayersPanel();
            }
        });
    });
}

function toggleLayer(layerId, event) {
    event.stopPropagation();
    drawingCanvas.toggleLayerVisibility(layerId);
}

// Export for global access
window.initApp = initApp;
window.toggleLayer = toggleLayer;

