from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import (
    BACKEND_ROOT,
    DEFAULT_SESSION_SECRET,
    get_cookie_secure,
    get_database_url,
    get_session_secret,
    get_static_dir,
    github_oauth_configured,
)
from .routes import auth, chat, documents, health, saved_documents

# No-op if the file is absent (e.g. in the Docker image, where the key is
# instead injected as a real env var via `docker run --env-file`).
load_dotenv(BACKEND_ROOT.parent / ".env")


def assert_safe_auth_config() -> None:
    """Refuse to serve the development sign-in bypass on a real deployment.

    With no GitHub credentials, /api/auth/github issues a session to anyone who
    requests it - which is fine on a laptop and catastrophic in public. Vercel
    sets both DATABASE_URL and COOKIE_SECURE, so either one alongside missing
    credentials means the bypass is about to be exposed.

    Same reasoning applies to the session secret: this repository is public,
    so DEFAULT_SESSION_SECRET is a published value. Session tokens are just an
    itsdangerous signature over a bare user id, so leaving the default in
    place on a real deployment lets anyone forge a session for any user - and
    this branch puts DELETE /api/auth/me behind that signature."""
    # Checked independently, not one "return early" followed by the next: a
    # deployment can have valid OAuth credentials and still be booting with
    # the published default session secret, which is exactly the case the
    # second check exists to catch.
    looks_like_a_real_deployment = bool(get_database_url() or get_cookie_secure())

    if not github_oauth_configured() and looks_like_a_real_deployment:
        raise RuntimeError(
            "GitHub OAuth is not configured, but DATABASE_URL or COOKIE_SECURE is "
            "set, which means this is a real deployment. Refusing to start with "
            "the local development sign-in bypass enabled. Set GITHUB_CLIENT_ID "
            "and GITHUB_CLIENT_SECRET."
        )

    if get_session_secret() == DEFAULT_SESSION_SECRET and looks_like_a_real_deployment:
        raise RuntimeError(
            "SESSION_SECRET is still the published default, but DATABASE_URL or "
            "COOKIE_SECURE is set, which means this is a real deployment. "
            "Refusing to start with a forgeable session secret - anyone could sign "
            "a session token for any user. Set SESSION_SECRET to a random value."
        )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Schema creation deliberately does not happen here - see db.ensure_schema
    # for why (Vercel's boot budget). This check touches no network and no
    # database, so it is safe to run at startup.
    assert_safe_auth_config()
    yield


app = FastAPI(title="Legal Platform API", lifespan=lifespan)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(saved_documents.router)

# Registered after the routers above so "/api/*" always wins over this
# catch-all mount. Guarded so `uv run uvicorn` still boots standalone before
# the frontend has ever been built.
static_dir = get_static_dir()
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
