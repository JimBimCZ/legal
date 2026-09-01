import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def get_db_path() -> Path:
    """Read live (not cached) so tests can point this at an isolated tmp path."""
    return Path(os.environ.get("DATABASE_PATH", BACKEND_ROOT / "data" / "app.db"))


def get_database_url() -> str | None:
    """Postgres connection string. Set on Vercel by the Neon integration
    (which provides DATABASE_URL); absent locally, where SQLite is used
    instead. Prefer the pooled URL - the container scales to zero and back,
    so connections are opened and dropped often."""
    return os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or None


def get_static_dir() -> Path:
    return Path(os.environ.get("STATIC_DIR", BACKEND_ROOT / "static"))


def get_repo_root() -> Path:
    return Path(os.environ.get("REPO_ROOT", BACKEND_ROOT.parent))


def get_catalog_path() -> Path:
    return get_repo_root() / "catalog.json"


def get_templates_dir() -> Path:
    return get_repo_root() / "templates"


DEFAULT_SESSION_SECRET = "dev-insecure-session-secret-change-me"


def get_session_secret() -> str:
    """Read live (not cached) so tests can point this at an isolated value.
    Falls back to a fixed dev-only value so local/test runs work without
    extra setup; production deployments should set SESSION_SECRET via .env,
    the same delivery mechanism already used for OPENROUTER_API_KEY.

    That fallback is published in this repository's own source, so
    main.assert_safe_auth_config refuses to boot a real deployment still
    using it - see DEFAULT_SESSION_SECRET."""
    return os.environ.get("SESSION_SECRET", DEFAULT_SESSION_SECRET)


def get_cookie_secure() -> bool:
    """Whether the session cookie should require HTTPS. Defaults to False
    since the app currently runs over plain HTTP; flip via env var once
    served behind TLS. Accepts the common truthy spellings - Vercel and
    Docker deployments set these by hand and "1"/"yes"/"on" are all
    plausible - not just the literal string "true"."""
    return os.environ.get("COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes", "on"}


def get_github_client_id() -> str | None:
    """The OAuth App's client id. Production-only: setting this locally sends
    local sign-in through GitHub, which then redirects to the production
    callback registered on the app, so the round-trip never completes."""
    return os.environ.get("GITHUB_CLIENT_ID") or None


def get_github_client_secret() -> str | None:
    return os.environ.get("GITHUB_CLIENT_SECRET") or None


def github_oauth_configured() -> bool:
    """Both halves present. `or None` above means an empty string - which is
    how an unset Vercel variable arrives - counts as absent."""
    return bool(get_github_client_id() and get_github_client_secret())
