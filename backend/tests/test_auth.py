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
