from fastapi import APIRouter, Cookie, Depends, Response, status
from fastapi.responses import RedirectResponse

from ..config import get_cookie_secure, github_oauth_configured
from ..db import Database, get_connection
from ..deps import get_current_user
from ..github_oauth import (
    OAUTH_STATE_COOKIE_NAME,
    STATE_MAX_AGE_SECONDS,
    GitHubOAuthError,
    NoVerifiedEmailError,
    authorize_url,
    create_state,
    exchange_code_for_token,
    fetch_identity,
    state_is_valid,
)
from ..schemas import UserResponse
from ..session import SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, create_session_token
from ..users import LOCAL_DEV_GITHUB_ID, upsert_github_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session_cookie(response: Response, user_id: int) -> None:
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_token(user_id),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=get_cookie_secure(),
    )


def _signed_in_redirect(user_id: int) -> RedirectResponse:
    response = RedirectResponse("/", status_code=status.HTTP_302_FOUND)
    _set_session_cookie(response, user_id)
    response.delete_cookie(OAUTH_STATE_COOKIE_NAME)
    return response


def _auth_error_redirect(code: str) -> RedirectResponse:
    """Every callback failure lands here.

    The callback is a top-level browser navigation, so raising HTTPException
    would render raw JSON at the user. The auth screen reads auth_error from
    the query string and renders a message instead."""
    response = RedirectResponse(f"/?auth_error={code}", status_code=status.HTTP_302_FOUND)
    response.delete_cookie(OAUTH_STATE_COOKIE_NAME)
    return response


@router.get("/github")
def github_start(db: Database = Depends(get_connection)) -> RedirectResponse:
    if not github_oauth_configured():
        # Local development: no credentials, so no round-trip to make. Boot
        # refuses this path on anything resembling a deployment - see
        # main.assert_safe_auth_config.
        user_id = upsert_github_user(db, LOCAL_DEV_GITHUB_ID, "local", "local@localhost")
        return _signed_in_redirect(user_id)

    state = create_state()
    response = RedirectResponse(authorize_url(state), status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        OAUTH_STATE_COOKIE_NAME,
        state,
        max_age=STATE_MAX_AGE_SECONDS,
        httponly=True,
        # Lax, not Strict: the cookie has to survive the redirect back from
        # github.com, and Strict would withhold it on a cross-site navigation.
        samesite="lax",
        secure=get_cookie_secure(),
    )
    return response


@router.get("/github/callback")
def github_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    oauth_state: str | None = Cookie(default=None, alias=OAUTH_STATE_COOKIE_NAME),
    db: Database = Depends(get_connection),
) -> RedirectResponse:
    if error or not code:
        return _auth_error_redirect("denied")

    try:
        state_valid = state_is_valid(state, oauth_state)
    except TypeError:
        # secrets.compare_digest refuses non-ASCII input outright rather than
        # just returning False - a forged/garbled state is still a state
        # failure, not an unhandled 500.
        state_valid = False
    if not state_valid:
        return _auth_error_redirect("state")

    try:
        github_id, login, email = fetch_identity(exchange_code_for_token(code))
        user_id = upsert_github_user(db, github_id, login, email)
    except NoVerifiedEmailError:
        return _auth_error_redirect("email")
    except (GitHubOAuthError, OSError):
        # OSError covers httpx's transport failures - DNS, connection, timeout.
        return _auth_error_redirect("github")
    except Exception:
        # Backstop, not a replacement for the specific clauses above: a
        # concurrent-insert race on users.github_id, a dropped Postgres
        # connection mid-callback, or anything else unanticipated. This is a
        # top-level browser navigation and must never render a raw 500.
        return _auth_error_redirect("github")

    return _signed_in_redirect(user_id)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME)


@router.get("/me", response_model=UserResponse)
def me(user: UserResponse = Depends(get_current_user)) -> UserResponse:
    return user
