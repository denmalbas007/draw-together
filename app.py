"""
DrawTogether - Real-time Collaborative Drawing Board
Production-Ready Version with Advanced Features
"""

import json
import uuid
import asyncio
import hashlib
import base64
import io
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict, field

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from contextlib import asynccontextmanager

import aiosqlite

# ============= Data Models =============

@dataclass
class Stroke:
    id: str
    user_id: str
    points: List[Dict]
    color: str
    size: int
    layer_id: str
    timestamp: float
    tool: str = "brush"  # brush, eraser, line, rect, circle, text

@dataclass
class Layer:
    id: str
    name: str
    visible: bool = True
    locked: bool = False
    opacity: float = 1.0
    order: int = 0

@dataclass
class ChatMessage:
    id: str
    user_id: str
    nickname: str
    text: str
    timestamp: float

@dataclass
class Room:
    id: str
    name: str
    password_hash: Optional[str] = None
    layers: List[Layer] = field(default_factory=list)
    strokes: List[Stroke] = field(default_factory=list)
    chat_messages: List[ChatMessage] = field(default_factory=list)
    timer_end: Optional[float] = None
    created_at: float = field(default_factory=lambda: datetime.now().timestamp())
    thumbnail: Optional[str] = None

@dataclass 
class RoomStats:
    total_strokes: int
    total_users_joined: int
    active_users: int
    created_at: float
    last_activity: float

# ============= Connection Manager =============

class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}
        self.user_info: Dict[str, Dict] = {}
        self.room_data: Dict[str, Room] = {}
        self.room_stats: Dict[str, RoomStats] = {}
        self.user_colors: Dict[str, str] = {}
    
    def _get_user_color(self, user_id: str) -> str:
        if user_id not in self.user_colors:
            colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
                     '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
                     '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1']
            self.user_colors[user_id] = colors[len(self.user_colors) % len(colors)]
        return self.user_colors[user_id]
    
    async def connect(self, websocket: WebSocket, room_id: str, user_id: str, nickname: str, password: str = None):
        await websocket.accept()
        
        # Check password if room exists and is protected
        if room_id in self.room_data:
            room = self.room_data[room_id]
            if room.password_hash:
                if not password or hashlib.sha256(password.encode()).hexdigest() != room.password_hash:
                    await websocket.send_json({"type": "error", "message": "Invalid password"})
                    await websocket.close()
                    return False
        
        if room_id not in self.rooms:
            self.rooms[room_id] = {}
            self.room_data[room_id] = Room(
                id=room_id,
                name=room_id,
                layers=[Layer(id="layer_0", name="Background", order=0)],
                password_hash=hashlib.sha256(password.encode()).hexdigest() if password else None
            )
            self.room_stats[room_id] = RoomStats(
                total_strokes=0,
                total_users_joined=0,
                active_users=0,
                created_at=datetime.now().timestamp(),
                last_activity=datetime.now().timestamp()
            )
        
        self.rooms[room_id][user_id] = websocket
        self.user_info[user_id] = {
            "nickname": nickname, 
            "room_id": room_id,
            "color": self._get_user_color(user_id)
        }
        
        # Update stats
        self.room_stats[room_id].total_users_joined += 1
        self.room_stats[room_id].active_users = len(self.rooms[room_id])
        self.room_stats[room_id].last_activity = datetime.now().timestamp()
        
        # Notify others
        await self.broadcast(room_id, {
            "type": "user_joined",
            "user_id": user_id,
            "nickname": nickname,
            "color": self.user_info[user_id]["color"],
            "users": self.get_room_users(room_id)
        }, exclude=user_id)
        
        # Send current state to new user
        room = self.room_data[room_id]
        await websocket.send_json({
            "type": "init",
            "room": {
                "id": room.id,
                "name": room.name,
                "has_password": room.password_hash is not None,
                "layers": [asdict(l) for l in room.layers],
                "strokes": [asdict(s) for s in room.strokes],
                "chat_messages": [asdict(m) for m in room.chat_messages[-50:]],  # Last 50 messages
                "timer_end": room.timer_end
            },
            "users": self.get_room_users(room_id),
            "stats": asdict(self.room_stats[room_id]),
            "your_color": self.user_info[user_id]["color"]
        })
        
        return True
    
    def disconnect(self, room_id: str, user_id: str):
        if room_id in self.rooms and user_id in self.rooms[room_id]:
            del self.rooms[room_id][user_id]
            nickname = self.user_info.get(user_id, {}).get("nickname", "Unknown")
            del self.user_info[user_id]
            
            if room_id in self.room_stats:
                self.room_stats[room_id].active_users = len(self.rooms.get(room_id, {}))
            
            return nickname
        return None
    
    def get_room_users(self, room_id: str) -> List[Dict]:
        users = []
        for uid in self.rooms.get(room_id, {}):
            info = self.user_info.get(uid, {})
            users.append({
                "id": uid, 
                "nickname": info.get("nickname", "Anonymous"),
                "color": info.get("color", "#888888")
            })
        return users
    
    async def broadcast(self, room_id: str, message: dict, exclude: str = None):
        if room_id not in self.rooms:
            return
        disconnected = []
        for user_id, ws in list(self.rooms[room_id].items()):
            if user_id != exclude:
                try:
                    await ws.send_json(message)
                except:
                    disconnected.append(user_id)
        
        for uid in disconnected:
            self.disconnect(room_id, uid)
    
    def add_stroke(self, room_id: str, stroke: Stroke):
        if room_id in self.room_data:
            self.room_data[room_id].strokes.append(stroke)
            if room_id in self.room_stats:
                self.room_stats[room_id].total_strokes += 1
                self.room_stats[room_id].last_activity = datetime.now().timestamp()
    
    def remove_last_stroke(self, room_id: str, user_id: str) -> Optional[Stroke]:
        if room_id not in self.room_data:
            return None
        strokes = self.room_data[room_id].strokes
        for i in range(len(strokes) - 1, -1, -1):
            if strokes[i].user_id == user_id:
                return strokes.pop(i)
        return None
    
    def add_layer(self, room_id: str, layer: Layer):
        if room_id in self.room_data:
            self.room_data[room_id].layers.append(layer)
    
    def clear_layer(self, room_id: str, layer_id: str):
        if room_id in self.room_data:
            self.room_data[room_id].strokes = [
                s for s in self.room_data[room_id].strokes 
                if s.layer_id != layer_id
            ]
    
    def add_chat_message(self, room_id: str, message: ChatMessage):
        if room_id in self.room_data:
            self.room_data[room_id].chat_messages.append(message)
            # Keep only last 100 messages
            if len(self.room_data[room_id].chat_messages) > 100:
                self.room_data[room_id].chat_messages = self.room_data[room_id].chat_messages[-100:]
    
    def set_timer(self, room_id: str, duration_seconds: int):
        if room_id in self.room_data:
            self.room_data[room_id].timer_end = datetime.now().timestamp() + duration_seconds
            return self.room_data[room_id].timer_end
        return None
    
    def clear_timer(self, room_id: str):
        if room_id in self.room_data:
            self.room_data[room_id].timer_end = None

# ============= Database =============

DB_PATH = "drawings.db"

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                name TEXT,
                data TEXT,
                thumbnail TEXT,
                password_hash TEXT,
                created_at REAL,
                updated_at REAL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS gallery (
                id TEXT PRIMARY KEY,
                room_id TEXT,
                title TEXT,
                author TEXT,
                image_data TEXT,
                likes INTEGER DEFAULT 0,
                created_at REAL
            )
        """)
        await db.commit()

async def save_room(room: Room):
    async with aiosqlite.connect(DB_PATH) as db:
        data = json.dumps({
            "layers": [asdict(l) for l in room.layers],
            "strokes": [asdict(s) for s in room.strokes],
            "chat_messages": [asdict(m) for m in room.chat_messages[-50:]]
        })
        await db.execute("""
            INSERT OR REPLACE INTO rooms (id, name, data, thumbnail, password_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (room.id, room.name, data, room.thumbnail, room.password_hash, 
              room.created_at, datetime.now().timestamp()))
        await db.commit()

async def load_room(room_id: str) -> Optional[Room]:
    async with aiosqlite.connect(DB_PATH) as db:
        # Use SELECT * for compatibility with old DB schema
        cursor = await db.execute("SELECT * FROM rooms WHERE id = ?", (room_id,))
        row = await cursor.fetchone()
        if row:
            # Handle both old (3-column) and new (7-column) schema
            data = {}
            if len(row) >= 3 and row[2]:
                data = json.loads(row[2])
            
            return Room(
                id=row[0],
                name=row[1] if len(row) > 1 else room_id,
                layers=[Layer(**l) for l in data.get("layers", [{"id": "layer_0", "name": "Background", "visible": True, "order": 0}])],
                strokes=[Stroke(**s) for s in data.get("strokes", [])],
                chat_messages=[ChatMessage(**m) for m in data.get("chat_messages", [])],
                thumbnail=row[3] if len(row) > 3 else None,
                password_hash=row[4] if len(row) > 4 else None,
                created_at=row[5] if len(row) > 5 else datetime.now().timestamp()
            )
        return None

async def list_rooms() -> List[Dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT id, name, thumbnail, password_hash, created_at, updated_at FROM rooms ORDER BY updated_at DESC LIMIT 20"
        )
        rows = await cursor.fetchall()
        return [{
            "id": r[0], 
            "name": r[1], 
            "thumbnail": r[2],
            "has_password": r[3] is not None,
            "created_at": r[4], 
            "updated_at": r[5]
        } for r in rows]

async def save_to_gallery(room_id: str, title: str, author: str, image_data: str) -> str:
    gallery_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO gallery (id, room_id, title, author, image_data, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (gallery_id, room_id, title, author, image_data, datetime.now().timestamp()))
        await db.commit()
    return gallery_id

async def get_gallery() -> List[Dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT id, room_id, title, author, image_data, likes, created_at FROM gallery ORDER BY created_at DESC LIMIT 50"
        )
        rows = await cursor.fetchall()
        return [{
            "id": r[0],
            "room_id": r[1],
            "title": r[2],
            "author": r[3],
            "image_data": r[4],
            "likes": r[5],
            "created_at": r[6]
        } for r in rows]

async def like_gallery_item(gallery_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE gallery SET likes = likes + 1 WHERE id = ?", (gallery_id,))
        await db.commit()

# ============= FastAPI App =============

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="DrawTogether - Collaborative Drawing Board", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

manager = ConnectionManager()

# Stickers/Templates data
STICKERS = [
    {"id": "star", "name": "Star", "svg": "⭐"},
    {"id": "heart", "name": "Heart", "svg": "❤️"},
    {"id": "smile", "name": "Smile", "svg": "😊"},
    {"id": "sun", "name": "Sun", "svg": "☀️"},
    {"id": "moon", "name": "Moon", "svg": "🌙"},
    {"id": "tree", "name": "Tree", "svg": "🌲"},
    {"id": "flower", "name": "Flower", "svg": "🌸"},
    {"id": "cat", "name": "Cat", "svg": "🐱"},
    {"id": "dog", "name": "Dog", "svg": "🐕"},
    {"id": "rocket", "name": "Rocket", "svg": "🚀"},
]

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/room/{room_id}", response_class=HTMLResponse)
async def room_page(request: Request, room_id: str):
    return templates.TemplateResponse("room.html", {"request": request, "room_id": room_id})

@app.get("/gallery", response_class=HTMLResponse)
async def gallery_page(request: Request):
    return templates.TemplateResponse("gallery.html", {"request": request})

@app.get("/api/rooms")
async def get_rooms():
    rooms = await list_rooms()
    # Add active user counts
    for room in rooms:
        room["active_users"] = len(manager.rooms.get(room["id"], {}))
    return JSONResponse(rooms)

@app.get("/api/gallery")
async def get_gallery_api():
    gallery = await get_gallery()
    return JSONResponse(gallery)

@app.post("/api/gallery")
async def post_to_gallery(request: Request):
    data = await request.json()
    gallery_id = await save_to_gallery(
        data["room_id"],
        data["title"],
        data["author"],
        data["image_data"]
    )
    return JSONResponse({"id": gallery_id})

@app.post("/api/gallery/{gallery_id}/like")
async def like_gallery(gallery_id: str):
    await like_gallery_item(gallery_id)
    return JSONResponse({"status": "liked"})

@app.post("/api/rooms/{room_id}/save")
async def save_room_endpoint(room_id: str):
    if room_id in manager.room_data:
        await save_room(manager.room_data[room_id])
        return {"status": "saved"}
    return JSONResponse({"error": "Room not found"}, status_code=404)

@app.get("/api/rooms/{room_id}/stats")
async def get_room_stats(room_id: str):
    if room_id in manager.room_stats:
        return JSONResponse(asdict(manager.room_stats[room_id]))
    return JSONResponse({"error": "Room not found"}, status_code=404)

@app.get("/api/stickers")
async def get_stickers():
    return JSONResponse(STICKERS)

@app.get("/api/shortcuts")
async def get_shortcuts():
    return JSONResponse([
        {"key": "Ctrl+Z", "action": "Undo"},
        {"key": "Ctrl+Y", "action": "Redo"},
        {"key": "B", "action": "Brush tool"},
        {"key": "E", "action": "Eraser tool"},
        {"key": "L", "action": "Line tool"},
        {"key": "R", "action": "Rectangle tool"},
        {"key": "C", "action": "Circle tool"},
        {"key": "T", "action": "Text tool"},
        {"key": "F", "action": "Fill tool"},
        {"key": "I", "action": "Color picker"},
        {"key": "+/-", "action": "Zoom in/out"},
        {"key": "Space+Drag", "action": "Pan canvas"},
        {"key": "1-9", "action": "Brush size"},
        {"key": "Ctrl+S", "action": "Save"},
        {"key": "Ctrl+E", "action": "Export PNG"},
    ])

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    user_id = websocket.query_params.get("user_id", str(uuid.uuid4()))
    nickname = websocket.query_params.get("nickname", "Anonymous")
    password = websocket.query_params.get("password", "")
    
    # Try to load existing room from DB
    if room_id not in manager.room_data:
        saved_room = await load_room(room_id)
        if saved_room:
            manager.room_data[room_id] = saved_room
            manager.room_stats[room_id] = RoomStats(
                total_strokes=len(saved_room.strokes),
                total_users_joined=0,
                active_users=0,
                created_at=saved_room.created_at,
                last_activity=datetime.now().timestamp()
            )
    
    connected = await manager.connect(websocket, room_id, user_id, nickname, password if password else None)
    if not connected:
        return
    
    try:
        while True:
            data = await websocket.receive_json()
            await handle_message(room_id, user_id, nickname, data)
    except WebSocketDisconnect:
        nickname = manager.disconnect(room_id, user_id)
        if nickname:
            await manager.broadcast(room_id, {
                "type": "user_left",
                "user_id": user_id,
                "nickname": nickname,
                "users": manager.get_room_users(room_id)
            })
        # Auto-save on disconnect
        if room_id in manager.room_data:
            await save_room(manager.room_data[room_id])

async def handle_message(room_id: str, user_id: str, nickname: str, data: dict):
    msg_type = data.get("type")
    
    if msg_type == "stroke":
        stroke = Stroke(
            id=data.get("id", str(uuid.uuid4())),
            user_id=user_id,
            points=data["points"],
            color=data["color"],
            size=data["size"],
            layer_id=data.get("layer_id", "layer_0"),
            timestamp=datetime.now().timestamp(),
            tool=data.get("tool", "brush")
        )
        manager.add_stroke(room_id, stroke)
        await manager.broadcast(room_id, {
            "type": "stroke",
            "stroke": asdict(stroke)
        }, exclude=user_id)
    
    elif msg_type == "undo":
        removed = manager.remove_last_stroke(room_id, user_id)
        if removed:
            await manager.broadcast(room_id, {
                "type": "remove_stroke",
                "stroke_id": removed.id
            })
    
    elif msg_type == "add_layer":
        layer = Layer(
            id=data.get("id", f"layer_{uuid.uuid4().hex[:8]}"),
            name=data.get("name", "New Layer"),
            order=len(manager.room_data[room_id].layers)
        )
        manager.add_layer(room_id, layer)
        await manager.broadcast(room_id, {
            "type": "layer_added",
            "layer": asdict(layer)
        })
    
    elif msg_type == "clear_layer":
        layer_id = data["layer_id"]
        manager.clear_layer(room_id, layer_id)
        await manager.broadcast(room_id, {
            "type": "layer_cleared",
            "layer_id": layer_id
        })
    
    elif msg_type == "cursor":
        await manager.broadcast(room_id, {
            "type": "cursor",
            "user_id": user_id,
            "x": data["x"],
            "y": data["y"],
            "color": manager.user_info.get(user_id, {}).get("color", "#888")
        }, exclude=user_id)
    
    elif msg_type == "chat":
        message = ChatMessage(
            id=str(uuid.uuid4()),
            user_id=user_id,
            nickname=nickname,
            text=data["text"][:500],  # Limit message length
            timestamp=datetime.now().timestamp()
        )
        manager.add_chat_message(room_id, message)
        await manager.broadcast(room_id, {
            "type": "chat",
            "message": asdict(message)
        })
    
    elif msg_type == "start_timer":
        duration = min(data.get("duration", 300), 3600)  # Max 1 hour
        timer_end = manager.set_timer(room_id, duration)
        await manager.broadcast(room_id, {
            "type": "timer_started",
            "timer_end": timer_end,
            "duration": duration
        })
    
    elif msg_type == "stop_timer":
        manager.clear_timer(room_id)
        await manager.broadcast(room_id, {
            "type": "timer_stopped"
        })
    
    elif msg_type == "save_thumbnail":
        if room_id in manager.room_data:
            manager.room_data[room_id].thumbnail = data.get("thumbnail", "")[:50000]  # Limit size
    
    elif msg_type == "reaction":
        await manager.broadcast(room_id, {
            "type": "reaction",
            "user_id": user_id,
            "emoji": data.get("emoji", "👍"),
            "x": data.get("x", 0),
            "y": data.get("y", 0)
        })

# ============= Run =============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
