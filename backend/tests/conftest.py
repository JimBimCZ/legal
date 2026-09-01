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

    # Configured by default so the OAuth path is exercised; tests that want the
    # development bypass build their own client with these removed.
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")

    # The schema is created lazily and remembered per database; each test starts
    # from a clean one, so that memory has to be cleared alongside it.
    from app.db import reset_schema_cache

    reset_schema_cache()

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def sign_in_as(client, github_id=1, login="tester", email="tester@example.com"):
    """Create a user and attach a signed session cookie to `client`.

    Sessions are minted directly rather than driven through OAuth: every route
    outside test_auth.py cares only that *somebody* is signed in, and stubbing
    GitHub for each of them would be noise."""
    from app.db import get_connection
    from app.session import SESSION_COOKIE_NAME, create_session_token
    from app.users import upsert_github_user

    gen = get_connection()
    db = next(gen)
    try:
        user_id = upsert_github_user(db, github_id, login, email)
    finally:
        gen.close()

    client.cookies.set(SESSION_COOKIE_NAME, create_session_token(user_id))
    return user_id


@pytest.fixture()
def authed_client(client):
    """A client carrying a session cookie, for routes that require one."""
    sign_in_as(client, github_id=1, login="authed", email="authed@example.com")
    return client
