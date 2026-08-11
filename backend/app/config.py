import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def get_db_path() -> Path:
    """Read live (not cached) so tests can point this at an isolated tmp path."""
    return Path(os.environ.get("DATABASE_PATH", BACKEND_ROOT / "data" / "app.db"))


def get_static_dir() -> Path:
    return Path(os.environ.get("STATIC_DIR", BACKEND_ROOT / "static"))
