import sqlite3
import threading
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import Any

from .config import get_database_url, get_db_path

# Two schemas rather than one portable string: the id and timestamp-default
# syntaxes have no common spelling. Everything else - the CHECK constraint,
# the ON DELETE CASCADE, the IF NOT EXISTS indexes - is identical in both.
#
# Timestamps are TEXT in *both* dialects, holding "YYYY-MM-DD HH:MM:SS" UTC.
# Postgres would more naturally use timestamptz, but the API models these as
# plain strings (UserResponse.created_at, SavedDocumentSummary.updatedAt), and
# that format sorts lexicographically the same way it sorts chronologically -
# so "ORDER BY updated_at DESC" keeps working without a cast.

SQLITE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id INTEGER NOT NULL UNIQUE,
    github_login TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type_id TEXT NOT NULL,
    document_type_name TEXT NOT NULL,
    fields_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_saved_documents_user_id ON saved_documents(user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES saved_documents(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_document_id ON chat_messages(document_id);
"""

_PG_NOW = "to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')"

POSTGRES_SCHEMA_SQL = f"""
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    github_id BIGINT NOT NULL UNIQUE,
    github_login TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT {_PG_NOW}
);

CREATE TABLE IF NOT EXISTS saved_documents (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type_id TEXT NOT NULL,
    document_type_name TEXT NOT NULL,
    fields_json TEXT NOT NULL DEFAULT '{{}}',
    created_at TEXT NOT NULL DEFAULT {_PG_NOW},
    updated_at TEXT NOT NULL DEFAULT {_PG_NOW}
);
CREATE INDEX IF NOT EXISTS idx_saved_documents_user_id ON saved_documents(user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES saved_documents(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT {_PG_NOW}
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_document_id ON chat_messages(document_id);
"""


def utc_now_text() -> str:
    """The timestamp format both schemas store, generated in Python.

    Used where a statement needs to *set* a timestamp: SQLite spells that
    `datetime('now')` and Postgres `now()`, and their outputs are formatted
    differently, so neither belongs inline in shared SQL."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def is_postgres() -> bool:
    """Postgres when a DATABASE_URL is set (Vercel, via the Neon integration),
    SQLite otherwise (local runs, Docker, and the test suite)."""
    return get_database_url() is not None


class Database:
    """Thin wrapper giving both drivers one call shape, so route and repository
    code stays dialect-agnostic.

    Covers the three places sqlite3 and psycopg actually diverge: the
    placeholder style (`?` vs `%s`), how a new row's id comes back
    (`lastrowid` vs `RETURNING id`), and row access (sqlite3.Row vs dict_row -
    both already support `row["col"]` and `dict(row)`, so callers need no
    change there)."""

    def __init__(self, conn: Any, postgres: bool) -> None:
        self._conn = conn
        self._postgres = postgres

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> Any:
        if self._postgres:
            sql = sql.replace("?", "%s")
        return self._conn.execute(sql, params)

    def insert_returning_id(self, sql: str, params: tuple[Any, ...] = ()) -> int:
        """Run an INSERT and return the new row's primary key."""
        if self._postgres:
            row = self.execute(sql + " RETURNING id", params).fetchone()
            return int(row["id"])
        return int(self.execute(sql, params).lastrowid)

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


def _connect() -> Database:
    if is_postgres():
        import psycopg
        from psycopg.rows import dict_row

        conn = psycopg.connect(get_database_url(), row_factory=dict_row)
        return Database(conn, postgres=True)

    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return Database(conn, postgres=False)


def has_legacy_password_column(conn: Any, postgres: bool) -> bool:
    """True when `users` still has the pre-OAuth `hashed_password` column.

    The schema strings are all CREATE TABLE IF NOT EXISTS, so an existing
    table is never altered - a database from before GitHub sign-in would keep
    its old shape forever and never gain github_id. Detecting that shape is
    what lets init_db replace it."""
    if postgres:
        row = conn.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'users' AND column_name = 'hashed_password'"
        ).fetchone()
        return row is not None
    return any(row[1] == "hashed_password" for row in conn.execute("PRAGMA table_info(users)"))


def _drop_legacy_tables(conn: Any, postgres: bool) -> None:
    """Drop everything the old password-based schema owned.

    Destructive on purpose: accounts cannot be carried across, because the old
    rows have no GitHub identity to match on. Children first so SQLite's
    foreign keys stay satisfied."""
    suffix = " CASCADE" if postgres else ""
    for table in ("chat_messages", "saved_documents", "users"):
        conn.execute(f"DROP TABLE IF EXISTS {table}{suffix}")


def init_db() -> None:
    """Ensure the schema exists, leaving any already-stored data in place.

    The one exception is a database still in the pre-OAuth shape: those tables
    are dropped and rebuilt, because password accounts have no GitHub identity
    to migrate onto. See _drop_legacy_tables."""
    if is_postgres():
        import psycopg

        with psycopg.connect(get_database_url()) as conn:
            if has_legacy_password_column(conn, postgres=True):
                _drop_legacy_tables(conn, postgres=True)
            conn.execute(POSTGRES_SCHEMA_SQL)
            conn.commit()
        return

    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        if has_legacy_password_column(conn, postgres=False):
            _drop_legacy_tables(conn, postgres=False)
        conn.executescript(SQLITE_SCHEMA_SQL)
        conn.commit()
    finally:
        conn.close()


_schema_lock = threading.Lock()
_schema_target: str | None = None


def _current_target() -> str:
    return get_database_url() or str(get_db_path())


def reset_schema_cache() -> None:
    """Forget that the schema was created, so the next connection rebuilds it.
    Only needed by tests, which reset the database between cases."""
    global _schema_target
    with _schema_lock:
        _schema_target = None


def ensure_schema() -> None:
    """Create the schema on first use, at most once per database.

    Deliberately *not* called during application startup. Vercel gives a
    container a limited budget to boot, and reaching Neon inside it was enough
    to exceed that - Neon's free tier suspends when idle and takes seconds to
    wake, so every cold start was killed mid-initialization and retried in a
    loop. Paying that cost on the first request instead keeps startup instant,
    and leaves /api/health answerable without touching the database at all."""
    global _schema_target
    target = _current_target()
    if _schema_target == target:
        return
    with _schema_lock:
        if _schema_target == target:
            return
        init_db()
        _schema_target = target


def get_connection() -> Iterator[Database]:
    ensure_schema()
    db = _connect()
    try:
        yield db
    finally:
        db.close()
