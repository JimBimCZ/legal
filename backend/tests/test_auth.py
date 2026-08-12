from fastapi.testclient import TestClient


def test_signup_success(client):
    response = client.post(
        "/api/auth/signup", json={"email": "acme@example.com", "password": "password123"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "acme@example.com"
    assert isinstance(body["id"], int)
    assert "created_at" in body
    assert "password" not in body
    assert "hashed_password" not in body


def test_signup_sets_session_cookie(client):
    response = client.post(
        "/api/auth/signup", json={"email": "cookie@example.com", "password": "password123"}
    )
    assert "session" in response.cookies
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "cookie@example.com"


def test_signup_duplicate_email_rejected(client):
    client.post("/api/auth/signup", json={"email": "dup@example.com", "password": "password123"})
    response = client.post(
        "/api/auth/signup", json={"email": "dup@example.com", "password": "different123"}
    )
    assert response.status_code == 409


def test_signup_rejects_short_password(client):
    response = client.post(
        "/api/auth/signup", json={"email": "short@example.com", "password": "short"}
    )
    assert response.status_code == 422


def test_signup_rejects_invalid_email(client):
    response = client.post(
        "/api/auth/signup", json={"email": "not-an-email", "password": "password123"}
    )
    assert response.status_code == 422


def test_signin_success(client):
    client.post("/api/auth/signup", json={"email": "signin@example.com", "password": "password123"})
    response = client.post(
        "/api/auth/signin", json={"email": "signin@example.com", "password": "password123"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "signin@example.com"


def test_signin_wrong_password_rejected(client):
    client.post("/api/auth/signup", json={"email": "wrongpw@example.com", "password": "password123"})
    response = client.post(
        "/api/auth/signin", json={"email": "wrongpw@example.com", "password": "nope12345"}
    )
    assert response.status_code == 401


def test_signin_unknown_email_rejected(client):
    response = client.post(
        "/api/auth/signin", json={"email": "ghost@example.com", "password": "password123"}
    )
    assert response.status_code == 401


def test_signin_wrong_password_and_unknown_email_give_same_error_detail(client):
    client.post("/api/auth/signup", json={"email": "enum@example.com", "password": "password123"})
    wrong_password = client.post(
        "/api/auth/signin", json={"email": "enum@example.com", "password": "nope12345"}
    )
    unknown_email = client.post(
        "/api/auth/signin", json={"email": "nobody@example.com", "password": "password123"}
    )
    assert wrong_password.json()["detail"] == unknown_email.json()["detail"]


def test_signin_sets_session_cookie(client):
    client.post("/api/auth/signup", json={"email": "signincookie@example.com", "password": "password123"})
    client.cookies.clear()
    response = client.post(
        "/api/auth/signin", json={"email": "signincookie@example.com", "password": "password123"}
    )
    assert "session" in response.cookies


def test_me_requires_authentication(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_returns_current_user(authed_client):
    response = authed_client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "authed@example.com"


def test_logout_clears_session(authed_client):
    assert authed_client.get("/api/auth/me").status_code == 200
    logout = authed_client.post("/api/auth/logout")
    assert logout.status_code == 204
    assert authed_client.get("/api/auth/me").status_code == 401


def test_credentials_survive_a_restart(tmp_path, monkeypatch):
    """Two app lifespans against one DATABASE_PATH == a process restart. The
    second boot must re-use the existing database instead of recreating it,
    otherwise every restart forces the user to sign up all over again."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "restart.db"))
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "static-does-not-exist"))

    from app.main import app

    with TestClient(app) as first_boot:
        signup = first_boot.post(
            "/api/auth/signup", json={"email": "persist@example.com", "password": "password123"}
        )
        assert signup.status_code == 201

    with TestClient(app) as second_boot:
        signin = second_boot.post(
            "/api/auth/signin", json={"email": "persist@example.com", "password": "password123"}
        )
        assert signin.status_code == 200
        assert signin.json()["email"] == "persist@example.com"
