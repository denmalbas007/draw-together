/**
 * DrawTogether - Main Application Logic
 * Production Version with Advanced Features
 */

let drawingCanvas = null;
let ws = null;
let userId = null;
let nickname = null;
let currentRoom = null;
let myColor = '#888888';
let userCursors = {};
let currentTheme = 'dark';
let timerInterval = null;
let soundEnabled = true;

// Audio context for sounds
let audioCtx = null;

function initApp(roomId) {
    currentRoom = roomId;
    userId = localStorage.getItem('userId') || crypto.randomUUID();
    nickname = localStorage.getItem('nickname') || 'Artist_' + Math.random().toString(36).substr(2, 4);
    
    localStorage.setItem('userId', userId);
    
    // Initialize audio
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.log('Audio not supported');
    }
    
    // Initialize canvas
    const canvasEl = document.getElementById('main-canvas');
    drawingCanvas = new DrawingCanvas(canvasEl);
    
    // Set up callbacks
    drawingCanvas.onStrokeComplete = handleStrokeComplete;
    drawingCanvas.onCursorMove = throttle(handleCursorMove, 50);
    drawingCanvas.onColorPicked = handleColorPicked;
    
    // Connect WebSocket
    connectWebSocket();
    
    // Set up UI
    setupUI();
    setupKeyboardShortcuts();
    loadTheme();
    
    // Load stickers
    loadStickers();
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const password = localStorage.getItem('room_password_' + currentRoom) || '';
    const wsUrl = `${protocol}//${window.location.host}/ws/${currentRoom}?user_id=${userId}&nickname=${encodeURIComponent(nickname)}&password=${encodeURIComponent(password)}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        updateConnectionStatus('connected');
        showToast('Connected to room', 'success');
    };
    
    ws.onclose = () => {
        updateConnectionStatus('disconnected');
        showToast('Disconnected. Reconnecting...', 'warning');
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
            playSound('draw');
            break;
        case 'remove_stroke':
            drawingCanvas.removeStroke(data.stroke_id);
            break;
        case 'user_joined':
            updateUsersList(data.users);
            showToast(`${data.nickname} joined`, 'info');
            playSound('join');
            break;
        case 'user_left':
            updateUsersList(data.users);
            removeCursor(data.user_id);
            showToast(`${data.nickname} left`, 'info');
            break;
        case 'cursor':
            updateRemoteCursor(data.user_id, data.x, data.y, data.color);
            break;
        case 'chat':
            addChatMessage(data.message);
            playSound('message');
            break;
        case 'layer_added':
            drawingCanvas.addLayer(data.layer);
            renderLayersPanel();
            break;
        case 'layer_cleared':
            drawingCanvas.clearLayer(data.layer_id);
            break;
        case 'timer_started':
            startTimerDisplay(data.timer_end, data.duration);
            showToast(`Timer started: ${formatTime(data.duration)}`, 'info');
            break;
        case 'timer_stopped':
            stopTimerDisplay();
            showToast('Timer stopped', 'info');
            break;
        case 'reaction':
            showReaction(data.emoji, data.x, data.y);
            break;
        case 'error':
            showToast(data.message, 'error');
            if (data.message.includes('password')) {
                promptPassword();
            }
            break;
    }
}

function handleInit(data) {
    const room = data.room;
    myColor = data.your_color;
    
    // Set layers
    drawingCanvas.setLayers(room.layers);
    renderLayersPanel();
    
    // Load existing strokes
    drawingCanvas.loadStrokes(room.strokes);
    
    // Update users
    updateUsersList(data.users);
    
    // Load chat history
    if (room.chat_messages) {
        room.chat_messages.forEach(msg => addChatMessage(msg, false));
    }
    
    // Check timer
    if (room.timer_end && room.timer_end > Date.now() / 1000) {
        startTimerDisplay(room.timer_end, room.timer_end - Date.now() / 1000);
    }
    
    // Update stats
    if (data.stats) {
        updateStats(data.stats);
    }
}

function handleStrokeComplete(stroke) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'stroke',
            id: stroke.id,
            points: stroke.points,
            color: stroke.color,
            size: stroke.size,
            layer_id: stroke.layer_id,
            tool: stroke.tool
        }));
        
        // Save thumbnail periodically
        saveThumbnail();
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

function handleColorPicked(color) {
    document.getElementById('brush-color').value = color;
    showToast(`Color picked: ${color}`, 'success');
}

function updateRemoteCursor(remoteUserId, x, y, color) {
    if (remoteUserId === userId) return;
    
    let cursor = document.getElementById(`cursor-${remoteUserId}`);
    const cursorsLayer = document.getElementById('cursors-layer');
    
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = `cursor-${remoteUserId}`;
        cursor.className = 'user-cursor';
        cursor.style.background = color || '#888';
        
        // Get nickname
        const usersListItems = document.querySelectorAll('#users-list li');
        let userName = 'User';
        usersListItems.forEach(li => {
            if (li.dataset.userId === remoteUserId) {
                userName = li.querySelector('.user-name').textContent;
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
    if (cursor) cursor.remove();
    delete userCursors[remoteUserId];
}

function updateUsersList(users) {
    const list = document.getElementById('users-list');
    list.innerHTML = users.map(user => {
        const isMe = user.id === userId;
        return `
            <li data-user-id="${user.id}">
                <span class="user-dot" style="background: ${user.color}"></span>
                <span class="user-name">${user.nickname}${isMe ? ' (you)' : ''}</span>
            </li>
        `;
    }).join('');
    
    // Update header count
    const countEl = document.querySelector('.user-count');
    if (countEl) {
        countEl.innerHTML = `👥 ${users.length}`;
    }
}

function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;
    statusEl.className = 'connection-status ' + status;
    statusEl.querySelector('.status-text').textContent = 
        status === 'connected' ? 'Connected' : 
        status === 'disconnected' ? 'Disconnected' : 'Connecting...';
}

// ============= Chat =============

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    
    if (text && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'chat',
            text: text
        }));
        input.value = '';
    }
}

function addChatMessage(msg, scroll = true) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    msgEl.innerHTML = `
        <div class="msg-header">
            <span class="msg-author">${escapeHtml(msg.nickname)}</span>
            <span class="msg-time">${time}</span>
        </div>
        <div class="msg-text">${escapeHtml(msg.text)}</div>
    `;
    
    container.appendChild(msgEl);
    
    if (scroll) {
        container.scrollTop = container.scrollHeight;
    }
}

// ============= Timer =============

function startTimerDisplay(endTime, duration) {
    const display = document.getElementById('timer-display');
    if (!display) return;
    
    display.classList.add('active');
    
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        const now = Date.now() / 1000;
        const remaining = Math.max(0, endTime - now);
        
        display.textContent = formatTime(remaining);
        
        // Warning states
        display.classList.remove('warning', 'danger');
        if (remaining < 30) {
            display.classList.add('danger');
        } else if (remaining < 60) {
            display.classList.add('warning');
        }
        
        if (remaining <= 0) {
            stopTimerDisplay();
            showToast('Time\'s up!', 'warning');
            playSound('timer');
        }
    }, 1000);
}

function stopTimerDisplay() {
    const display = document.getElementById('timer-display');
    if (display) {
        display.classList.remove('active', 'warning', 'danger');
    }
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ============= Reactions =============

function sendReaction(emoji) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const canvas = document.getElementById('main-canvas');
        ws.send(JSON.stringify({
            type: 'reaction',
            emoji: emoji,
            x: canvas.width / 2,
            y: canvas.height / 2
        }));
    }
}

function showReaction(emoji, x, y) {
    const container = document.querySelector('.canvas-area');
    const reaction = document.createElement('div');
    reaction.className = 'reaction';
    reaction.textContent = emoji;
    reaction.style.left = `${x}px`;
    reaction.style.top = `${y}px`;
    container.appendChild(reaction);
    
    setTimeout(() => reaction.remove(), 1500);
}

// ============= Toast Notifications =============

function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => toast.remove(), 4000);
}

// ============= Sounds =============

function playSound(type) {
    if (!soundEnabled || !audioCtx) return;
    
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    gainNode.gain.value = 0.1;
    
    switch (type) {
        case 'draw':
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.02;
            break;
        case 'join':
            oscillator.frequency.value = 600;
            oscillator.type = 'triangle';
            break;
        case 'message':
            oscillator.frequency.value = 500;
            oscillator.type = 'sine';
            break;
        case 'timer':
            oscillator.frequency.value = 440;
            oscillator.type = 'square';
            gainNode.gain.value = 0.2;
            break;
    }
    
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.3);
    oscillator.stop(audioCtx.currentTime + 0.3);
}

// ============= Theme =============

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
}

function loadTheme() {
    currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
}

// ============= Stickers =============

async function loadStickers() {
    const response = await fetch('/api/stickers');
    const stickers = await response.json();
    
    const container = document.getElementById('stickers-grid');
    if (!container) return;
    
    container.innerHTML = stickers.map(s => `
        <button class="sticker-btn" data-sticker="${s.id}" title="${s.name}">${s.svg}</button>
    `).join('');
    
    container.querySelectorAll('.sticker-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sendReaction(btn.textContent);
        });
    });
}

// ============= Keyboard Shortcuts =============

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        const key = e.key.toLowerCase();
        
        if (e.ctrlKey || e.metaKey) {
            switch (key) {
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) {
                        // Redo
                        const redone = drawingCanvas.redo();
                        if (redone && ws) {
                            ws.send(JSON.stringify({ type: 'stroke', ...redone }));
                        }
                    } else {
                        // Undo
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'undo' }));
                        }
                        drawingCanvas.undo();
                    }
                    break;
                case 'y':
                    e.preventDefault();
                    const redone = drawingCanvas.redo();
                    if (redone && ws) {
                        ws.send(JSON.stringify({ type: 'stroke', ...redone }));
                    }
                    break;
                case 's':
                    e.preventDefault();
                    saveRoom();
                    break;
                case 'e':
                    e.preventDefault();
                    exportCanvas();
                    break;
            }
            return;
        }
        
        // Tool shortcuts
        switch (key) {
            case 'b':
                setActiveTool('brush');
                break;
            case 'e':
                setActiveTool('eraser');
                break;
            case 'l':
                setActiveTool('line');
                break;
            case 'r':
                setActiveTool('rect');
                break;
            case 'c':
                setActiveTool('circle');
                break;
            case 't':
                setActiveTool('text');
                break;
            case 'f':
                setActiveTool('fill');
                break;
            case 'i':
                setActiveTool('picker');
                break;
            case '=':
            case '+':
                updateZoom(1);
                break;
            case '-':
                updateZoom(-1);
                break;
            case '0':
                drawingCanvas.resetView();
                updateZoomDisplay();
                break;
        }
        
        // Brush size with number keys
        if (key >= '1' && key <= '9') {
            const size = parseInt(key) * 5;
            drawingCanvas.setBrushSize(size);
            document.getElementById('brush-size').value = size;
            document.getElementById('size-display').textContent = size + 'px';
        }
    });
}

function setActiveTool(tool) {
    drawingCanvas.setTool(tool);
    
    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tool === tool) {
            btn.classList.add('active');
        }
    });
}

// ============= UI Setup =============

function setupUI() {
    // Brush size
    const brushSizeInput = document.getElementById('brush-size');
    const sizeDisplay = document.getElementById('size-display');
    if (brushSizeInput) {
        brushSizeInput.addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            drawingCanvas.setBrushSize(size);
            sizeDisplay.textContent = size + 'px';
        });
    }
    
    // Color picker
    const colorPicker = document.getElementById('brush-color');
    if (colorPicker) {
        colorPicker.addEventListener('input', (e) => {
            drawingCanvas.setBrushColor(e.target.value);
        });
    }
    
    // Color presets
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const color = btn.dataset.color;
            drawingCanvas.setBrushColor(color);
            if (colorPicker) colorPicker.value = color;
        });
    });
    
    // Tool buttons
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveTool(btn.dataset.tool);
        });
    });
    
    // Undo button
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'undo' }));
            }
            drawingCanvas.undo();
        });
    }
    
    // Clear layer
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
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
    }
    
    // Add layer
    const addLayerBtn = document.getElementById('add-layer-btn');
    if (addLayerBtn) {
        addLayerBtn.addEventListener('click', () => {
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
    }
    
    // Save
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveRoom);
    }
    
    // Export
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportCanvas);
    }
    
    // Theme toggle
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }
    
    // Sound toggle
    const soundBtn = document.getElementById('sound-btn');
    if (soundBtn) {
        soundBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
        });
    }
    
    // Shortcuts modal
    const shortcutsBtn = document.getElementById('shortcuts-btn');
    if (shortcutsBtn) {
        shortcutsBtn.addEventListener('click', showShortcutsModal);
    }
    
    // Timer
    const timerBtn = document.getElementById('timer-btn');
    if (timerBtn) {
        timerBtn.addEventListener('click', () => {
            const minutes = prompt('Timer duration (minutes):', '5');
            if (minutes && !isNaN(minutes)) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'start_timer',
                        duration: parseInt(minutes) * 60
                    }));
                }
            }
        });
    }
    
    // Chat
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });
    }
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendChatMessage);
    }
    
    // Panel tabs
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const target = tab.dataset.panel;
            document.getElementById(target + '-panel').classList.add('active');
        });
    });
    
    // Zoom controls
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');
    
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => updateZoom(1));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => updateZoom(-1));
    if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', () => {
            drawingCanvas.resetView();
            updateZoomDisplay();
        });
    }
    
    // Gallery button
    const galleryBtn = document.getElementById('gallery-btn');
    if (galleryBtn) {
        galleryBtn.addEventListener('click', () => {
            const title = prompt('Enter a title for your artwork:');
            if (title) {
                saveToGallery(title);
            }
        });
    }
}

function updateZoom(direction) {
    if (direction > 0) {
        drawingCanvas.zoomIn();
    } else {
        drawingCanvas.zoomOut();
    }
    updateZoomDisplay();
}

function updateZoomDisplay() {
    const display = document.getElementById('zoom-level');
    if (display) {
        display.textContent = Math.round(drawingCanvas.zoom * 100) + '%';
    }
}

async function saveRoom() {
    const response = await fetch(`/api/rooms/${currentRoom}/save`, { method: 'POST' });
    if (response.ok) {
        showToast('Drawing saved!', 'success');
    } else {
        showToast('Failed to save', 'error');
    }
}

function exportCanvas() {
    const dataUrl = drawingCanvas.exportToPNG();
    const link = document.createElement('a');
    link.download = `drawing-${currentRoom}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    showToast('Image exported!', 'success');
}

function saveThumbnail() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const thumbnail = drawingCanvas.getThumbnail(200);
        ws.send(JSON.stringify({
            type: 'save_thumbnail',
            thumbnail: thumbnail
        }));
    }
}

async function saveToGallery(title) {
    const imageData = drawingCanvas.exportToPNG();
    
    const response = await fetch('/api/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            room_id: currentRoom,
            title: title,
            author: nickname,
            image_data: imageData
        })
    });
    
    if (response.ok) {
        showToast('Saved to gallery!', 'success');
    } else {
        showToast('Failed to save to gallery', 'error');
    }
}

function renderLayersPanel() {
    const panel = document.getElementById('layers-panel');
    if (!panel) return;
    
    panel.innerHTML = drawingCanvas.layers.map(layer => `
        <div class="layer-item ${layer.id === drawingCanvas.currentLayerId ? 'active' : ''}" 
             data-layer-id="${layer.id}">
            <input type="checkbox" ${layer.visible ? 'checked' : ''} 
                   onclick="toggleLayer('${layer.id}', event)">
            <span class="layer-name">${escapeHtml(layer.name)}</span>
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

function updateStats(stats) {
    // Could display stats somewhere in UI
    console.log('Room stats:', stats);
}

async function showShortcutsModal() {
    const response = await fetch('/api/shortcuts');
    const shortcuts = await response.json();
    
    let overlay = document.querySelector('.modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }
    
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h2>⌨️ Keyboard Shortcuts</h2>
                <button class="modal-close" onclick="closeModal()">×</button>
            </div>
            <div class="shortcuts-list">
                ${shortcuts.map(s => `
                    <div class="shortcut-item">
                        <span>${s.action}</span>
                        <span class="shortcut-key">${s.key}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    overlay.classList.add('active');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
}

function closeModal() {
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.classList.remove('active');
}

function promptPassword() {
    const password = prompt('This room is password protected. Enter password:');
    if (password) {
        localStorage.setItem('room_password_' + currentRoom, password);
        location.reload();
    }
}

// ============= Utilities =============

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Export for global access
window.initApp = initApp;
window.toggleLayer = toggleLayer;
window.closeModal = closeModal;
