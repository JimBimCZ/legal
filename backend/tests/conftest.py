import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """Runs the suite against SQLite by default.

    Set TEST_DATABASE_URL to a Postgres connection string to run the same
    tests against the dialect used in production on Vercel - the schema is
    reset between tests so each one still starts from an empty database:

        TEST_DATABASE_URL=postgresql://... uv run pytest
    """
    test_database_url = os.environ.get("TEST_DATABASE_URL")
    if test_database_url:
        import psycopg

        with psycopg.connect(test_database_url) as conn:
            conn.execute("DROP SCHEMA public CASCADE")
            conn.execute("CREATE SCHEMA public")
            conn.commit()
        monkeypatch.setenv("DATABASE_URL", test_database_url)
    else:
        monkeypatch.delenv("DATABASE_URL", raising=False)
        monkeypatch.delenv("POSTGRES_URL", raising=False)
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
