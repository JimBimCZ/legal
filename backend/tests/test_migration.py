import sqlite3

import pytest

LEGACY_SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE saved_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type_id TEXT NOT NULL,
    document_type_name TEXT NOT NULL,
    fields_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES saved_documents(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


@pytest.fixture()
def legacy_db(tmp_path, monkeypatch):
    """A SQLite database in the pre-OAuth shape, with one account in it."""
    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(LEGACY_SCHEMA)
    conn.execute(
        "INSERT INTO users (email, hashed_password) VALUES (?, ?)",
        ("legacy@example.com", "not-a-real-hash"),
    )
    conn.execute(
        "INSERT INTO saved_documents (user_id, document_type_id, document_type_name) "
        "VALUES (1, 'Mutual-NDA.md', 'Mutual Non-Disclosure Agreement')"
    )
    conn.commit()
    conn.close()

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from app.db import reset_schema_cache

    reset_schema_cache()
    return db_path


def test_legacy_database_is_dropped_and_rebuilt(legacy_db):
    from app.db import init_db

    init_db()

    conn = sqlite3.connect(legacy_db)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    assert "github_id" in columns
    assert "hashed_password" not in columns
    # The legacy account and its document are gone - this is the clean cutover.
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM saved_documents").fetchone()[0] == 0
    conn.close()


def test_migration_is_idempotent(legacy_db):
    """A second run must not drop data written after the first migration."""
    from app.db import init_db, reset_schema_cache

    init_db()
    conn = sqlite3.connect(legacy_db)
    conn.execute(
        "INSERT INTO users (github_id, github_login, email) VALUES (?, ?, ?)",
        (42, "octocat", "octocat@example.com"),
    )
    conn.commit()
    conn.close()

    reset_schema_cache()
    init_db()

    conn = sqlite3.connect(legacy_db)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    conn.close()
