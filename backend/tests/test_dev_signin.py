import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def unconfigured_client(tmp_path, monkeypatch):
    """A client with no GitHub credentials, so the development bypass is live.

    Skipped against Postgres: DATABASE_URL alongside an unconfigured OAuth app
    is exactly what assert_safe_auth_config refuses to start on."""
    if os.environ.get("TEST_DATABASE_URL"):
        pytest.skip("the bypass is refused whenever DATABASE_URL is set")

    monkeypatch.delenv("GITHUB_CLIENT_ID", raising=False)
    monkeypatch.delenv("GITHUB_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "static-does-not-exist"))

    from app.db import reset_schema_cache

    reset_schema_cache()
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def test_bypass_signs_in_without_contacting_github(unconfigured_client):
    response = unconfigured_client.get("/api/auth/github", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == "/"
    me = unconfigured_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "local@localhost"
    assert me.json()["github_login"] == "local"


def test_bypass_reuses_one_local_account(unconfigured_client):
    unconfigured_client.get("/api/auth/github", follow_redirects=False)
    first_id = unconfigured_client.get("/api/auth/me").json()["id"]
    unconfigured_client.get("/api/auth/github", follow_redirects=False)

    assert unconfigured_client.get("/api/auth/me").json()["id"] == first_id
