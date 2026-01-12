"""
Unit Tests for Data Models
TDD approach - tests written based on BDD specifications
"""

import pytest
from dataclasses import asdict

import sys
sys.path.insert(0, '..')

from app import Stroke, Layer, Room


class TestStrokeModel:
    """Test Stroke data model"""
    
    def test_stroke_creation(self):
        """Test creating a stroke with all required fields"""
        stroke = Stroke(
            id="stroke_123",
            user_id="user_456",
            points=[{"x": 0, "y": 0}, {"x": 100, "y": 100}],
            color="#FF0000",
            size=5,
            layer_id="layer_0",
            timestamp=1234567890.0
        )
        
        assert stroke.id == "stroke_123"
        assert stroke.user_id == "user_456"
        assert len(stroke.points) == 2
        assert stroke.color == "#FF0000"
        assert stroke.size == 5
        assert stroke.layer_id == "layer_0"
    
    def test_stroke_to_dict(self):
        """Test stroke serialization to dictionary"""
        stroke = Stroke(
            id="stroke_1",
            user_id="user_1",
            points=[{"x": 10, "y": 20}],
            color="#000000",
            size=3,
            layer_id="layer_0",
            timestamp=1000.0
        )
        
        data = asdict(stroke)
        
        assert data["id"] == "stroke_1"
        assert data["points"] == [{"x": 10, "y": 20}]
        assert "timestamp" in data
    
    def test_stroke_with_multiple_points(self):
        """Test stroke with multiple drawing points"""
        points = [{"x": i, "y": i*2} for i in range(100)]
        stroke = Stroke(
            id="complex_stroke",
            user_id="user_1",
            points=points,
            color="#0000FF",
            size=10,
            layer_id="layer_1",
            timestamp=9999.0
        )
        
        assert len(stroke.points) == 100
        assert stroke.points[50] == {"x": 50, "y": 100}


class TestLayerModel:
    """Test Layer data model"""
    
    def test_layer_creation_defaults(self):
        """Test layer creation with default values"""
        layer = Layer(id="layer_0", name="Background")
        
        assert layer.id == "layer_0"
        assert layer.name == "Background"
        assert layer.visible == True
        assert layer.order == 0
    
    def test_layer_visibility_toggle(self):
        """Test layer visibility can be set"""
        layer = Layer(id="layer_1", name="Hidden", visible=False)
        
        assert layer.visible == False
    
    def test_layer_order(self):
        """Test layer ordering"""
        layer1 = Layer(id="l1", name="First", order=0)
        layer2 = Layer(id="l2", name="Second", order=1)
        layer3 = Layer(id="l3", name="Third", order=2)
        
        layers = [layer3, layer1, layer2]
        sorted_layers = sorted(layers, key=lambda l: l.order)
        
        assert sorted_layers[0].name == "First"
        assert sorted_layers[1].name == "Second"
        assert sorted_layers[2].name == "Third"


class TestRoomModel:
    """Test Room data model"""
    
    def test_room_creation_empty(self):
        """Test creating an empty room"""
        room = Room(id="test_room", name="Test Room")
        
        assert room.id == "test_room"
        assert room.name == "Test Room"
        assert room.layers == []
        assert room.strokes == []
        assert room.created_at > 0
    
    def test_room_with_layers(self):
        """Test room with predefined layers"""
        layers = [
            Layer(id="bg", name="Background", order=0),
            Layer(id="fg", name="Foreground", order=1)
        ]
        room = Room(id="art_room", name="Art Room", layers=layers)
        
        assert len(room.layers) == 2
        assert room.layers[0].name == "Background"
    
    def test_room_with_strokes(self):
        """Test room with strokes"""
        stroke = Stroke(
            id="s1",
            user_id="u1",
            points=[{"x": 0, "y": 0}],
            color="#000",
            size=1,
            layer_id="l0",
            timestamp=1.0
        )
        room = Room(id="r1", name="R1", strokes=[stroke])
        
        assert len(room.strokes) == 1
        assert room.strokes[0].id == "s1"

