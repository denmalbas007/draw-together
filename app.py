"""
Collaborative Drawing Board - Main Application
Real-time collaborative drawing with WebSocket support
"""

import json
import uuid
import asyncio
from datetime import datetime
from typing import Dict, List, Set
from dataclasses import dataclass, asdict, field

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse

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
    layers: List[Layer] = field(default_factory=list)
    strokes: List[Stroke] = field(default_factory=list)
    created_at: float = field(default_factory=lambda: datetime.now().timestamp())

# ============= Connection Manager =============

class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}
        self.user_info: Dict[str, Dict] = {}
        self.room_data: Dict[str, Room] = {}
    
    async def connect(self, websocket: WebSocket, room_id: str, user_id: str, nickname: str):
        await websocket.accept()
        
        if room_id not in self.rooms:
            self.rooms[room_id] = {}
            self.room_data[room_id] = Room(
                id=room_id,
                name=room_id,
                layers=[Layer(id="layer_0", name="Background", order=0)]
            )
        
        self.rooms[room_id][user_id] = websocket
        self.user_info[user_id] = {"nickname": nickname, "room_id": room_id}
        
        # Notify others
        await self.broadcast(room_id, {
            "type": "user_joined",
            "user_id": user_id,
            "nickname": nickname,
            "users": self.get_room_users(room_id)
        }, exclude=user_id)
        
        # Send current state to new user
        room = self.room_data[room_id]
        await websocket.send_json({
            "type": "init",
            "room": {
                "id": room.id,
                "layers": [asdict(l) for l in room.layers],
                "strokes": [asdict(s) for s in room.strokes]
            },
            "users": self.get_room_users(room_id)
        })
    
    def disconnect(self, room_id: str, user_id: str):
        if room_id in self.rooms and user_id in self.rooms[room_id]:
            del self.rooms[room_id][user_id]
            nickname = self.user_info.get(user_id, {}).get("nickname", "Unknown")
            del self.user_info[user_id]
            return nickname
        return None
    
    def get_room_users(self, room_id: str) -> List[Dict]:
        users = []
        for uid in self.rooms.get(room_id, {}):
            info = self.user_info.get(uid, {})
            users.append({"id": uid, "nickname": info.get("nickname", "Anonymous")})
        return users
    
    async def broadcast(self, room_id: str, message: dict, exclude: str = None):
        if room_id not in self.rooms:
            return
        for user_id, ws in list(self.rooms[room_id].items()):
            if user_id != exclude:
                await ws.send_json(message)
    
    def add_stroke(self, room_id: str, stroke: Stroke):
        if room_id in self.room_data:
            self.room_data[room_id].strokes.append(stroke)
    
    def remove_last_stroke(self, room_id: str, user_id: str) -> Stroke:
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

# ============= Database =============

DB_PATH = "drawings.db"

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                name TEXT,
                data TEXT,
                created_at REAL,
                updated_at REAL
            )
        """)
        await db.commit()

async def save_room(room: Room):
    async with aiosqlite.connect(DB_PATH) as db:
        data = json.dumps({
            "layers": [asdict(l) for l in room.layers],
            "strokes": [asdict(s) for s in room.strokes]
        })
        await db.execute("""
            INSERT OR REPLACE INTO rooms (id, name, data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """, (room.id, room.name, data, room.created_at, datetime.now().timestamp()))
        await db.commit()

async def load_room(room_id: str) -> Room:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT * FROM rooms WHERE id = ?", (room_id,))
        row = await cursor.fetchone()
        if row:
            data = json.loads(row[2])
            return Room(
                id=row[0],
                name=row[1],
                layers=[Layer(**l) for l in data["layers"]],
                strokes=[Stroke(**s) for s in data["strokes"]],
                created_at=row[3]
            )
        return None

async def list_rooms() -> List[Dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT id, name, created_at, updated_at FROM rooms ORDER BY updated_at DESC")
        rows = await cursor.fetchall()
        return [{"id": r[0], "name": r[1], "created_at": r[2], "updated_at": r[3]} for r in rows]

# ============= FastAPI App =============

app = FastAPI(title="Collaborative Drawing Board")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

manager = ConnectionManager()

@app.on_event("startup")
async def startup():
    await init_db()

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/room/{room_id}", response_class=HTMLResponse)
async def room_page(request: Request, room_id: str):
    return templates.TemplateResponse("room.html", {"request": request, "room_id": room_id})

@app.get("/api/rooms")
async def get_rooms():
    rooms = await list_rooms()
    return JSONResponse(rooms)

@app.post("/api/rooms/{room_id}/save")
async def save_room_endpoint(room_id: str):
    if room_id in manager.room_data:
        await save_room(manager.room_data[room_id])
        return {"status": "saved"}
    return JSONResponse({"error": "Room not found"}, status_code=404)

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    # Get user info from query params
    user_id = websocket.query_params.get("user_id", str(uuid.uuid4()))
    nickname = websocket.query_params.get("nickname", "Anonymous")
    
    # Try to load existing room from DB
    if room_id not in manager.room_data:
        saved_room = await load_room(room_id)
        if saved_room:
            manager.room_data[room_id] = saved_room
    
    await manager.connect(websocket, room_id, user_id, nickname)
    
    try:
        while True:
            data = await websocket.receive_json()
            await handle_message(room_id, user_id, data)
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

async def handle_message(room_id: str, user_id: str, data: dict):
    msg_type = data.get("type")
    
    if msg_type == "stroke":
        stroke = Stroke(
            id=data.get("id", str(uuid.uuid4())),
            user_id=user_id,
            points=data["points"],
            color=data["color"],
            size=data["size"],
            layer_id=data.get("layer_id", "layer_0"),
            timestamp=datetime.now().timestamp()
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
            "y": data["y"]
        }, exclude=user_id)

# ============= Run =============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

