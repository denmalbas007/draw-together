"""
Tests for Advanced Features
Chat, Gallery, Timer, Password Protection
"""

import pytest
import time
from fastapi.testclient import TestClient

import sys
sys.path.insert(0, '..')

from app import app, manager, ChatMessage, save_to_gallery, get_gallery, like_gallery_item


@pytest.fixture
def client():
    return TestClient(app)


class TestChatFeature:
    """Test real-time chat functionality"""
    
    def test_chat_message_sent_and_received(self, client):
        """Test sending and receiving chat messages"""
        with client.websocket_connect("/ws/chat-room?user_id=chatter&nickname=Chatter") as ws:
            ws.receive_json()  # init
            
            # Send chat message
            ws.send_json({
                "type": "chat",
                "text": "Hello everyone!"
            })
            
            time.sleep(0.1)
            
            # Verify message was stored
            room = manager.room_data.get("chat-room")
            assert len(room.chat_messages) > 0
            assert room.chat_messages[-1].text == "Hello everyone!"
    
    def test_chat_message_length_limit(self, client):
        """Test that chat messages are limited to 500 characters"""
        with client.websocket_connect("/ws/chat-limit?user_id=limiter&nickname=Limiter") as ws:
            ws.receive_json()
            
            # Send very long message
            long_text = "A" * 1000
            ws.send_json({
                "type": "chat",
                "text": long_text
            })
            
            time.sleep(0.1)
            
            room = manager.room_data.get("chat-limit")
            # Message should be truncated to 500 chars
            assert len(room.chat_messages[-1].text) == 500


class TestTimerFeature:
    """Test timer functionality"""
    
    def test_timer_start(self, client):
        """Test starting a timer"""
        with client.websocket_connect("/ws/timer-room?user_id=timer-user&nickname=Timer") as ws:
            ws.receive_json()  # init
            
            # Start timer for 5 minutes
            ws.send_json({
                "type": "start_timer",
                "duration": 300
            })
            
            time.sleep(0.1)
            
            room = manager.room_data.get("timer-room")
            assert room.timer_end is not None
            assert room.timer_end > time.time()
    
    def test_timer_max_duration(self, client):
        """Test timer is limited to 1 hour max"""
        with client.websocket_connect("/ws/timer-max?user_id=timer-max&nickname=MaxTimer") as ws:
            ws.receive_json()
            
            # Try to set 2 hour timer
            ws.send_json({
                "type": "start_timer",
                "duration": 7200  # 2 hours
            })
            
            time.sleep(0.1)
            
            room = manager.room_data.get("timer-max")
            # Should be capped at 1 hour (3600 seconds)
            expected_max = time.time() + 3600
            assert room.timer_end <= expected_max + 1


class TestPasswordProtection:
    """Test room password protection"""
    
    def test_password_protected_room_creation(self, client):
        """Test creating a password-protected room"""
        with client.websocket_connect(
            "/ws/protected-room?user_id=creator&nickname=Creator&password=secret123"
        ) as ws:
            data = ws.receive_json()
            assert data["type"] == "init"
            assert data["room"]["has_password"] == True
    
    def test_password_protected_room_wrong_password(self, client):
        """Test accessing protected room with wrong password"""
        # First create protected room
        with client.websocket_connect(
            "/ws/protected-test?user_id=owner&nickname=Owner&password=correctpass"
        ) as ws:
            ws.receive_json()
        
        # Try to join with wrong password
        with client.websocket_connect(
            "/ws/protected-test?user_id=intruder&nickname=Intruder&password=wrongpass"
        ) as ws:
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "password" in data["message"].lower()


class TestGalleryFeature:
    """Test gallery functionality"""
    
    def test_gallery_page_loads(self, client):
        """Test gallery page loads"""
        response = client.get("/gallery")
        assert response.status_code == 200
        assert "Gallery" in response.text
    
    def test_get_gallery_empty(self, client):
        """Test getting empty gallery"""
        response = client.get("/api/gallery")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_post_to_gallery(self, client):
        """Test posting artwork to gallery"""
        response = client.post("/api/gallery", json={
            "room_id": "test-room",
            "title": "My Masterpiece",
            "author": "Test Artist",
            "image_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        })
        
        assert response.status_code == 200
        assert "id" in response.json()
    
    def test_like_gallery_item(self, client):
        """Test liking a gallery item"""
        # First create an item
        post_response = client.post("/api/gallery", json={
            "room_id": "like-test",
            "title": "Likeable Art",
            "author": "Artist",
            "image_data": "data:image/png;base64,test"
        })
        
        gallery_id = post_response.json()["id"]
        
        # Like it
        like_response = client.post(f"/api/gallery/{gallery_id}/like")
        assert like_response.status_code == 200
        assert like_response.json()["status"] == "liked"


class TestReactionsFeature:
    """Test reactions/stickers functionality"""
    
    def test_get_stickers(self, client):
        """Test getting available stickers"""
        response = client.get("/api/stickers")
        
        assert response.status_code == 200
        stickers = response.json()
        assert len(stickers) > 0
        assert "id" in stickers[0]
        assert "name" in stickers[0]
        assert "svg" in stickers[0]
    
    def test_reaction_broadcast(self, client):
        """Test sending a reaction"""
        with client.websocket_connect("/ws/reaction-room?user_id=reactor&nickname=Reactor") as ws:
            ws.receive_json()  # init
            
            ws.send_json({
                "type": "reaction",
                "emoji": "👍",
                "x": 100,
                "y": 200
            })
            
            # Should not error
            # Reaction is broadcast to others, not back to sender


class TestShortcutsAPI:
    """Test keyboard shortcuts API"""
    
    def test_get_shortcuts(self, client):
        """Test getting keyboard shortcuts"""
        response = client.get("/api/shortcuts")
        
        assert response.status_code == 200
        shortcuts = response.json()
        assert len(shortcuts) > 0
        assert any(s["key"] == "Ctrl+Z" for s in shortcuts)
        assert any(s["key"] == "B" for s in shortcuts)


class TestRoomStats:
    """Test room statistics"""
    
    def test_get_room_stats(self, client):
        """Test getting room statistics"""
        # First create a room
        with client.websocket_connect("/ws/stats-room?user_id=stat-user&nickname=Stat") as ws:
            ws.receive_json()
        
        # Get stats
        response = client.get("/api/rooms/stats-room/stats")
        assert response.status_code == 200
        
        stats = response.json()
        assert "total_strokes" in stats
        assert "total_users_joined" in stats
        assert "active_users" in stats
    
    def test_stats_not_found(self, client):
        """Test getting stats for non-existent room"""
        response = client.get("/api/rooms/nonexistent-stats/stats")
        assert response.status_code == 404


class TestToolTypes:
    """Test different tool types in strokes"""
    
    def test_stroke_with_tool_type(self, client):
        """Test sending stroke with specific tool type"""
        with client.websocket_connect("/ws/tool-test?user_id=tooler&nickname=Tooler") as ws:
            ws.receive_json()
            
            # Send line stroke
            ws.send_json({
                "type": "stroke",
                "id": "line_stroke_1",
                "points": [{"x": 0, "y": 0}, {"x": 100, "y": 100}],
                "color": "#000000",
                "size": 2,
                "layer_id": "layer_0",
                "tool": "line"
            })
            
            time.sleep(0.1)
            
            room = manager.room_data.get("tool-test")
            stroke = next((s for s in room.strokes if s.id == "line_stroke_1"), None)
            assert stroke is not None
            assert stroke.tool == "line"

