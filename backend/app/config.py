import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def get_db_path() -> Path:
    """Read live (not cached) so tests can point this at an isolated tmp path."""
    return Path(os.environ.get("DATABASE_PATH", BACKEND_ROOT / "data" / "app.db"))


def get_static_dir() -> Path:
    return Path(os.environ.get("STATIC_DIR", BACKEND_ROOT / "static"))


def get_repo_root() -> Path:
    return Path(os.environ.get("REPO_ROOT", BACKEND_ROOT.parent))


def get_catalog_path() -> Path:
    return get_repo_root() / "catalog.json"


def get_templates_dir() -> Path:
    return get_repo_root() / "templates"


def get_session_secret() -> str:
    """Read live (not cached) so tests can point this at an isolated value.
    Falls back to a fixed dev-only value so local/test runs work without
    extra setup; production deployments should set SESSION_SECRET via .env,
    the same delivery mechanism already used for OPENROUTER_API_KEY."""
    return os.environ.get("SESSION_SECRET", "dev-insecure-session-secret-change-me")


def get_cookie_secure() -> bool:
    """Whether the session cookie should require HTTPS. Defaults to False
    since the app currently runs over plain HTTP; flip via env var once
    served behind TLS."""
    return os.environ.get("COOKIE_SECURE", "false").lower() == "true"
