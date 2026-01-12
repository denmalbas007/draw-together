"""
Integration Tests for API Endpoints
Tests HTTP endpoints and WebSocket connections
"""

import pytest
import asyncio
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport
import json

import sys
sys.path.insert(0, '..')

from app import app, init_db, manager


@pytest.fixture(scope="module")
def client():
    """Synchronous test client"""
    return TestClient(app)


@pytest.fixture
async def async_client():
    """Async test client for async tests"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestHTTPEndpoints:
    """Test HTTP API endpoints"""
    
    def test_index_page(self, client):
        """Test landing page loads"""
        response = client.get("/")
        
        assert response.status_code == 200
        assert "DrawTogether" in response.text
        assert "Collaborative" in response.text
    
    def test_room_page(self, client):
        """Test room page loads with room ID"""
        response = client.get("/room/test-room-123")
        
        assert response.status_code == 200
        assert "test-room-123" in response.text
        assert "canvas" in response.text.lower()
    
    def test_get_rooms_empty(self, client):
        """Test getting rooms list when empty"""
        response = client.get("/api/rooms")
        
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_save_room_not_found(self, client):
        """Test saving non-existent room returns 404"""
        response = client.post("/api/rooms/nonexistent-room-xyz/save")
        
        assert response.status_code == 404
        assert "error" in response.json()


class TestWebSocketConnection:
    """Test WebSocket functionality"""
    
    def test_websocket_connect(self, client):
        """Test WebSocket connection is established"""
        with client.websocket_connect("/ws/test-room?user_id=test-user&nickname=Tester") as ws:
            # Should receive init message
            data = ws.receive_json()
            
            assert data["type"] == "init"
            assert "room" in data
            assert "users" in data
    
    def test_websocket_receives_stroke(self, client):
        """Test sending and receiving stroke data"""
        with client.websocket_connect("/ws/stroke-test?user_id=user1&nickname=Artist") as ws:
            # Receive init
            init_data = ws.receive_json()
            assert init_data["type"] == "init"
            
            # Send stroke
            stroke_msg = {
                "type": "stroke",
                "id": "test_stroke_1",
                "points": [{"x": 10, "y": 20}, {"x": 30, "y": 40}],
                "color": "#FF0000",
                "size": 5,
                "layer_id": "layer_0"
            }
            ws.send_json(stroke_msg)
            
            # Stroke should be stored in manager
            assert "stroke-test" in manager.room_data
    
    def test_websocket_multiple_users(self, client):
        """Test multiple users in same room"""
        with client.websocket_connect("/ws/multi-user-room?user_id=user1&nickname=Alice") as ws1:
            init1 = ws1.receive_json()
            assert init1["type"] == "init"
            
            with client.websocket_connect("/ws/multi-user-room?user_id=user2&nickname=Bob") as ws2:
                init2 = ws2.receive_json()
                assert init2["type"] == "init"
                
                # User 1 should receive notification about user 2
                join_msg = ws1.receive_json()
                assert join_msg["type"] == "user_joined"
                assert join_msg["nickname"] == "Bob"
    
    def test_websocket_undo(self, client):
        """Test undo functionality removes stroke"""
        with client.websocket_connect("/ws/undo-test?user_id=undo-user&nickname=Undoer") as ws:
            ws.receive_json()  # init
            
            # Send stroke
            ws.send_json({
                "type": "stroke",
                "id": "undo_stroke",
                "points": [{"x": 0, "y": 0}],
                "color": "#000",
                "size": 1,
                "layer_id": "layer_0"
            })
            
            # Send undo
            ws.send_json({"type": "undo"})
            
            # Verify stroke was removed
            room = manager.room_data.get("undo-test")
            stroke_ids = [s.id for s in room.strokes] if room else []
            assert "undo_stroke" not in stroke_ids
    
    def test_websocket_add_layer(self, client):
        """Test adding a new layer"""
        import time
        with client.websocket_connect("/ws/layer-test?user_id=layer-user&nickname=Layerer") as ws:
            ws.receive_json()  # init
            
            # Add layer
            ws.send_json({
                "type": "add_layer",
                "id": "new_layer_123",
                "name": "My Custom Layer"
            })
            
            # Wait for message processing
            time.sleep(0.1)
            
            # Verify layer was added
            room = manager.room_data.get("layer-test")
            layer_ids = [l.id for l in room.layers] if room else []
            assert "new_layer_123" in layer_ids
    
    def test_websocket_clear_layer(self, client):
        """Test clearing a layer removes its strokes"""
        with client.websocket_connect("/ws/clear-test?user_id=clear-user&nickname=Clearer") as ws:
            ws.receive_json()  # init
            
            # Add stroke
            ws.send_json({
                "type": "stroke",
                "id": "stroke_to_clear",
                "points": [{"x": 50, "y": 50}],
                "color": "#000",
                "size": 1,
                "layer_id": "layer_0"
            })
            
            # Clear layer
            ws.send_json({
                "type": "clear_layer",
                "layer_id": "layer_0"
            })
            
            # Verify strokes are cleared
            room = manager.room_data.get("clear-test")
            layer0_strokes = [s for s in room.strokes if s.layer_id == "layer_0"] if room else []
            assert len(layer0_strokes) == 0


class TestRoomPersistence:
    """Test room save/load functionality"""
    
    def test_room_save_after_drawing(self, client):
        """Test that room can be saved after drawing"""
        # First create room with strokes
        with client.websocket_connect("/ws/save-test?user_id=saver&nickname=Saver") as ws:
            ws.receive_json()  # init
            
            ws.send_json({
                "type": "stroke",
                "id": "persistent_stroke",
                "points": [{"x": 100, "y": 100}],
                "color": "#00FF00",
                "size": 3,
                "layer_id": "layer_0"
            })
        
        # Now save
        response = client.post("/api/rooms/save-test/save")
        assert response.status_code == 200
        assert response.json()["status"] == "saved"

