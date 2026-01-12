"""
Pytest Configuration and Fixtures
"""

import pytest
import asyncio
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    """Use temporary database for tests"""
    import app
    test_db = str(tmp_path / "test_drawings.db")
    monkeypatch.setattr(app, "DB_PATH", test_db)
    
    # Initialize the database synchronously
    loop = asyncio.new_event_loop()
    loop.run_until_complete(app.init_db())
    loop.close()
