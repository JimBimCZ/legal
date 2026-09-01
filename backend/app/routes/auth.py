import logging
from collections.abc import Iterator
from contextlib import contextmanager

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
from ..users import LOCAL_DEV_GITHUB_ID, delete_user, upsert_github_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@contextmanager
def _db_connection() -> Iterator[Database]:
    """The same generator get_connection() runs as a FastAPI dependency,
    called directly instead of via Depends.

    FastAPI resolves a Depends() argument *before* the route body runs, and
    get_connection() calls ensure_schema(), which touches the database. Used
    as a dependency, a database failure there (e.g. Neon's free tier waking
    from idle, per db.py's ensure_schema docstring) happens outside the
    route's own try/except and surfaces as a raw 500 - unacceptable here,
    since both routes below are top-level browser navigations that must
    redirect on every failure. Calling the same generator by hand puts that
    failure inside the route body, where it can be caught."""
    gen = get_connection()
    db = next(gen)
    try:
        yield db
    finally:
        gen.close()


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
def github_start() -> RedirectResponse:
    if not github_oauth_configured():
        # Local development: no credentials, so no round-trip to make. Boot
        # refuses this path on anything resembling a deployment - see
        # main.assert_safe_auth_config. The database is only touched on this
        # branch - the configured path below just builds a URL and redirects
        # - so the connection is opened here, not as a route-wide dependency.
        try:
            with _db_connection() as db:
                user_id = upsert_github_user(db, LOCAL_DEV_GITHUB_ID, "local", "local@localhost")
        except Exception:
            logger.exception("dev sign-in bypass could not reach the database")
            return _auth_error_redirect("github")
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

    # The database connection is opened inside this try, not via Depends, so
    # ensure_schema() failing (e.g. Neon waking from idle) lands in the
    # generic except below and redirects, instead of failing dependency
    # resolution before the route body - and this try/except - ever run.
    try:
        github_id, login, email = fetch_identity(exchange_code_for_token(code))
        with _db_connection() as db:
            user_id = upsert_github_user(db, github_id, login, email)
    except NoVerifiedEmailError:
        logger.exception("github sign-in: account has no verified email")
        return _auth_error_redirect("email")
    except (GitHubOAuthError, OSError):
        # OSError covers httpx's transport failures - DNS, connection, timeout.
        logger.exception("github sign-in: failed exchanging code or reaching GitHub (auth_error=github)")
        return _auth_error_redirect("github")
    except Exception:
        # Backstop, not a replacement for the specific clauses above: a
        # concurrent-insert race on users.github_id, a dropped Postgres
        # connection mid-callback, or anything else unanticipated. This is a
        # top-level browser navigation and must never render a raw 500.
        # Never logs the authorization code, access token, or client secret -
        # only the exception class/message and the auth_error code returned.
        logger.exception("github sign-in: unexpected failure in callback (auth_error=github)")
        return _auth_error_redirect("github")

    return _signed_in_redirect(user_id)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME)


@router.get("/me", response_model=UserResponse)
def me(user: UserResponse = Depends(get_current_user)) -> UserResponse:
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    response: Response,
    user: UserResponse = Depends(get_current_user),
    db: Database = Depends(get_connection),
) -> None:
    """Erasure, self-serve. The cascades on saved_documents and chat_messages
    take the user's documents and transcripts with the row."""
    delete_user(db, user.id)
    response.delete_cookie(SESSION_COOKIE_NAME)
