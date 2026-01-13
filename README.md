# 🎨 DrawTogether - Real-time Collaborative Drawing Board

> **Production-Ready** real-time collaborative drawing application built with Python (FastAPI), WebSocket, and Canvas API.

![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green.svg)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-purple.svg)
![Tests](https://img.shields.io/badge/Tests-50+-brightgreen.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## 🚀 Quick Start

```bash
cd pet_project
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open: **http://localhost:8000**

## ✨ Features

### Core Drawing Tools
| Tool | Shortcut | Description |
|------|----------|-------------|
| ✏️ Brush | `B` | Freehand drawing |
| 🧹 Eraser | `E` | Erase strokes |
| 📏 Line | `L` | Draw straight lines |
| ⬜ Rectangle | `R` | Draw rectangles |
| ⭕ Circle | `C` | Draw circles |
| 🔤 Text | `T` | Add text labels |
| 🪣 Fill | `F` | Flood fill areas |
| 💧 Color Picker | `I` | Pick color from canvas |

### Collaboration Features
- 👥 **Multiple Users** - Draw simultaneously with others
- 🖱️ **Live Cursors** - See other users' cursor positions
- 💬 **Real-time Chat** - Communicate while drawing
- ⏱️ **Timer** - Timed drawing sessions
- 🎭 **Reactions** - Send emoji reactions
- 🔒 **Password Protection** - Private rooms

### Canvas Features
- 📚 **Layers** - Create, toggle, and manage layers
- ↩️ **Undo/Redo** - Full history support (Ctrl+Z/Y)
- 🔍 **Zoom & Pan** - Navigate large canvases
- 📐 **Shape Preview** - Live preview while drawing shapes

### Persistence & Sharing
- 💾 **Auto-Save** - Automatic room persistence
- 🖼️ **Gallery** - Share artwork with community
- ❤️ **Likes** - Like favorite artworks
- 📥 **Export PNG** - Download your masterpiece
- 🖼️ **Thumbnails** - Room preview images

### UI/UX
- 🌙 **Dark/Light Theme** - Toggle with button
- 🔊 **Sound Effects** - Audio feedback (optional)
- ⌨️ **Keyboard Shortcuts** - Full keyboard support
- 📱 **Responsive** - Works on mobile devices
- 🎨 **Modern Design** - Beautiful animated UI
- 🔔 **Toast Notifications** - User feedback

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save |
| `Ctrl+E` | Export PNG |
| `B` | Brush tool |
| `E` | Eraser tool |
| `L` | Line tool |
| `R` | Rectangle tool |
| `C` | Circle tool |
| `T` | Text tool |
| `F` | Fill tool |
| `I` | Color picker |
| `+/-` | Zoom in/out |
| `0` | Reset view |
| `1-9` | Brush size |
| `Space+Drag` | Pan canvas |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  Canvas Engine + WebSocket Client + Modern UI               │
├─────────────────────────────────────────────────────────────┤
│                    WebSocket + HTTP                         │
├─────────────────────────────────────────────────────────────┤
│                        BACKEND                              │
│  FastAPI + Connection Manager + SQLite                      │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
pet_project/
├── app.py                          # FastAPI application
├── requirements.txt                # Python dependencies
├── pytest.ini                      # Test configuration
├── static/
│   ├── css/style.css              # Modern dark/light theme
│   └── js/
│       ├── canvas.js              # Drawing engine
│       └── app.js                 # WebSocket client
├── templates/
│   ├── index.html                 # Landing page
│   ├── room.html                  # Drawing room
│   └── gallery.html               # Artwork gallery
├── tests/
│   ├── test_models.py             # Unit tests
│   ├── test_connection_manager.py # Manager tests
│   ├── test_api.py                # API tests
│   └── test_advanced_features.py  # Feature tests
└── docs/
    ├── BDD_SPECS.md               # BDD specifications
    ├── API_DOCUMENTATION.md       # API reference
    └── ARCHITECTURE.md            # System design
```

## 🧪 Testing

```bash
# Run all tests
pytest -v

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_advanced_features.py -v
```

### Test Coverage
- ✅ **50+ tests** covering all features
- ✅ Unit tests for data models
- ✅ Integration tests for WebSocket
- ✅ API endpoint tests
- ✅ Feature-specific tests

## 🔌 API Reference

### HTTP Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Landing page |
| GET | `/room/{id}` | Drawing room |
| GET | `/gallery` | Gallery page |
| GET | `/api/rooms` | List rooms |
| GET | `/api/gallery` | List artworks |
| POST | `/api/gallery` | Post artwork |
| POST | `/api/gallery/{id}/like` | Like artwork |
| POST | `/api/rooms/{id}/save` | Save room |
| GET | `/api/rooms/{id}/stats` | Room statistics |
| GET | `/api/stickers` | Get stickers |
| GET | `/api/shortcuts` | Get shortcuts |

### WebSocket Messages

**Client → Server:**
- `stroke` - Draw stroke
- `undo` - Undo last stroke
- `chat` - Send chat message
- `cursor` - Cursor position
- `add_layer` - Create layer
- `clear_layer` - Clear layer
- `start_timer` - Start timer
- `stop_timer` - Stop timer
- `reaction` - Send reaction
- `save_thumbnail` - Save thumbnail

**Server → Client:**
- `init` - Initial state
- `stroke` - New stroke
- `remove_stroke` - Stroke removed
- `user_joined` - User joined
- `user_left` - User left
- `chat` - Chat message
- `cursor` - Cursor update
- `layer_added` - Layer created
- `layer_cleared` - Layer cleared
- `timer_started` - Timer started
- `timer_stopped` - Timer stopped
- `reaction` - Reaction received
- `error` - Error message

## 🎨 Design Highlights

- **Gradient backgrounds** with subtle animations
- **Glassmorphism** effects on cards
- **Smooth transitions** on all interactions
- **Custom scrollbars** matching theme
- **Responsive grid** layouts
- **Accessible** color contrast

## 📊 Performance

- **Cursor throttling** - 50ms debounce
- **Message compression** - Minimal JSON
- **Lazy loading** - On-demand assets
- **Auto-cleanup** - Old data pruning
- **Efficient redraw** - Layer-based rendering

## 🔒 Security

- UUID-based user identification
- Password-hashed room protection
- Input sanitization (XSS prevention)
- Message length limits
- Rate limiting ready

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Python 3.10+, FastAPI |
| Real-time | WebSocket |
| Database | SQLite (aiosqlite) |
| Frontend | Vanilla JS, Canvas API |
| Templates | Jinja2 |
| Testing | pytest, pytest-asyncio |
| Fonts | Inter (Google Fonts) |

## 📈 Metrics

| Metric | Value |
|--------|-------|
| Lines of Code | ~3500 |
| Test Count | 50+ |
| Features | 20+ |
| API Endpoints | 10+ |
| Documentation | 4 files |

## 🚧 Future Roadmap

- [ ] User authentication (OAuth)
- [ ] Room invitations via email
- [ ] More shape tools (polygon, arrow)
- [ ] Image import/stamp tool
- [ ] Collaborative templates
- [ ] Mobile app (PWA)
- [ ] Redis for scaling

## 📄 License

MIT License - Use freely!

---

**Built with ❤️ for collaborative creativity**

🔗 **Live Demo**: http://localhost:8000
