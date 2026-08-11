import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "static-does-not-exist"))

    from app.main import app

    with TestClient(app) as test_client:  # triggers lifespan -> fresh init_db()
        yield test_client
