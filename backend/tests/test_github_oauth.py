import pytest


@pytest.fixture(autouse=True)
def oauth_env(monkeypatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


def test_authorize_url_carries_client_id_scope_and_state():
    from app.github_oauth import authorize_url

    url = authorize_url("signed-state")

    assert url.startswith("https://github.com/login/oauth/authorize?")
    assert "client_id=test-client-id" in url
    # user%3Aemail is "user:email" percent-encoded.
    assert "scope=user%3Aemail" in url
    assert "state=signed-state" in url
    # The OAuth App's registered callback is used instead.
    assert "redirect_uri" not in url


def test_state_round_trips():
    from app.github_oauth import create_state, state_is_valid

    state = create_state()
    assert state_is_valid(state, state) is True


def test_state_rejects_a_mismatched_cookie():
    from app.github_oauth import create_state, state_is_valid

    assert state_is_valid(create_state(), create_state()) is False


def test_state_rejects_missing_values():
    from app.github_oauth import create_state, state_is_valid

    assert state_is_valid(None, create_state()) is False
    assert state_is_valid(create_state(), None) is False


def test_state_rejects_an_unsigned_value():
    """Matching cookie and query alone must not be enough - otherwise an
    attacker who can set a cookie can choose both halves."""
    from app.github_oauth import state_is_valid

    assert state_is_valid("not-signed", "not-signed") is False


def test_state_rejects_an_expired_value(monkeypatch):
    from app import github_oauth

    state = github_oauth.create_state()
    monkeypatch.setattr(github_oauth, "STATE_MAX_AGE_SECONDS", -1)
    assert github_oauth.state_is_valid(state, state) is False


def test_exchange_code_returns_the_access_token(monkeypatch):
    from app import github_oauth

    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs["json"]
        captured["headers"] = kwargs["headers"]
        return FakeResponse({"access_token": "gho_token", "token_type": "bearer"})

    monkeypatch.setattr(github_oauth.httpx, "post", fake_post)

    assert github_oauth.exchange_code_for_token("the-code") == "gho_token"
    assert captured["url"] == "https://github.com/login/oauth/access_token"
    assert captured["headers"]["Accept"] == "application/json"
    assert captured["json"]["code"] == "the-code"
    assert captured["json"]["client_secret"] == "test-client-secret"


def test_exchange_code_raises_when_github_returns_an_error(monkeypatch):
    from app import github_oauth

    monkeypatch.setattr(
        github_oauth.httpx, "post", lambda url, **kw: FakeResponse({"error": "bad_verification_code"})
    )
    with pytest.raises(github_oauth.GitHubOAuthError):
        github_oauth.exchange_code_for_token("stale-code")


def test_exchange_code_raises_on_a_non_200(monkeypatch):
    from app import github_oauth

    monkeypatch.setattr(github_oauth.httpx, "post", lambda url, **kw: FakeResponse({}, status_code=503))
    with pytest.raises(github_oauth.GitHubOAuthError):
        github_oauth.exchange_code_for_token("the-code")


def _fake_get(user_payload, emails_payload, status_code=200):
    def fake_get(url, **kwargs):
        if url.endswith("/user"):
            return FakeResponse(user_payload, status_code)
        return FakeResponse(emails_payload, status_code)

    return fake_get


def test_fetch_identity_returns_the_verified_primary_email(monkeypatch):
    from app import github_oauth

    monkeypatch.setattr(
        github_oauth.httpx,
        "get",
        _fake_get(
            {"id": 42, "login": "octocat"},
            [
                {"email": "secondary@example.com", "primary": False, "verified": True},
                {"email": "primary@example.com", "primary": True, "verified": True},
            ],
        ),
    )

    assert github_oauth.fetch_identity("gho_token") == (42, "octocat", "primary@example.com")


def test_fetch_identity_rejects_an_unverified_primary_email(monkeypatch):
    from app import github_oauth

    monkeypatch.setattr(
        github_oauth.httpx,
        "get",
        _fake_get(
            {"id": 42, "login": "octocat"},
            [{"email": "primary@example.com", "primary": True, "verified": False}],
        ),
    )

    with pytest.raises(github_oauth.NoVerifiedEmailError):
        github_oauth.fetch_identity("gho_token")


def test_fetch_identity_rejects_an_account_with_no_emails(monkeypatch):
    from app import github_oauth

    monkeypatch.setattr(github_oauth.httpx, "get", _fake_get({"id": 42, "login": "octocat"}, []))

    with pytest.raises(github_oauth.NoVerifiedEmailError):
        github_oauth.fetch_identity("gho_token")


def test_fetch_identity_raises_when_the_user_call_fails(monkeypatch):
    from app import github_oauth

    monkeypatch.setattr(github_oauth.httpx, "get", _fake_get({}, [], status_code=401))

    with pytest.raises(github_oauth.GitHubOAuthError):
        github_oauth.fetch_identity("gho_token")
