# Architecture Documentation

## System Overview

DrawTogether is a real-time collaborative drawing application following a client-server architecture with WebSocket for real-time communication.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER CLIENTS                                │
│  ┌─────────────────────────────────────────────────────────────────────────┤
│  │                                                                          │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │  │   User 1     │    │   User 2     │    │   User N     │              │
│  │  │  ┌────────┐  │    │  ┌────────┐  │    │  ┌────────┐  │              │
│  │  │  │ Canvas │  │    │  │ Canvas │  │    │  │ Canvas │  │              │
│  │  │  │ Engine │  │    │  │ Engine │  │    │  │ Engine │  │              │
│  │  │  └────────┘  │    │  └────────┘  │    │  └────────┘  │              │
│  │  │  ┌────────┐  │    │  ┌────────┐  │    │  ┌────────┐  │              │
│  │  │  │   WS   │  │    │  │   WS   │  │    │  │   WS   │  │              │
│  │  │  │ Client │  │    │  │ Client │  │    │  │ Client │  │              │
│  │  │  └────────┘  │    │  └────────┘  │    │  └────────┘  │              │
│  │  └──────────────┘    └──────────────┘    └──────────────┘              │
│  │         │                   │                   │                       │
│  └─────────┼───────────────────┼───────────────────┼───────────────────────┤
└────────────┼───────────────────┼───────────────────┼───────────────────────┘
             │                   │                   │
             │ WebSocket         │ WebSocket         │ WebSocket
             │                   │                   │
┌────────────▼───────────────────▼───────────────────▼───────────────────────┐
│                            FASTAPI SERVER                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┤
│  │                                                                          │
│  │  ┌──────────────────────┐    ┌──────────────────────┐                  │
│  │  │    HTTP Router       │    │   WebSocket Router   │                  │
│  │  │  - GET /             │    │  - /ws/{room_id}     │                  │
│  │  │  - GET /room/{id}    │    │                      │                  │
│  │  │  - GET /api/rooms    │    │                      │                  │
│  │  │  - POST /save        │    │                      │                  │
│  │  └──────────────────────┘    └──────────────────────┘                  │
│  │                                        │                                │
│  │                                        ▼                                │
│  │                          ┌──────────────────────┐                      │
│  │                          │  Connection Manager  │                      │
│  │                          │  ┌────────────────┐  │                      │
│  │                          │  │ rooms: Dict    │  │                      │
│  │                          │  │ user_info: Dict│  │                      │
│  │                          │  │ room_data: Dict│  │                      │
│  │                          │  └────────────────┘  │                      │
│  │                          └──────────────────────┘                      │
│  │                                        │                                │
│  │                                        ▼                                │
│  │                          ┌──────────────────────┐                      │
│  │                          │    SQLite Database   │                      │
│  │                          │    (drawings.db)     │                      │
│  │                          └──────────────────────┘                      │
│  │                                                                          │
│  └─────────────────────────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### Client-Side Components

#### 1. Canvas Engine (`static/js/canvas.js`)

**Responsibility**: Handle all canvas drawing operations

```javascript
class DrawingCanvas {
    // State
    - isDrawing: boolean
    - currentStroke: Stroke
    - strokes: Stroke[]
    - layers: Layer[]
    - currentLayerId: string
    
    // Tools
    - brushSize: number
    - brushColor: string
    - tool: 'brush' | 'eraser'
    
    // Methods
    + setupEventListeners()
    + startStroke(pos)
    + continueStroke(pos)
    + endStroke()
    + drawFullStroke(stroke)
    + addRemoteStroke(stroke)
    + removeStroke(strokeId)
    + redraw()
    + exportToPNG()
}
```

**Key Features**:
- Touch and mouse event handling
- Smooth stroke rendering with bezier interpolation
- Layer-based rendering
- Export to PNG data URL

#### 2. WebSocket Client (`static/js/app.js`)

**Responsibility**: Manage server communication and UI state

```javascript
// Global State
- drawingCanvas: DrawingCanvas
- ws: WebSocket
- userId: string
- nickname: string
- currentRoom: string
- userCursors: Map

// Functions
+ initApp(roomId)
+ connectWebSocket()
+ handleServerMessage(data)
+ handleStrokeComplete(stroke)
+ setupUI()
```

**Message Flow**:
1. User draws → Canvas captures points
2. Stroke complete → Send to WebSocket
3. Server broadcasts → Other clients receive
4. Canvas renders remote stroke

### Server-Side Components

#### 1. FastAPI Application (`app.py`)

**Main Entry Point**:
```python
app = FastAPI(title="Collaborative Drawing Board")
```

**Routes**:
| Route | Handler | Description |
|-------|---------|-------------|
| GET / | index() | Landing page |
| GET /room/{id} | room_page() | Drawing room |
| GET /api/rooms | get_rooms() | List rooms |
| POST /api/rooms/{id}/save | save_room_endpoint() | Save room |
| WS /ws/{room_id} | websocket_endpoint() | WebSocket handler |

#### 2. Connection Manager

**Responsibility**: Manage WebSocket connections and room state

```python
class ConnectionManager:
    rooms: Dict[str, Dict[str, WebSocket]]  # room_id -> {user_id -> ws}
    user_info: Dict[str, Dict]               # user_id -> {nickname, room_id}
    room_data: Dict[str, Room]               # room_id -> Room
    
    async def connect(ws, room_id, user_id, nickname)
    def disconnect(room_id, user_id)
    def get_room_users(room_id) -> List[Dict]
    async def broadcast(room_id, message, exclude=None)
    def add_stroke(room_id, stroke)
    def remove_last_stroke(room_id, user_id)
    def add_layer(room_id, layer)
    def clear_layer(room_id, layer_id)
```

#### 3. Data Models

```python
@dataclass
class Stroke:
    id: str
    user_id: str
    points: List[Dict]  # [{x, y}, ...]
    color: str
    size: int
    layer_id: str
    timestamp: float

@dataclass
class Layer:
    id: str
    name: str
    visible: bool = True
    order: int = 0

@dataclass
class Room:
    id: str
    name: str
    layers: List[Layer]
    strokes: List[Stroke]
    created_at: float
```

#### 4. Database Layer

**Schema**:
```sql
CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    name TEXT,
    data TEXT,      -- JSON: {layers: [...], strokes: [...]}
    created_at REAL,
    updated_at REAL
)
```

**Functions**:
```python
async def init_db()           # Create tables
async def save_room(room)     # Insert/update room
async def load_room(room_id)  # Load room by ID
async def list_rooms()        # List all rooms
```

## Data Flow

### Drawing a Stroke

```
User Action               Client                    Server                   Other Clients
    │                        │                         │                          │
    │ mousedown/touchstart   │                         │                          │
    ├───────────────────────►│                         │                          │
    │                        │ startStroke()           │                          │
    │                        ├────────┐                │                          │
    │                        │        │                │                          │
    │ mousemove              │◄───────┘                │                          │
    ├───────────────────────►│                         │                          │
    │                        │ continueStroke()        │                          │
    │                        │ [draw locally]          │                          │
    │                        │                         │                          │
    │ mouseup                │                         │                          │
    ├───────────────────────►│                         │                          │
    │                        │ endStroke()             │                          │
    │                        │                         │                          │
    │                        │ ws.send({type:"stroke"})│                          │
    │                        ├────────────────────────►│                          │
    │                        │                         │ add_stroke()             │
    │                        │                         │ broadcast()              │
    │                        │                         ├─────────────────────────►│
    │                        │                         │                          │ addRemoteStroke()
    │                        │                         │                          │ [draw on canvas]
```

### User Joining Room

```
New User                  Server                    Existing Users
    │                        │                          │
    │ ws.connect()           │                          │
    ├───────────────────────►│                          │
    │                        │ manager.connect()        │
    │                        ├───────┐                  │
    │                        │       │                  │
    │                        │◄──────┘                  │
    │                        │                          │
    │ {type:"init",...}      │                          │
    │◄───────────────────────┤                          │
    │                        │                          │
    │                        │ broadcast("user_joined") │
    │                        ├─────────────────────────►│
    │                        │                          │ updateUsersList()
```

## Design Decisions

### 1. In-Memory Room State

**Decision**: Keep active room data in memory, persist to SQLite on disconnect.

**Rationale**:
- Minimizes latency for real-time drawing
- SQLite provides durability without complexity
- Auto-save on disconnect prevents data loss

### 2. Stroke-Based Drawing

**Decision**: Store individual strokes rather than rasterized canvas.

**Rationale**:
- Enables undo/redo per user
- Smaller data transfer (points vs pixels)
- Layer support becomes natural
- Vector-quality export possible

### 3. Layer Visibility (Client-Side)

**Decision**: Layer visibility is local to each user.

**Rationale**:
- Users can hide layers for their own view
- Doesn't affect other users' work
- Reduces synchronization complexity

### 4. UUID User Identification

**Decision**: Generate UUID on first visit, store in localStorage.

**Rationale**:
- No authentication complexity
- Persistent identity across sessions
- Undo only affects own strokes

## Scalability Considerations

### Current Limitations
- Single Python process
- In-memory room state
- SQLite (file-based DB)

### Scaling Path

```
                     ┌─────────────────┐
                     │  Load Balancer  │
                     └────────┬────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
    ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
    │  Instance 1 │    │  Instance 2 │    │  Instance 3 │
    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │
                     ┌────────▼────────┐
                     │   Redis Pub/Sub │
                     │  (room routing) │
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │   PostgreSQL    │
                     │  (persistence)  │
                     └─────────────────┘
```

**Required Changes**:
1. Replace in-memory rooms with Redis
2. Use Redis Pub/Sub for cross-instance broadcasting
3. Migrate SQLite to PostgreSQL
4. Add sticky sessions or room-based routing

## Security Notes

| Concern | Current Status | Mitigation |
|---------|----------------|------------|
| Authentication | None | UUID provides basic identity |
| Room Privacy | Public | Add room passwords (future) |
| Input Validation | Minimal | JSON schema validation (future) |
| Rate Limiting | None | Add per-user limits (future) |
| XSS | Safe | No user HTML rendering |

