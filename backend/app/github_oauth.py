"""Everything that talks to GitHub, plus the CSRF state the flow rides on.

Kept separate from routes/auth.py so the HTTP calls can be stubbed in tests
without a routing layer in the way."""

import secrets
from typing import Any
from urllib.parse import urlencode

import httpx
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import get_github_client_id, get_github_client_secret, get_session_secret

AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"
USER_URL = "https://api.github.com/user"
USER_EMAILS_URL = "https://api.github.com/user/emails"

# The narrowest scope that still yields a verified address. Without it, GET
# /user returns only a *public* email, which most accounts do not set.
SCOPE = "user:email"

OAUTH_STATE_COOKIE_NAME = "oauth_state"
STATE_MAX_AGE_SECONDS = 600

# GitHub is a third party on the request path; a slow response should surface
# as a failed sign-in rather than a hung worker.
REQUEST_TIMEOUT_SECONDS = 10.0


class GitHubOAuthError(Exception):
    """GitHub could not be reached, or returned something unusable."""


class NoVerifiedEmailError(GitHubOAuthError):
    """The account has no address that is both primary and verified."""


def _state_serializer() -> URLSafeTimedSerializer:
    # A distinct salt from the session serializer, so a session token can never
    # be replayed as a state value or the reverse.
    return URLSafeTimedSerializer(get_session_secret(), salt="legal-app-oauth-state")


def create_state() -> str:
    return _state_serializer().dumps(secrets.token_urlsafe(32))


def state_is_valid(state: str | None, cookie_state: str | None) -> bool:
    """Both halves of the CSRF check.

    The signature alone is not enough - an attacker could mint a state by
    replaying an old one of their own - and cookie equality alone is not
    enough either, since an attacker who can set a cookie controls both sides.
    Requiring the pair closes both."""
    if not state or not cookie_state:
        return False
    if not secrets.compare_digest(state, cookie_state):
        return False
    try:
        _state_serializer().loads(state, max_age=STATE_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return False
    return True


def authorize_url(state: str) -> str:
    """No redirect_uri: GitHub falls back to the callback registered on the
    OAuth App, which is the only correct value there has ever been."""
    params = urlencode({"client_id": get_github_client_id(), "scope": SCOPE, "state": state})
    return f"{AUTHORIZE_URL}?{params}"


def exchange_code_for_token(code: str) -> str:
    response = httpx.post(
        ACCESS_TOKEN_URL,
        headers={"Accept": "application/json"},
        json={
            "client_id": get_github_client_id(),
            "client_secret": get_github_client_secret(),
            "code": code,
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        raise GitHubOAuthError(f"token exchange returned {response.status_code}")
    # GitHub reports a bad or stale code as a 200 with an `error` key.
    token = response.json().get("access_token")
    if not token:
        raise GitHubOAuthError("no access_token in GitHub's response")
    return str(token)


def _api_get(url: str, access_token: str) -> Any:
    response = httpx.get(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        raise GitHubOAuthError(f"GET {url} returned {response.status_code}")
    return response.json()


def fetch_identity(access_token: str) -> tuple[int, str, str]:
    """Return (github_id, login, verified primary email).

    An unverified address is refused rather than stored: it is the only thing
    tying an account to a person we can contact, and GitHub does not require
    one to be verified."""
    user = _api_get(USER_URL, access_token)
    github_id = user.get("id")
    login = user.get("login")
    if github_id is None or not login:
        raise GitHubOAuthError("GitHub returned no id or login")

    for entry in _api_get(USER_EMAILS_URL, access_token):
        if entry.get("primary") and entry.get("verified"):
            return int(github_id), str(login), str(entry["email"])
    raise NoVerifiedEmailError("no verified primary email on the GitHub account")
