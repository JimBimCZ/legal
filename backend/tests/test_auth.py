import pytest

from app import github_oauth


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


@pytest.fixture()
def fake_github(monkeypatch):
    """Stub GitHub's three HTTP calls. Mutate the returned dict to change what
    the fake account looks like."""
    account = {"id": 42, "login": "octocat", "email": "octocat@example.com", "verified": True}

    monkeypatch.setattr(
        github_oauth.httpx, "post", lambda url, **kw: FakeResponse({"access_token": "gho_token"})
    )

    def fake_get(url, **kwargs):
        if url.endswith("/user"):
            return FakeResponse({"id": account["id"], "login": account["login"]})
        return FakeResponse(
            [{"email": account["email"], "primary": True, "verified": account["verified"]}]
        )

    monkeypatch.setattr(github_oauth.httpx, "get", fake_get)
    return account


def _start_and_get_state(client):
    """Drive GET /api/auth/github and return the state it minted.

    follow_redirects=False because the target is github.com."""
    response = client.get("/api/auth/github", follow_redirects=False)
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("https://github.com/login/oauth/authorize?")
    return client.cookies[github_oauth.OAUTH_STATE_COOKIE_NAME]


def test_start_redirects_to_github_and_sets_the_state_cookie(client):
    state = _start_and_get_state(client)
    assert state


def test_callback_signs_in_a_new_user(client, fake_github):
    state = _start_and_get_state(client)

    response = client.get(
        f"/api/auth/github/callback?code=the-code&state={state}", follow_redirects=False
    )

    assert response.status_code == 302
    assert response.headers["location"] == "/"
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "octocat@example.com"
    assert me.json()["github_login"] == "octocat"


def test_second_sign_in_reuses_the_same_account(client, fake_github):
    state = _start_and_get_state(client)
    client.get(f"/api/auth/github/callback?code=c1&state={state}", follow_redirects=False)
    first_id = client.get("/api/auth/me").json()["id"]

    state = _start_and_get_state(client)
    client.get(f"/api/auth/github/callback?code=c2&state={state}", follow_redirects=False)

    assert client.get("/api/auth/me").json()["id"] == first_id


def test_callback_rejects_a_mismatched_state(client, fake_github):
    _start_and_get_state(client)

    response = client.get(
        f"/api/auth/github/callback?code=the-code&state={github_oauth.create_state()}",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == "/?auth_error=state"
    assert client.get("/api/auth/me").status_code == 401


def test_callback_rejects_a_missing_state(client, fake_github):
    response = client.get("/api/auth/github/callback?code=the-code", follow_redirects=False)

    assert response.headers["location"] == "/?auth_error=state"
    assert client.get("/api/auth/me").status_code == 401


def test_callback_reports_a_cancelled_authorization(client):
    response = client.get(
        "/api/auth/github/callback?error=access_denied", follow_redirects=False
    )

    assert response.headers["location"] == "/?auth_error=denied"


def test_callback_rejects_an_unverified_email(client, fake_github):
    fake_github["verified"] = False
    state = _start_and_get_state(client)

    response = client.get(
        f"/api/auth/github/callback?code=the-code&state={state}", follow_redirects=False
    )

    assert response.headers["location"] == "/?auth_error=email"
    assert client.get("/api/auth/me").status_code == 401


def test_callback_reports_a_github_failure(client, fake_github, monkeypatch):
    monkeypatch.setattr(
        github_oauth.httpx, "post", lambda url, **kw: FakeResponse({}, status_code=503)
    )
    state = _start_and_get_state(client)

    response = client.get(
        f"/api/auth/github/callback?code=the-code&state={state}", follow_redirects=False
    )

    assert response.headers["location"] == "/?auth_error=github"


def test_callback_rejects_a_non_ascii_state(client):
    """secrets.compare_digest raises TypeError on non-ASCII input rather than
    returning False - that must still resolve to auth_error=state, not a raw
    500."""
    _start_and_get_state(client)

    response = client.get(
        "/api/auth/github/callback?code=the-code&state=%C3%A9", follow_redirects=False
    )

    assert response.status_code == 302
    assert response.headers["location"] == "/?auth_error=state"
    assert client.get("/api/auth/me").status_code == 401


def test_callback_reports_a_database_failure(client, fake_github, monkeypatch):
    """A raised database error (a concurrent-insert race, a dropped Postgres
    connection) must still redirect rather than render a raw 500 - the broad
    except Exception clause is the backstop for this."""

    def failing_upsert(*args, **kwargs):
        raise RuntimeError("database exploded")

    monkeypatch.setattr("app.routes.auth.upsert_github_user", failing_upsert)
    state = _start_and_get_state(client)

    response = client.get(
        f"/api/auth/github/callback?code=the-code&state={state}", follow_redirects=False
    )

    assert response.status_code == 302
    assert response.headers["location"] == "/?auth_error=github"


def test_successful_sign_in_clears_the_state_cookie(client, fake_github):
    """Load-bearing: without this, a replayed code+state pair after a
    successful sign-in would still carry a live oauth_state cookie and
    validate again."""
    state = _start_and_get_state(client)
    client.get(f"/api/auth/github/callback?code=c1&state={state}", follow_redirects=False)

    assert github_oauth.OAUTH_STATE_COOKIE_NAME not in client.cookies

    replay = client.get(
        f"/api/auth/github/callback?code=c2&state={state}", follow_redirects=False
    )
    assert replay.headers["location"] == "/?auth_error=state"


def test_state_cookie_is_httponly_and_samesite_lax(client):
    response = client.get("/api/auth/github", follow_redirects=False)
    set_cookie_headers = response.headers.get_list("set-cookie")
    state_cookie = next(
        h for h in set_cookie_headers if h.startswith(f"{github_oauth.OAUTH_STATE_COOKIE_NAME}=")
    )

    assert "httponly" in state_cookie.lower()
    # Lax, not Strict: Strict would withhold the cookie on the cross-site
    # return from github.com and break sign-in for every real browser.
    assert "samesite=lax" in state_cookie.lower()


def test_session_cookie_is_httponly_and_samesite_lax(client, fake_github):
    from app.session import SESSION_COOKIE_NAME

    state = _start_and_get_state(client)
    response = client.get(
        f"/api/auth/github/callback?code=c&state={state}", follow_redirects=False
    )
    set_cookie_headers = response.headers.get_list("set-cookie")
    session_cookie = next(
        h for h in set_cookie_headers if h.startswith(f"{SESSION_COOKIE_NAME}=")
    )

    assert "httponly" in session_cookie.lower()
    assert "samesite=lax" in session_cookie.lower()


def test_no_failure_path_returns_json(client, fake_github):
    """The callback is a top-level navigation - raw JSON would land in the
    user's browser."""
    for query in ("error=access_denied", "code=c&state=bogus"):
        response = client.get(f"/api/auth/github/callback?{query}", follow_redirects=False)
        assert response.status_code == 302
        assert "auth_error" in response.headers["location"]


def test_me_requires_a_session(client):
    assert client.get("/api/auth/me").status_code == 401


def test_logout_clears_the_session(client, fake_github):
    state = _start_and_get_state(client)
    client.get(f"/api/auth/github/callback?code=c&state={state}", follow_redirects=False)

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_password_endpoints_are_gone(client):
    # 404, not 405: the routes are not registered under any method, so their
    # paths don't match at all (405 would mean the path matched a different
    # method).
    assert client.post("/api/auth/signup", json={"email": "a@b.c", "password": "x" * 10}).status_code == 404
    assert client.post("/api/auth/signin", json={"email": "a@b.c", "password": "x" * 10}).status_code == 404
