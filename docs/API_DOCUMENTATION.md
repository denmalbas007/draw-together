# API Documentation

## Overview

DrawTogether provides both HTTP REST API and WebSocket real-time communication.

**Base URL**: `http://localhost:8000`

---

## HTTP REST API

### Pages

#### GET /
**Description**: Landing page with room list and join form

**Response**: HTML page

---

#### GET /room/{room_id}
**Description**: Drawing room page

**Parameters**:
| Name | Type | Description |
|------|------|-------------|
| room_id | string | Room identifier |

**Response**: HTML page with canvas

---

### API Endpoints

#### GET /api/rooms
**Description**: List all saved rooms

**Response**:
```json
[
  {
    "id": "my-room",
    "name": "my-room",
    "created_at": 1704067200.0,
    "updated_at": 1704153600.0
  }
]
```

---

#### POST /api/rooms/{room_id}/save
**Description**: Save room state to database

**Parameters**:
| Name | Type | Description |
|------|------|-------------|
| room_id | string | Room identifier |

**Success Response** (200):
```json
{
  "status": "saved"
}
```

**Error Response** (404):
```json
{
  "error": "Room not found"
}
```

---

## WebSocket API

### Connection

**URL**: `ws://localhost:8000/ws/{room_id}`

**Query Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| user_id | string | Yes | Unique user identifier (UUID recommended) |
| nickname | string | Yes | Display name for the user |

**Example**:
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/my-room?user_id=abc123&nickname=Alice');
```

---

### Message Protocol

All messages are JSON objects with a `type` field.

---

### Client → Server Messages

#### stroke
Draw a new stroke on the canvas.

```json
{
  "type": "stroke",
  "id": "stroke_1704067200_abc123",
  "points": [
    {"x": 10, "y": 20},
    {"x": 15, "y": 25},
    {"x": 20, "y": 30}
  ],
  "color": "#FF0000",
  "size": 5,
  "layer_id": "layer_0"
}
```

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique stroke identifier |
| points | array | Array of {x, y} coordinates |
| color | string | Hex color code |
| size | number | Brush size in pixels |
| layer_id | string | Target layer ID |

---

#### undo
Remove the last stroke made by this user.

```json
{
  "type": "undo"
}
```

---

#### add_layer
Create a new layer.

```json
{
  "type": "add_layer",
  "id": "layer_1704067200",
  "name": "Foreground"
}
```

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique layer identifier |
| name | string | Display name for layer |

---

#### clear_layer
Remove all strokes from a layer.

```json
{
  "type": "clear_layer",
  "layer_id": "layer_0"
}
```

---

#### cursor
Send cursor position for other users to see.

```json
{
  "type": "cursor",
  "x": 150,
  "y": 250
}
```

---

### Server → Client Messages

#### init
Sent immediately after connection. Contains current room state.

```json
{
  "type": "init",
  "room": {
    "id": "my-room",
    "layers": [
      {"id": "layer_0", "name": "Background", "visible": true, "order": 0}
    ],
    "strokes": [
      {
        "id": "stroke_1",
        "user_id": "user123",
        "points": [{"x": 10, "y": 20}],
        "color": "#000000",
        "size": 5,
        "layer_id": "layer_0",
        "timestamp": 1704067200.0
      }
    ]
  },
  "users": [
    {"id": "user123", "nickname": "Alice"}
  ]
}
```

---

#### stroke
Broadcast when another user draws.

```json
{
  "type": "stroke",
  "stroke": {
    "id": "stroke_2",
    "user_id": "user456",
    "points": [{"x": 50, "y": 60}],
    "color": "#0000FF",
    "size": 3,
    "layer_id": "layer_0",
    "timestamp": 1704067201.0
  }
}
```

---

#### remove_stroke
Broadcast when a stroke is removed (undo).

```json
{
  "type": "remove_stroke",
  "stroke_id": "stroke_1"
}
```

---

#### user_joined
Broadcast when a user joins the room.

```json
{
  "type": "user_joined",
  "user_id": "user789",
  "nickname": "Bob",
  "users": [
    {"id": "user123", "nickname": "Alice"},
    {"id": "user789", "nickname": "Bob"}
  ]
}
```

---

#### user_left
Broadcast when a user leaves the room.

```json
{
  "type": "user_left",
  "user_id": "user789",
  "nickname": "Bob",
  "users": [
    {"id": "user123", "nickname": "Alice"}
  ]
}
```

---

#### layer_added
Broadcast when a layer is created.

```json
{
  "type": "layer_added",
  "layer": {
    "id": "layer_1",
    "name": "Foreground",
    "visible": true,
    "order": 1
  }
}
```

---

#### layer_cleared
Broadcast when a layer is cleared.

```json
{
  "type": "layer_cleared",
  "layer_id": "layer_0"
}
```

---

#### cursor
Broadcast other users' cursor positions.

```json
{
  "type": "cursor",
  "user_id": "user456",
  "x": 200,
  "y": 300
}
```

---

## Data Models

### Stroke
```typescript
interface Stroke {
  id: string;           // Unique identifier
  user_id: string;      // Creator's user ID
  points: Point[];      // Drawing path
  color: string;        // Hex color
  size: number;         // Brush size (px)
  layer_id: string;     // Target layer
  timestamp: number;    // Unix timestamp
}

interface Point {
  x: number;
  y: number;
}
```

### Layer
```typescript
interface Layer {
  id: string;           // Unique identifier
  name: string;         // Display name
  visible: boolean;     // Visibility flag
  order: number;        // Z-order (0 = bottom)
}
```

### Room
```typescript
interface Room {
  id: string;           // Room identifier
  name: string;         // Display name
  layers: Layer[];      // Layer list
  strokes: Stroke[];    // All strokes
  created_at: number;   // Unix timestamp
}
```

---

## Error Handling

WebSocket disconnections are handled automatically with reconnection attempts every 3 seconds.

HTTP errors return standard JSON:
```json
{
  "detail": "Error message"
}
```

Common status codes:
- `200` - Success
- `404` - Resource not found
- `500` - Server error

