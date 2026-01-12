# 🎨 DrawTogether - Real-time Collaborative Drawing Board

> A modern, real-time collaborative drawing application built with Python (FastAPI), WebSocket, and Canvas API.

![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green.svg)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-purple.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- pip

### Installation

```bash
# Clone and navigate
cd pet_project

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py
```

Open your browser at: **http://localhost:8000**

## 📋 Features

### MVP Features
- ✅ Real-time collaborative drawing with WebSocket
- ✅ Multiple users can draw simultaneously
- ✅ User cursors visible to others
- ✅ Basic brush tools (size, color)
- ✅ Room-based separation

### Evolution Features
- ✅ **Layer System** - Create, toggle, and manage multiple layers
- ✅ **Undo/Redo** - Ctrl+Z to undo your last stroke
- ✅ **Persistence** - Auto-save to SQLite database
- ✅ **Export** - Download canvas as PNG image
- ✅ **Color Presets** - Quick color selection palette
- ✅ **Eraser Tool** - Erase parts of your drawing
- ✅ **Room History** - Rejoin rooms and continue drawing

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Side                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Canvas    │  │  WebSocket  │  │     UI Controls     │  │
│  │   Engine    │  │   Client    │  │   (Toolbar/Layers)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                     WebSocket + HTTP
                            │
┌─────────────────────────────────────────────────────────────┐
│                       Server Side                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   FastAPI   │  │ Connection  │  │      SQLite         │  │
│  │    App      │  │   Manager   │  │     Database        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
pet_project/
├── app.py                 # Main FastAPI application
├── requirements.txt       # Python dependencies
├── pytest.ini            # Test configuration
├── drawings.db           # SQLite database (auto-created)
├── static/
│   ├── css/
│   │   └── style.css     # Modern dark theme styles
│   └── js/
│       ├── canvas.js     # Canvas drawing engine
│       └── app.js        # WebSocket client & UI
├── templates/
│   ├── index.html        # Landing page
│   └── room.html         # Drawing room page
├── tests/
│   ├── conftest.py       # Pytest fixtures
│   ├── test_models.py    # Unit tests for data models
│   ├── test_connection_manager.py  # Connection manager tests
│   └── test_api.py       # Integration/API tests
└── docs/
    └── BDD_SPECS.md      # BDD specifications
```

## 🧪 Testing

Run all tests:
```bash
pytest -v
```

Run with coverage:
```bash
pytest --cov=app --cov-report=html
```

Run specific test file:
```bash
pytest tests/test_models.py -v
pytest tests/test_api.py -v
```

### Test Categories

| Category | File | Description |
|----------|------|-------------|
| Unit | `test_models.py` | Tests for Stroke, Layer, Room models |
| Unit | `test_connection_manager.py` | Tests for WebSocket connection logic |
| Integration | `test_api.py` | Tests for HTTP and WebSocket endpoints |

## 🔌 API Reference

### HTTP Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Landing page |
| GET | `/room/{room_id}` | Drawing room page |
| GET | `/api/rooms` | List all saved rooms |
| POST | `/api/rooms/{room_id}/save` | Save room to database |

### WebSocket Protocol

Connect: `ws://localhost:8000/ws/{room_id}?user_id={id}&nickname={name}`

#### Message Types

**Client → Server:**

```json
// Draw stroke
{
  "type": "stroke",
  "id": "stroke_123",
  "points": [{"x": 10, "y": 20}, {"x": 30, "y": 40}],
  "color": "#FF0000",
  "size": 5,
  "layer_id": "layer_0"
}

// Undo last stroke
{ "type": "undo" }

// Add layer
{
  "type": "add_layer",
  "id": "layer_1",
  "name": "New Layer"
}

// Clear layer
{
  "type": "clear_layer",
  "layer_id": "layer_0"
}

// Cursor position
{
  "type": "cursor",
  "x": 100,
  "y": 200
}
```

**Server → Client:**

```json
// Initial state
{
  "type": "init",
  "room": {
    "id": "room_id",
    "layers": [...],
    "strokes": [...]
  },
  "users": [{"id": "...", "nickname": "..."}]
}

// New stroke
{
  "type": "stroke",
  "stroke": {...}
}

// User joined
{
  "type": "user_joined",
  "user_id": "...",
  "nickname": "...",
  "users": [...]
}

// User left
{
  "type": "user_left",
  "user_id": "...",
  "nickname": "...",
  "users": [...]
}
```

## 🎨 Usage Guide

### Creating a Room
1. Open the application
2. Enter your nickname
3. Enter a room name (or leave blank for auto-generated)
4. Click "Join Room"

### Drawing Tools
- **Brush Size**: Use slider (1-50px)
- **Color**: Use color picker or preset buttons
- **Eraser**: Click eraser tool (uses 3x brush size)
- **Undo**: Press Ctrl+Z or click undo button

### Layer Management
- **Add Layer**: Click "+ Add Layer" button
- **Select Layer**: Click on layer in panel
- **Toggle Visibility**: Click checkbox on layer

### Exporting
- Click the 📥 button to download as PNG
- Click the 💾 button to save to database

## 🛠️ Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Python 3.10+, FastAPI |
| Real-time | WebSocket |
| Database | SQLite (aiosqlite) |
| Frontend | Vanilla JavaScript, Canvas API |
| Templates | Jinja2 |
| Testing | pytest, pytest-asyncio |

## 📊 Performance

- **WebSocket latency**: < 50ms typical
- **Max concurrent users per room**: Tested with 10+
- **Canvas size**: 1200x800 pixels
- **Auto-save**: On user disconnect

## 🔒 Security Considerations

- User IDs are UUIDs stored in localStorage
- No authentication (designed for collaborative sharing)
- Room names are not encrypted (don't use sensitive info)

## 📝 BDD Specifications

See [docs/BDD_SPECS.md](docs/BDD_SPECS.md) for full Gherkin specifications.

Key scenarios covered:
- User joins drawing room
- Real-time stroke synchronization
- Multiple simultaneous users
- Layer creation and management
- Canvas persistence
- Export functionality

## 🚧 Future Improvements

- [ ] User authentication
- [ ] Room passwords
- [ ] More drawing tools (shapes, text)
- [ ] Zoom and pan
- [ ] Mobile optimization
- [ ] Room chat

## 📄 License

MIT License - Feel free to use and modify!

---

**Built with ❤️ for collaborative creativity**

