"""
Unit Tests for Connection Manager
Tests the core WebSocket connection management logic
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
import asyncio

import sys
sys.path.insert(0, '..')

from app import ConnectionManager, Stroke, Layer, Room


class TestConnectionManager:
    """Test ConnectionManager functionality"""
    
    @pytest.fixture
    def manager(self):
        return ConnectionManager()
    
    @pytest.fixture
    def mock_websocket(self):
        ws = AsyncMock()
        ws.accept = AsyncMock()
        ws.send_json = AsyncMock()
        return ws
    
    @pytest.mark.asyncio
    async def test_connect_creates_room(self, manager, mock_websocket):
        """Test that connecting to a new room creates it"""
        await manager.connect(mock_websocket, "room1", "user1", "Alice")
        
        assert "room1" in manager.rooms
        assert "user1" in manager.rooms["room1"]
        assert "room1" in manager.room_data
    
    @pytest.mark.asyncio
    async def test_connect_multiple_users_same_room(self, manager, mock_websocket):
        """Test multiple users can join same room"""
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        
        await manager.connect(ws1, "room1", "user1", "Alice")
        await manager.connect(ws2, "room1", "user2", "Bob")
        
        assert len(manager.rooms["room1"]) == 2
        assert "user1" in manager.rooms["room1"]
        assert "user2" in manager.rooms["room1"]
    
    @pytest.mark.asyncio
    async def test_connect_sends_init_state(self, manager, mock_websocket):
        """Test that connecting sends initial room state"""
        await manager.connect(mock_websocket, "room1", "user1", "Alice")
        
        mock_websocket.send_json.assert_called()
        call_args = mock_websocket.send_json.call_args[0][0]
        assert call_args["type"] == "init"
        assert "room" in call_args
        assert "users" in call_args
    
    def test_disconnect_removes_user(self, manager):
        """Test that disconnecting removes user from room"""
        manager.rooms["room1"] = {"user1": MagicMock()}
        manager.user_info["user1"] = {"nickname": "Alice", "room_id": "room1"}
        manager.room_data["room1"] = Room(id="room1", name="Room 1")
        
        nickname = manager.disconnect("room1", "user1")
        
        assert nickname == "Alice"
        assert "user1" not in manager.rooms["room1"]
        assert "user1" not in manager.user_info
    
    def test_disconnect_nonexistent_user(self, manager):
        """Test disconnecting a user that doesn't exist"""
        nickname = manager.disconnect("room1", "nonexistent")
        
        assert nickname is None
    
    def test_get_room_users(self, manager):
        """Test getting list of users in a room"""
        manager.rooms["room1"] = {"user1": MagicMock(), "user2": MagicMock()}
        manager.user_info["user1"] = {"nickname": "Alice", "room_id": "room1"}
        manager.user_info["user2"] = {"nickname": "Bob", "room_id": "room1"}
        
        users = manager.get_room_users("room1")
        
        assert len(users) == 2
        nicknames = [u["nickname"] for u in users]
        assert "Alice" in nicknames
        assert "Bob" in nicknames
    
    def test_add_stroke(self, manager):
        """Test adding a stroke to room"""
        manager.room_data["room1"] = Room(id="room1", name="Room 1")
        
        stroke = Stroke(
            id="s1",
            user_id="u1",
            points=[{"x": 0, "y": 0}],
            color="#000",
            size=5,
            layer_id="layer_0",
            timestamp=1.0
        )
        
        manager.add_stroke("room1", stroke)
        
        assert len(manager.room_data["room1"].strokes) == 1
        assert manager.room_data["room1"].strokes[0].id == "s1"
    
    def test_remove_last_stroke_by_user(self, manager):
        """Test removing the last stroke made by a specific user"""
        manager.room_data["room1"] = Room(id="room1", name="Room 1")
        
        stroke1 = Stroke(id="s1", user_id="user1", points=[], color="#000", size=1, layer_id="l0", timestamp=1.0)
        stroke2 = Stroke(id="s2", user_id="user2", points=[], color="#000", size=1, layer_id="l0", timestamp=2.0)
        stroke3 = Stroke(id="s3", user_id="user1", points=[], color="#000", size=1, layer_id="l0", timestamp=3.0)
        
        manager.room_data["room1"].strokes = [stroke1, stroke2, stroke3]
        
        removed = manager.remove_last_stroke("room1", "user1")
        
        assert removed.id == "s3"
        assert len(manager.room_data["room1"].strokes) == 2
        # stroke1 should still be there
        remaining_ids = [s.id for s in manager.room_data["room1"].strokes]
        assert "s1" in remaining_ids
        assert "s2" in remaining_ids
    
    def test_add_layer(self, manager):
        """Test adding a layer to room"""
        manager.room_data["room1"] = Room(id="room1", name="Room 1")
        
        layer = Layer(id="layer_1", name="New Layer", order=1)
        manager.add_layer("room1", layer)
        
        assert len(manager.room_data["room1"].layers) == 1
        assert manager.room_data["room1"].layers[0].name == "New Layer"
    
    def test_clear_layer(self, manager):
        """Test clearing all strokes from a specific layer"""
        manager.room_data["room1"] = Room(id="room1", name="Room 1")
        
        stroke1 = Stroke(id="s1", user_id="u1", points=[], color="#000", size=1, layer_id="layer_0", timestamp=1.0)
        stroke2 = Stroke(id="s2", user_id="u1", points=[], color="#000", size=1, layer_id="layer_1", timestamp=2.0)
        stroke3 = Stroke(id="s3", user_id="u1", points=[], color="#000", size=1, layer_id="layer_0", timestamp=3.0)
        
        manager.room_data["room1"].strokes = [stroke1, stroke2, stroke3]
        
        manager.clear_layer("room1", "layer_0")
        
        assert len(manager.room_data["room1"].strokes) == 1
        assert manager.room_data["room1"].strokes[0].layer_id == "layer_1"
    
    @pytest.mark.asyncio
    async def test_broadcast_to_all_except_sender(self, manager):
        """Test broadcasting message to all users except sender"""
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        ws3 = AsyncMock()
        
        manager.rooms["room1"] = {"user1": ws1, "user2": ws2, "user3": ws3}
        
        await manager.broadcast("room1", {"type": "test"}, exclude="user1")
        
        ws1.send_json.assert_not_called()
        ws2.send_json.assert_called_once_with({"type": "test"})
        ws3.send_json.assert_called_once_with({"type": "test"})
    
    @pytest.mark.asyncio
    async def test_broadcast_to_all(self, manager):
        """Test broadcasting to all users including sender"""
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        
        manager.rooms["room1"] = {"user1": ws1, "user2": ws2}
        
        await manager.broadcast("room1", {"type": "test"})
        
        ws1.send_json.assert_called_once()
        ws2.send_json.assert_called_once()

