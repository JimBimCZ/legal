import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "static-does-not-exist"))

    from app.main import app

    with TestClient(app) as test_client:  # triggers lifespan -> fresh init_db()
        yield test_client


@pytest.fixture()
def authed_client(client):
    """A client that has signed up and carries the resulting session cookie,
    for exercising routes that require authentication."""
    client.post("/api/auth/signup", json={"email": "authed@example.com", "password": "password123"})
    return client
