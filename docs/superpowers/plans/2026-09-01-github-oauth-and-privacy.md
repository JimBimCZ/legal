# GitHub OAuth, Account Deletion, and Privacy Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace email/password authentication with GitHub OAuth, let users delete their own account and all its data, and publish a privacy policy describing what the app collects and who receives it.

**Architecture:** A new `github_oauth.py` module owns every call to GitHub and the CSRF state signing; a new `users.py` repository owns the two user-row operations. `routes/auth.py` becomes a thin layer over both. Because the OAuth callback is a top-level browser navigation, it never raises — every failure redirects to `/?auth_error=<code>` and the auth screen renders the message. When GitHub credentials are absent the start route mints a local session instead of contacting GitHub, hard-gated so it cannot run alongside any signal of a real deployment.

**Tech Stack:** FastAPI, Pydantic, `itsdangerous` (already used for session signing), `httpx` (promoted from dev to runtime dependency), SQLite and Postgres behind the existing `Database` wrapper, Next.js 16 + React 19, Vitest + Testing Library, pytest.

**Spec:** `docs/superpowers/specs/2026-09-01-github-oauth-and-privacy-design.md`

## Global Constraints

- `github_id` is the identity key. `email` is stored but carries **no** UNIQUE constraint.
- The OAuth callback **never** raises `HTTPException` — it is a browser navigation, so every failure path is a `RedirectResponse` to `/?auth_error=<code>`. Codes: `denied`, `state`, `email`, `github`.
- OAuth scope is exactly `user:email`. No other scope is requested.
- `redirect_uri` is **not** sent to GitHub; the OAuth App's registered callback URL is used.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are production-only. Setting them locally breaks local sign-in.
- The dev bypass user is `github_id = 0`, `github_login = "local"`, `email = "local@localhost"`.
- Both `oauth_state` and `session` cookies use `SameSite=Lax`, `HttpOnly`, and `secure=get_cookie_secure()`.
- State lifetime is 600 seconds.
- Repository modules take `db: Database` as their first parameter and raise module-level exception classes, matching `saved_documents.py`.
- Controller named in the privacy policy: Vít Bušek, `busek.vit@gmail.com`.
- Every task ends with `cd backend && uv run pytest` (backend tasks) or `cd frontend && npm test` (frontend tasks) fully green before commit.

---

### Task 1: Rebuild the users schema and add the destructive legacy migration

**Files:**
- Modify: `backend/app/db.py:20-45` (SQLite schema), `backend/app/db.py:51-77` (Postgres schema), `init_db` at `backend/app/db.py:~143`
- Create: `backend/tests/test_migration.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `users` table with columns `id`, `github_id`, `github_login`, `email`, `created_at`. Helper `has_legacy_password_column(conn, postgres: bool) -> bool` in `db.py`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_migration.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_migration.py -v`
Expected: FAIL — `test_legacy_database_is_dropped_and_rebuilt` fails because `github_id` is not in the columns (the legacy table survives untouched under `CREATE TABLE IF NOT EXISTS`).

- [ ] **Step 3: Rewrite both schema strings**

In `backend/app/db.py`, replace the `users` table in `SQLITE_SCHEMA_SQL`:

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id INTEGER NOT NULL UNIQUE,
    github_login TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

and in `POSTGRES_SCHEMA_SQL`:

```sql
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    github_id BIGINT NOT NULL UNIQUE,
    github_login TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT {_PG_NOW}
);
```

Leave `saved_documents` and `chat_messages` exactly as they are in both strings.

- [ ] **Step 4: Add the legacy detection and drop**

Add to `backend/app/db.py`, above `init_db`:

```python
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
```

- [ ] **Step 5: Call it from both branches of `init_db`**

Rewrite `init_db` in `backend/app/db.py`:

```python
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
```

- [ ] **Step 6: Run the migration tests**

Run: `cd backend && uv run pytest tests/test_migration.py -v`
Expected: PASS, both tests.

- [ ] **Step 7: Commit**

```bash
git add backend/app/db.py backend/tests/test_migration.py
git commit -m "Rebuild the users schema around GitHub identity

Password accounts have no GitHub identity to migrate onto, so a database
still carrying hashed_password is dropped and rebuilt rather than altered.
Every schema statement is CREATE TABLE IF NOT EXISTS, so without this an
existing table would keep its old shape forever."
```

---

### Task 2: Add the users repository

**Files:**
- Create: `backend/app/users.py`, `backend/tests/test_users.py`

**Interfaces:**
- Consumes: `users` schema from Task 1; `Database` from `db.py`.
- Produces: `upsert_github_user(db: Database, github_id: int, github_login: str, email: str) -> int` returning the local user id; `delete_user(db: Database, user_id: int) -> None`; constant `LOCAL_DEV_GITHUB_ID = 0`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_users.py`:

```python
import pytest


@pytest.fixture()
def db(client):
    """A Database bound to the same test database the app uses.

    get_connection is a generator dependency, so it is driven by hand here
    rather than through FastAPI."""
    from app.db import get_connection

    gen = get_connection()
    connection = next(gen)
    try:
        yield connection
    finally:
        gen.close()


def test_upsert_creates_a_user(db):
    from app.users import upsert_github_user

    user_id = upsert_github_user(db, 42, "octocat", "octocat@example.com")

    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    assert row["github_id"] == 42
    assert row["github_login"] == "octocat"
    assert row["email"] == "octocat@example.com"


def test_upsert_adopts_the_existing_row_for_a_known_github_id(db):
    from app.users import upsert_github_user

    first = upsert_github_user(db, 42, "octocat", "octocat@example.com")
    second = upsert_github_user(db, 42, "octocat", "octocat@example.com")

    assert first == second
    assert db.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 1


def test_upsert_refreshes_a_renamed_github_account(db):
    from app.users import upsert_github_user

    user_id = upsert_github_user(db, 42, "octocat", "octocat@example.com")
    upsert_github_user(db, 42, "monalisa", "monalisa@example.com")

    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    assert row["github_login"] == "monalisa"
    assert row["email"] == "monalisa@example.com"


def test_two_accounts_may_share_an_email(db):
    """email carries no UNIQUE constraint, so a shared or recycled address
    cannot wedge a sign-in."""
    from app.users import upsert_github_user

    upsert_github_user(db, 1, "one", "shared@example.com")
    upsert_github_user(db, 2, "two", "shared@example.com")

    assert db.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 2


def test_delete_user_removes_the_row(db):
    from app.users import delete_user, upsert_github_user

    user_id = upsert_github_user(db, 42, "octocat", "octocat@example.com")
    delete_user(db, user_id)

    assert db.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_users.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.users'`.

- [ ] **Step 3: Write the implementation**

Create `backend/app/users.py`:

```python
from .db import Database

# GitHub never issues 0 as an account id, so it is free for the local
# development user that stands in when OAuth is unconfigured.
LOCAL_DEV_GITHUB_ID = 0


def upsert_github_user(db: Database, github_id: int, github_login: str, email: str) -> int:
    """Return the local user id for a GitHub account, creating it if new.

    Matching is on github_id, never email: GitHub logins and addresses both
    change over time, the numeric id does not. A changed login or address is
    written back so the stored copy stays current."""
    row = db.execute("SELECT id FROM users WHERE github_id = ?", (github_id,)).fetchone()
    if row is not None:
        db.execute(
            "UPDATE users SET github_login = ?, email = ? WHERE id = ?",
            (github_login, email, row["id"]),
        )
        db.commit()
        return int(row["id"])

    user_id = db.insert_returning_id(
        "INSERT INTO users (github_id, github_login, email) VALUES (?, ?, ?)",
        (github_id, github_login, email),
    )
    db.commit()
    return user_id


def delete_user(db: Database, user_id: int) -> None:
    """Delete a user and, by cascade, every document and chat message under it.

    The cascades are declared on saved_documents.user_id and
    chat_messages.document_id. They fire on SQLite because db._connect sets
    PRAGMA foreign_keys = ON, and natively on Postgres."""
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_users.py -v`
Expected: PASS, all five tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/users.py backend/tests/test_users.py
git commit -m "Add users repository keyed on GitHub id

Matching on github_id rather than email: logins and addresses both change,
the numeric id does not."
```

---

### Task 3: Add config helpers and the startup safety gate

**Files:**
- Modify: `backend/app/config.py` (append), `backend/app/main.py:16-24` (lifespan), `.env` (local only, gitignored — not committed)
- Create: `backend/tests/test_auth_config.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `get_github_client_id() -> str | None`, `get_github_client_secret() -> str | None`, `github_oauth_configured() -> bool` in `config.py`; `assert_safe_auth_config() -> None` in `main.py`, raising `RuntimeError`.

- [ ] **Step 0: Comment out the local GitHub credentials first**

This has to happen before the tests below, not at the end of the plan. `main.py`
calls `load_dotenv` at import, so real credentials sitting in `.env` would leak
into the test environment on first import and make the "unconfigured" cases
flaky.

Only one GitHub OAuth App exists and its callback points at production, so
leaving these set locally also suppresses the dev bypass and sends local
sign-in on a round-trip that redirects to Vercel. Comment rather than delete,
so the values stay recoverable:

```bash
cd /Users/vitbusek/Documents/projects/legal
sed -i '' 's/^GITHUB_CLIENT_ID=/# Production only - see README. Setting these locally breaks local sign-in.\n# GITHUB_CLIENT_ID=/' .env
sed -i '' 's/^GITHUB_CLIENT_SECRET=/# GITHUB_CLIENT_SECRET=/' .env
```

Verify with `cut -d= -f1 .env` that `OPENROUTER_API_KEY` is untouched and both
GitHub lines now begin with `#`. `.env` is gitignored, so nothing here is
committed.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth_config.py`. Note the module-level import of
`app.main`: it forces `load_dotenv` to run once, up front, so each test's
`monkeypatch.delenv` removes anything it set rather than racing it.

```python
import pytest

# Imported at module level so load_dotenv runs before any monkeypatching below.
from app.main import assert_safe_auth_config


def test_oauth_is_unconfigured_when_variables_are_absent(monkeypatch):
    from app.config import github_oauth_configured

    monkeypatch.delenv("GITHUB_CLIENT_ID", raising=False)
    monkeypatch.delenv("GITHUB_CLIENT_SECRET", raising=False)
    assert github_oauth_configured() is False


def test_oauth_is_unconfigured_when_only_one_variable_is_set(monkeypatch):
    from app.config import github_oauth_configured

    monkeypatch.setenv("GITHUB_CLIENT_ID", "id")
    monkeypatch.delenv("GITHUB_CLIENT_SECRET", raising=False)
    assert github_oauth_configured() is False


def test_empty_strings_do_not_count_as_configured(monkeypatch):
    """Vercel hands through an unset variable as an empty string."""
    from app.config import github_oauth_configured

    monkeypatch.setenv("GITHUB_CLIENT_ID", "")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "")
    assert github_oauth_configured() is False


def test_oauth_is_configured_when_both_are_set(monkeypatch):
    from app.config import github_oauth_configured

    monkeypatch.setenv("GITHUB_CLIENT_ID", "id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "secret")
    assert github_oauth_configured() is True


def test_gate_allows_local_development(monkeypatch):
    monkeypatch.delenv("GITHUB_CLIENT_ID", raising=False)
    monkeypatch.delenv("GITHUB_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.setenv("COOKIE_SECURE", "false")
    assert_safe_auth_config()  # must not raise


def test_gate_refuses_the_bypass_alongside_a_database_url(monkeypatch):
    monkeypatch.delenv("GITHUB_CLIENT_ID", raising=False)
    monkeypatch.delenv("GITHUB_CLIENT_SECRET", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/db")
    with pytest.raises(RuntimeError, match="GitHub OAuth is not configured"):
        assert_safe_auth_config()


def test_gate_refuses_the_bypass_alongside_secure_cookies(monkeypatch):
    monkeypatch.delenv("GITHUB_CLIENT_ID", raising=False)
    monkeypatch.delenv("GITHUB_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.setenv("COOKIE_SECURE", "true")
    with pytest.raises(RuntimeError, match="GitHub OAuth is not configured"):
        assert_safe_auth_config()


def test_gate_allows_a_configured_deployment(monkeypatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "secret")
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/db")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    assert_safe_auth_config()  # must not raise
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_auth_config.py -v`
Expected: FAIL with `ImportError: cannot import name 'github_oauth_configured'`.

- [ ] **Step 3: Add the config helpers**

Append to `backend/app/config.py`:

```python
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
```

- [ ] **Step 4: Add the gate to `main.py`**

In `backend/app/main.py`, add after the `load_dotenv` call:

```python
def assert_safe_auth_config() -> None:
    """Refuse to serve the development sign-in bypass on a real deployment.

    With no GitHub credentials, /api/auth/github issues a session to anyone who
    requests it - which is fine on a laptop and catastrophic in public. Vercel
    sets both DATABASE_URL and COOKIE_SECURE, so either one alongside missing
    credentials means the bypass is about to be exposed."""
    if github_oauth_configured():
        return
    if get_database_url() or get_cookie_secure():
        raise RuntimeError(
            "GitHub OAuth is not configured, but DATABASE_URL or COOKIE_SECURE is "
            "set, which means this is a real deployment. Refusing to start with "
            "the local development sign-in bypass enabled. Set GITHUB_CLIENT_ID "
            "and GITHUB_CLIENT_SECRET."
        )
```

Update the import line to `from .config import BACKEND_ROOT, get_cookie_secure, get_database_url, get_static_dir, github_oauth_configured`, and call it from the lifespan so it runs on every boot:

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Schema creation deliberately does not happen here - see db.ensure_schema
    # for why (Vercel's boot budget). This check touches no network and no
    # database, so it is safe to run at startup.
    assert_safe_auth_config()
    yield
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_auth_config.py -v`
Expected: PASS, all eight tests.

- [ ] **Step 6: Commit**

```bash
git add backend/app/config.py backend/app/main.py backend/tests/test_auth_config.py
git commit -m "Refuse to boot with the sign-in bypass exposed

Without GitHub credentials /api/auth/github issues a session to anyone who
asks. Fine on a laptop, catastrophic in public, so DATABASE_URL or
COOKIE_SECURE alongside missing credentials is a hard startup failure."
```

---

### Task 4: Add the GitHub OAuth client module

**Files:**
- Create: `backend/app/github_oauth.py`, `backend/tests/test_github_oauth.py`
- Modify: `backend/pyproject.toml` (move `httpx` to runtime dependencies, drop `bcrypt`)
- Delete: `backend/app/security.py`

**Interfaces:**
- Consumes: `get_github_client_id`, `get_github_client_secret`, `get_session_secret` from `config.py`.
- Produces, all in `github_oauth.py`: `OAUTH_STATE_COOKIE_NAME = "oauth_state"`, `STATE_MAX_AGE_SECONDS = 600`, `GitHubOAuthError`, `NoVerifiedEmailError(GitHubOAuthError)`, `create_state() -> str`, `state_is_valid(state: str | None, cookie_state: str | None) -> bool`, `authorize_url(state: str) -> str`, `exchange_code_for_token(code: str) -> str`, `fetch_identity(access_token: str) -> tuple[int, str, str]` returning `(github_id, login, email)`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_github_oauth.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_github_oauth.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.github_oauth'`.

- [ ] **Step 3: Move `httpx` to a runtime dependency and drop `bcrypt`**

In `backend/pyproject.toml`, remove `"bcrypt>=5.0.0",` from `dependencies`, add `"httpx>=0.28.1",` to `dependencies`, and remove `"httpx>=0.28.1",` from the dev group. Then run `cd backend && uv sync`.

- [ ] **Step 4: Write the implementation**

Create `backend/app/github_oauth.py`:

```python
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
```

- [ ] **Step 5: Delete the password module**

```bash
git rm backend/app/security.py
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_github_oauth.py -v`
Expected: PASS, all thirteen tests.

- [ ] **Step 7: Commit**

```bash
git add backend/app/github_oauth.py backend/tests/test_github_oauth.py backend/pyproject.toml backend/uv.lock
git commit -m "Add GitHub OAuth client and CSRF state helpers

State must satisfy both a signature check and cookie equality: the
signature alone lets an attacker replay their own state, and cookie
equality alone lets anyone who can set a cookie choose both halves.

Drops bcrypt and promotes httpx to a runtime dependency."
```

---

### Task 5: Swap the auth routes to GitHub OAuth

**Files:**
- Modify: `backend/app/routes/auth.py` (rewrite), `backend/app/schemas.py:6-21`, `backend/app/deps.py:14-16`
- Modify: `backend/tests/conftest.py:44-49`, `backend/tests/test_saved_documents.py:57-68`
- Rewrite: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `upsert_github_user`, `LOCAL_DEV_GITHUB_ID` (Task 2); `github_oauth_configured` (Task 3); everything from `github_oauth.py` (Task 4).
- Produces: `GET /api/auth/github`, `GET /api/auth/github/callback`; `UserResponse` gains a `github_login: str` field; test helper `sign_in_as(client, github_id=..., login=..., email=...) -> int` in `conftest.py`.

- [ ] **Step 1: Write the failing test**

Replace the whole of `backend/tests/test_auth.py`:

```python
import pytest

from app import github_oauth


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


@pytest.fixture()
def fake_github(monkeypatch):
    """Stub GitHub's three HTTP calls. Mutate the returned dict to change what
    the fake account looks like."""
    account = {"id": 42, "login": "octocat", "email": "octocat@example.com", "verified": True}

    monkeypatch.setattr(
        github_oauth.httpx, "post", lambda url, **kw: FakeResponse({"access_token": "gho_token"})
    )

    def fake_get(url, **kwargs):
        if url.endswith("/user"):
            return FakeResponse({"id": account["id"], "login": account["login"]})
        return FakeResponse(
            [{"email": account["email"], "primary": True, "verified": account["verified"]}]
        )

    monkeypatch.setattr(github_oauth.httpx, "get", fake_get)
    return account


def _start_and_get_state(client):
    """Drive GET /api/auth/github and return the state it minted.

    follow_redirects=False because the target is github.com."""
    response = client.get("/api/auth/github", follow_redirects=False)
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("https://github.com/login/oauth/authorize?")
    return client.cookies[github_oauth.OAUTH_STATE_COOKIE_NAME]


def test_start_redirects_to_github_and_sets_the_state_cookie(client):
    state = _start_and_get_state(client)
    assert state


def test_callback_signs_in_a_new_user(client, fake_github):
    state = _start_and_get_state(client)

    response = client.get(
        f"/api/auth/github/callback?code=the-code&state={state}", follow_redirects=False
    )

    assert response.status_code == 302
    assert response.headers["location"] == "/"
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "octocat@example.com"
    assert me.json()["github_login"] == "octocat"


def test_second_sign_in_reuses_the_same_account(client, fake_github):
    state = _start_and_get_state(client)
    client.get(f"/api/auth/github/callback?code=c1&state={state}", follow_redirects=False)
    first_id = client.get("/api/auth/me").json()["id"]

    state = _start_and_get_state(client)
    client.get(f"/api/auth/github/callback?code=c2&state={state}", follow_redirects=False)

    assert client.get("/api/auth/me").json()["id"] == first_id


def test_callback_rejects_a_mismatched_state(client, fake_github):
    _start_and_get_state(client)

    response = client.get(
        f"/api/auth/github/callback?code=the-code&state={github_oauth.create_state()}",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == "/?auth_error=state"
    assert client.get("/api/auth/me").status_code == 401


def test_callback_rejects_a_missing_state(client, fake_github):
    response = client.get("/api/auth/github/callback?code=the-code", follow_redirects=False)

    assert response.headers["location"] == "/?auth_error=state"
    assert client.get("/api/auth/me").status_code == 401


def test_callback_reports_a_cancelled_authorization(client):
    response = client.get(
        "/api/auth/github/callback?error=access_denied", follow_redirects=False
    )

    assert response.headers["location"] == "/?auth_error=denied"


def test_callback_rejects_an_unverified_email(client, fake_github):
    fake_github["verified"] = False
    state = _start_and_get_state(client)

    response = client.get(
        f"/api/auth/github/callback?code=the-code&state={state}", follow_redirects=False
    )

    assert response.headers["location"] == "/?auth_error=email"
    assert client.get("/api/auth/me").status_code == 401


def test_callback_reports_a_github_failure(client, fake_github, monkeypatch):
    monkeypatch.setattr(
        github_oauth.httpx, "post", lambda url, **kw: FakeResponse({}, status_code=503)
    )
    state = _start_and_get_state(client)

    response = client.get(
        f"/api/auth/github/callback?code=the-code&state={state}", follow_redirects=False
    )

    assert response.headers["location"] == "/?auth_error=github"


def test_no_failure_path_returns_json(client, fake_github):
    """The callback is a top-level navigation - raw JSON would land in the
    user's browser."""
    for query in ("error=access_denied", "code=c&state=bogus"):
        response = client.get(f"/api/auth/github/callback?{query}", follow_redirects=False)
        assert response.status_code == 302
        assert "auth_error" in response.headers["location"]


def test_me_requires_a_session(client):
    assert client.get("/api/auth/me").status_code == 401


def test_logout_clears_the_session(client, fake_github):
    state = _start_and_get_state(client)
    client.get(f"/api/auth/github/callback?code=c&state={state}", follow_redirects=False)

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_password_endpoints_are_gone(client):
    assert client.post("/api/auth/signup", json={"email": "a@b.c", "password": "x" * 10}).status_code == 405
    assert client.post("/api/auth/signin", json={"email": "a@b.c", "password": "x" * 10}).status_code == 405
```

Add to `backend/tests/test_auth.py` a second module for the bypass, `backend/tests/test_dev_signin.py`:

```python
import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def unconfigured_client(tmp_path, monkeypatch):
    """A client with no GitHub credentials, so the development bypass is live.

    Skipped against Postgres: DATABASE_URL alongside an unconfigured OAuth app
    is exactly what assert_safe_auth_config refuses to start on."""
    if os.environ.get("TEST_DATABASE_URL"):
        pytest.skip("the bypass is refused whenever DATABASE_URL is set")

    monkeypatch.delenv("GITHUB_CLIENT_ID", raising=False)
    monkeypatch.delenv("GITHUB_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "static-does-not-exist"))

    from app.db import reset_schema_cache

    reset_schema_cache()
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def test_bypass_signs_in_without_contacting_github(unconfigured_client):
    response = unconfigured_client.get("/api/auth/github", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == "/"
    me = unconfigured_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "local@localhost"
    assert me.json()["github_login"] == "local"


def test_bypass_reuses_one_local_account(unconfigured_client):
    unconfigured_client.get("/api/auth/github", follow_redirects=False)
    first_id = unconfigured_client.get("/api/auth/me").json()["id"]
    unconfigured_client.get("/api/auth/github", follow_redirects=False)

    assert unconfigured_client.get("/api/auth/me").json()["id"] == first_id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_auth.py tests/test_dev_signin.py -v`
Expected: FAIL — `/api/auth/github` returns 404, and `client` still tries to sign up over HTTP.

- [ ] **Step 3: Update the fixtures**

In `backend/tests/conftest.py`, add the GitHub env vars to the `client` fixture, immediately before the `reset_schema_cache` import:

```python
    # Configured by default so the OAuth path is exercised; tests that want the
    # development bypass build their own client with these removed.
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
```

Then replace the `authed_client` fixture and add the helper:

```python
def sign_in_as(client, github_id=1, login="tester", email="tester@example.com"):
    """Create a user and attach a signed session cookie to `client`.

    Sessions are minted directly rather than driven through OAuth: every route
    outside test_auth.py cares only that *somebody* is signed in, and stubbing
    GitHub for each of them would be noise."""
    from app.db import get_connection
    from app.session import SESSION_COOKIE_NAME, create_session_token
    from app.users import upsert_github_user

    gen = get_connection()
    db = next(gen)
    try:
        user_id = upsert_github_user(db, github_id, login, email)
    finally:
        gen.close()

    client.cookies.set(SESSION_COOKIE_NAME, create_session_token(user_id))
    return user_id


@pytest.fixture()
def authed_client(client):
    """A client carrying a session cookie, for routes that require one."""
    sign_in_as(client, github_id=1, login="authed", email="authed@example.com")
    return client
```

In `backend/tests/test_saved_documents.py`, replace `_as_other_user`:

```python
def _as_other_user(client, github_id, email):
    """Temporarily swap the client's session for a second user, run the given
    actions, then restore the original. A second TestClient(app) can't be used
    for this: entering it re-triggers the app's lifespan and wipes the shared
    test database."""
    from tests.conftest import sign_in_as

    saved_cookies = dict(client.cookies)
    client.cookies.clear()
    sign_in_as(client, github_id=github_id, login=f"user{github_id}", email=email)
    try:
        yield client
    finally:
        client.cookies.clear()
        for name, value in saved_cookies.items():
            client.cookies.set(name, value)
```

Update every call site in that file from `_as_other_user(authed_client, "otheruser@example.com")` to `_as_other_user(authed_client, 2, "otheruser@example.com")`, giving each distinct caller its own `github_id`.

- [ ] **Step 4: Update the schemas and the user lookup**

In `backend/app/schemas.py`, delete `SignupRequest` and `SigninRequest`, drop the now-unused `EmailStr` from the `pydantic` import, and extend `UserResponse`:

```python
class UserResponse(BaseModel):
    id: int
    email: str
    github_login: str
    created_at: str
```

In `backend/app/deps.py`, widen the SELECT:

```python
    row = db.execute(
        "SELECT id, email, github_login, created_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
```

- [ ] **Step 5: Rewrite the auth routes**

Replace `backend/app/routes/auth.py` entirely:

```python
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
    if not state_is_valid(state, oauth_state):
        return _auth_error_redirect("state")

    try:
        github_id, login, email = fetch_identity(exchange_code_for_token(code))
    except NoVerifiedEmailError:
        return _auth_error_redirect("email")
    except (GitHubOAuthError, OSError):
        # OSError covers httpx's transport failures - DNS, connection, timeout.
        return _auth_error_redirect("github")

    return _signed_in_redirect(upsert_github_user(db, github_id, login, email))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME)


@router.get("/me", response_model=UserResponse)
def me(user: UserResponse = Depends(get_current_user)) -> UserResponse:
    return user
```

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && uv run pytest -v`
Expected: PASS. Every test in `test_auth.py`, `test_dev_signin.py`, `test_saved_documents.py`, and the untouched suites is green.

- [ ] **Step 7: Commit**

```bash
git add backend/app backend/tests
git commit -m "Replace password auth with GitHub OAuth

The callback is a top-level navigation, so it never raises: every failure
redirects to /?auth_error=<code> rather than rendering raw JSON at the user.

Test sessions are now minted directly instead of driven through sign-up,
which keeps GitHub stubs out of every suite that only needs somebody
signed in."
```

---

### Task 6: Add the account deletion endpoint

**Files:**
- Modify: `backend/app/routes/auth.py` (append one route)
- Modify: `backend/tests/test_auth.py` (append)

**Interfaces:**
- Consumes: `delete_user` (Task 2), `get_current_user` (existing).
- Produces: `DELETE /api/auth/me` returning 204.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_auth.py`:

```python
def test_delete_account_requires_a_session(client):
    assert client.delete("/api/auth/me").status_code == 401


def test_delete_account_removes_the_user_and_clears_the_session(authed_client):
    assert authed_client.delete("/api/auth/me").status_code == 204
    assert authed_client.get("/api/auth/me").status_code == 401


def test_delete_account_cascades_to_documents_and_messages(authed_client):
    """Erasure has to reach the drafted contract text, not just the account
    row - that is where the personal data actually is."""
    created = authed_client.post(
        "/api/saved-documents", json={"documentTypeId": "Mutual-NDA.md"}
    )
    assert created.status_code == 201
    document_id = created.json()["id"]

    assert authed_client.delete("/api/auth/me").status_code == 204

    from app.db import get_connection

    gen = get_connection()
    db = next(gen)
    try:
        assert db.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 0
        assert db.execute("SELECT COUNT(*) AS n FROM saved_documents").fetchone()["n"] == 0
        assert (
            db.execute(
                "SELECT COUNT(*) AS n FROM chat_messages WHERE document_id = ?", (document_id,)
            ).fetchone()["n"]
            == 0
        )
    finally:
        gen.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_auth.py -k delete_account -v`
Expected: FAIL — `DELETE /api/auth/me` returns 405, the route does not exist.

- [ ] **Step 3: Add the route**

Append to `backend/app/routes/auth.py`:

```python
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
```

Add `delete_user` to the existing `from ..users import ...` line.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest -v`
Expected: PASS, whole suite.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/auth.py backend/tests/test_auth.py
git commit -m "Add self-serve account deletion

Erasure has to reach the drafted contract text and chat transcripts, not
just the account row - the existing cascades carry it."
```

---

### Task 7: Rewrite the frontend auth surface

**Files:**
- Modify: `frontend/src/types/auth.ts`, `frontend/src/lib/authApi.ts`, `frontend/src/app/page.tsx:~145` (the `view === "auth"` branch)
- Rewrite: `frontend/src/components/AuthScreen.tsx`, `frontend/src/components/AuthScreen.test.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/github`, `DELETE /api/auth/me` (Tasks 5 and 6).
- Produces: `AuthScreen` taking **no** props; `deleteAccount(): Promise<void>` in `authApi.ts`; `User` with `github_login`.

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/components/AuthScreen.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AuthScreen } from "@/components/AuthScreen";

function setSearch(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

describe("AuthScreen", () => {
  beforeEach(() => {
    setSearch("");
  });

  it("offers a GitHub sign-in link pointing at the start route", () => {
    render(<AuthScreen />);

    const link = screen.getByRole("link", { name: /continue with github/i });
    expect(link).toHaveAttribute("href", "/api/auth/github");
  });

  it("links to the privacy policy", () => {
    render(<AuthScreen />);

    expect(screen.getByRole("link", { name: /privacy/i })).toHaveAttribute("href", "/privacy");
  });

  it("explains a cancelled authorization", () => {
    setSearch("?auth_error=denied");
    render(<AuthScreen />);

    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
  });

  it("explains a missing verified email", () => {
    setSearch("?auth_error=email");
    render(<AuthScreen />);

    expect(screen.getByText(/verified email/i)).toBeInTheDocument();
  });

  it("explains an expired sign-in attempt", () => {
    setSearch("?auth_error=state");
    render(<AuthScreen />);

    expect(screen.getByText(/expired/i)).toBeInTheDocument();
  });

  it("falls back to a generic message for an unknown code", () => {
    setSearch("?auth_error=something-else");
    render(<AuthScreen />);

    expect(screen.getByText(/could not sign you in/i)).toBeInTheDocument();
  });

  it("clears the error from the URL so a reload does not repeat it", () => {
    setSearch("?auth_error=denied");
    render(<AuthScreen />);

    expect(window.location.search).toBe("");
  });

  it("shows no error when there is none", () => {
    render(<AuthScreen />);

    expect(screen.queryByText(/could not sign you in/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- AuthScreen`
Expected: FAIL — `AuthScreen` still renders a form and requires an `onAuthenticated` prop.

- [ ] **Step 3: Update the types and the API client**

`frontend/src/types/auth.ts`:

```ts
export interface User {
  id: number;
  email: string;
  github_login: string;
  created_at: string;
}
```

In `frontend/src/lib/authApi.ts`, delete `signUp` and `signIn`, keep `signOut`, `fetchCurrentUser`, and `parseErrorDetail`, and add:

```ts
export async function deleteAccount(): Promise<void> {
  const response = await fetch("/api/auth/me", { method: "DELETE" });
  if (!response.ok) {
    throw new Error(
      await parseErrorDetail(response, "Failed to delete your account. Please try again."),
    );
  }
}
```

- [ ] **Step 4: Rewrite `AuthScreen`**

Replace `frontend/src/components/AuthScreen.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

import { FieldRule } from "@/components/FieldRule";

// Keyed by the auth_error codes routes/auth.py redirects with.
const ERROR_MESSAGES: Record<string, string> = {
  denied: "Sign-in was cancelled. You can try again whenever you're ready.",
  state: "That sign-in attempt expired. Please try again.",
  email: "Your GitHub account has no verified email address. Verify one on GitHub, then try again.",
  github: "We couldn't reach GitHub just now. Please try again in a moment.",
};

const FALLBACK_MESSAGE = "We could not sign you in. Please try again.";

export function AuthScreen() {
  const [error, setError] = useState<string | null>(null);

  // Read from location rather than useSearchParams: this renders inside a
  // client-side root page, and useSearchParams would force a Suspense
  // boundary around it for no benefit. Clearing the parameter stops a
  // reload from replaying a stale error.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("auth_error");
    if (!code) return;
    setError(ERROR_MESSAGES[code] ?? FALLBACK_MESSAGE);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      {/* The mark sits above the wordmark, the way a rule sits above a heading
          on a filed document. */}
      <div className="ui-panel">
        <div className="border-b border-line px-8 pt-8 pb-6">
          <FieldRule variant="mark" filled={1} total={1} className="w-24" />
          <h1 className="type-display mt-4 text-xl text-heading">Legal Document Creator</h1>
          <p className="ui-eyebrow mt-2">Sign in to start drafting</p>
        </div>

        <div className="flex flex-col gap-4 px-8 pt-6 pb-8">
          {/* A heavy accent rule down the side rather than a tinted box: the
              only place colour appears on this screen, and it still reads as
              an error with the colour stripped out. */}
          {error && (
            <p className="border-l-2 border-flag py-1 pl-3 text-sm font-medium text-flag-ink">
              {error}
            </p>
          )}

          {/* An anchor, not a button: OAuth needs a top-level navigation, so
              this cannot go through fetch. */}
          <a href="/api/auth/github" className="ui-btn ui-btn-primary w-full text-center">
            Continue with GitHub
          </a>

          <p className="text-xs text-ink-muted">
            We store your GitHub username and email address, and the documents you draft.{" "}
            <a href="/privacy" className="ui-link underline decoration-line underline-offset-4">
              Privacy policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Drop the prop at the call site**

In `frontend/src/app/page.tsx`, the `view === "auth"` branch becomes:

```tsx
  if (view === "auth") {
    return (
      <div className="flex flex-1 flex-col bg-canvas">
        <AuthScreen />
      </div>
    );
  }
```

The session is already established by the callback before this page loads, so the existing `fetchCurrentUser` effect picks it up — there is no `onAuthenticated` handoff any more.

- [ ] **Step 6: Update `page.test.tsx`**

It mocks the deleted functions and types into the deleted form, so it will fail
to compile otherwise. Four concrete changes:

1. In the `vi.hoisted` block at `frontend/src/app/page.test.tsx:28`, replace
   `signIn` and `signUp` with `deleteAccount`:

```tsx
const { fetchCurrentUser, signOut, deleteAccount } = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  signOut: vi.fn(),
  deleteAccount: vi.fn(),
}));
```

2. Update the mock at line 47:

```tsx
vi.mock("@/lib/authApi", () => ({ fetchCurrentUser, signOut, deleteAccount }));
```

3. Give `USER` its new field, and fix the `beforeEach` resets — replace
   `signIn.mockReset(); signUp.mockReset();` with `deleteAccount.mockReset();`:

```tsx
const USER = {
  id: 1,
  email: "user@example.com",
  github_login: "octocat",
  created_at: "2026-01-01 00:00:00",
};
```

4. In `"shows the sign-in screen when there is no active session"`, assert the
   link instead of the button:

```tsx
    expect(
      screen.getByRole("link", { name: /continue with github/i }),
    ).toBeInTheDocument();
```

5. **Delete the test `"reaches the dashboard after signing in"` entirely.** There
   is no in-page sign-in transition left to exercise: the OAuth callback
   establishes the session server-side and redirects, so by the time this page
   mounts the user is already signed in. The `"goes straight to the dashboard
   when a session already exists"` test above it already covers that path, and
   Task 7's `AuthScreen.test.tsx` covers the link.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS, the whole frontend suite.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "Swap the auth screen to GitHub sign-in

An anchor rather than a button: OAuth needs a top-level navigation, so it
cannot go through fetch. Errors arrive as an auth_error query parameter,
read from location to avoid forcing a Suspense boundary on the root page."
```

---

### Task 8: Add the privacy policy page

**Files:**
- Create: `frontend/src/app/privacy/page.tsx`, `frontend/src/app/privacy/page.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: the route `/privacy`, linked from `AuthScreen` (Task 7) and `Dashboard` (Task 9).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/privacy/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PrivacyPage from "@/app/privacy/page";

describe("privacy policy", () => {
  it("names the controller and a contact address", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Vít Bušek/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /busek\.vit@gmail\.com/ })).toHaveAttribute(
      "href",
      "mailto:busek.vit@gmail.com",
    );
  });

  it("discloses that document content is sent to OpenRouter", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/OpenRouter/)).toBeInTheDocument();
  });

  it("names every processor", () => {
    render(<PrivacyPage />);

    for (const processor of ["OpenRouter", "Neon", "Vercel", "GitHub"]) {
      expect(screen.getAllByText(new RegExp(processor)).length).toBeGreaterThan(0);
    }
  });

  it("explains that there is no tracking and therefore no cookie banner", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/no analytics/i)).toBeInTheDocument();
  });

  it("tells people how to erase their account", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Delete account/)).toBeInTheDocument();
  });

  it("links back to the app", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- privacy`
Expected: FAIL — cannot resolve `@/app/privacy/page`.

- [ ] **Step 3: Write the page**

Create `frontend/src/app/privacy/page.tsx`. A server component — no `"use client"`, nothing interactive on it.

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Legal Document Creator",
  description: "What this app collects, who receives it, and how to have it erased.",
};

const LAST_UPDATED = "1 September 2026";

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <h2 className="ui-eyebrow">{heading}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="type-display text-2xl text-heading">Privacy Policy</h1>
        <p className="ui-eyebrow mt-2">Last updated {LAST_UPDATED}</p>
      </div>

      <Section heading="Who is responsible">
        <p>
          This app is run by Vít Bušek, who is the data controller for everything described here.
          For any question about your data, or to exercise any of the rights below, write to{" "}
          <a
            href="mailto:busek.vit@gmail.com"
            className="ui-link underline decoration-line underline-offset-4"
          >
            busek.vit@gmail.com
          </a>
          .
        </p>
      </Section>

      <Section heading="What is collected">
        <p>
          <strong>Your account.</strong> When you sign in with GitHub, we store your GitHub numeric
          account id, your username, and your verified primary email address. We never receive your
          GitHub password, and we ask GitHub for no permission beyond reading your email address.
        </p>
        <p>
          <strong>Your documents.</strong> The values you enter while drafting are stored so you can
          come back to a document later. These routinely include details about other people and
          companies — counterparties, signatories, addresses — who have never used this app. Please
          enter only what the agreement genuinely needs.
        </p>
        <p>
          <strong>Your conversations.</strong> The full chat history for each document is stored
          alongside it, because that is what lets you resume a draft where you left off.
        </p>
      </Section>

      <Section heading="Who else sees it">
        <p>
          <strong>OpenRouter.</strong> To draft your document, the messages you write and the
          document details they contain are sent to OpenRouter, which runs the AI model that
          replies. This means your contract details leave this app and are processed on servers in
          the United States. If that is not acceptable for a particular agreement, do not enter it
          here.
        </p>
        <p>
          <strong>GitHub.</strong> Handles sign-in. GitHub learns that you use this app.
        </p>
        <p>
          <strong>Neon and Vercel.</strong> Neon hosts the database holding your account and
          documents. Vercel hosts the app itself and keeps ordinary server logs, which include IP
          addresses.
        </p>
        <p>Your data is not sold, and it is not used for advertising.</p>
      </Section>

      <Section heading="Why we are allowed to hold it">
        <p>
          All of the above is processed to provide the service you asked for — an account, and a
          document you can draft and come back to. In GDPR terms that is performance of a contract
          with you.
        </p>
      </Section>

      <Section heading="How long it is kept">
        <p>
          Until you delete it. Your account and documents are kept for as long as the account
          exists, and are removed immediately when you delete it.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          You can ask for a copy of your data, have it corrected, have it erased, or object to how it
          is handled. Erasure is self-serve: the <strong>Delete account</strong> control on your
          documents page removes your account, every document, and every message, at once and
          permanently. For anything else, write to the address above.
        </p>
        <p>
          If you think your data is being mishandled, you can complain to the Czech data protection
          authority, the Úřad pro ochranu osobních údajů (uoou.gov.cz).
        </p>
      </Section>

      <Section heading="Cookies">
        <p>
          Two cookies, both strictly necessary: one that keeps you signed in, and a short-lived one
          used during sign-in to protect against request forgery. Your light or dark theme choice is
          remembered in your browser&apos;s local storage.
        </p>
        <p>
          That is everything. There are no analytics, no advertising or tracking cookies, and no
          third-party scripts of any kind. Because nothing here needs your consent under the
          ePrivacy rules, this site does not show a cookie banner.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If this policy changes materially, the date at the top changes with it. This is a small
          project; there is no mailing list to announce it on.
        </p>
      </Section>

      <p className="border-t border-line pt-6">
        <a href="/" className="ui-link ui-eyebrow">
          ← Back to the app
        </a>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- privacy`
Expected: PASS, all six tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/privacy
git commit -m "Add the privacy policy

Leads with the disclosure a user cannot guess: document details are sent to
OpenRouter for inference, and leave the EU to do it."
```

---

### Task 9: Add the dashboard footer with account deletion

**Files:**
- Modify: `frontend/src/components/Dashboard.tsx`, `frontend/src/components/Dashboard.test.tsx`, `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `deleteAccount` (Task 7), `/privacy` (Task 8).
- Produces: `Dashboard` gains a required `onAccountDeleted: () => void` prop.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/Dashboard.test.tsx` (keep the existing imports and add `vi` plus the `authApi` mock at the top of the file):

```tsx
vi.mock("@/lib/authApi", () => ({
  deleteAccount: vi.fn(),
}));

describe("account deletion", () => {
  it("asks for confirmation before deleting", async () => {
    const { deleteAccount } = await import("@/lib/authApi");
    render(
      <Dashboard
        onResume={vi.fn()}
        onCreateNew={vi.fn()}
        onAccountDeleted={vi.fn()}
        refreshKey={0}
        actionError={null}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /deletes everything/i })).toBeInTheDocument();
  });

  it("deletes and notifies the parent once confirmed", async () => {
    const { deleteAccount } = await import("@/lib/authApi");
    vi.mocked(deleteAccount).mockResolvedValue(undefined);
    const onAccountDeleted = vi.fn();
    render(
      <Dashboard
        onResume={vi.fn()}
        onCreateNew={vi.fn()}
        onAccountDeleted={onAccountDeleted}
        refreshKey={0}
        actionError={null}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    await userEvent.click(screen.getByRole("button", { name: /deletes everything/i }));

    expect(deleteAccount).toHaveBeenCalledOnce();
    expect(onAccountDeleted).toHaveBeenCalledOnce();
  });

  it("can be backed out of", async () => {
    const { deleteAccount } = await import("@/lib/authApi");
    render(
      <Dashboard
        onResume={vi.fn()}
        onCreateNew={vi.fn()}
        onAccountDeleted={vi.fn()}
        refreshKey={0}
        actionError={null}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    await userEvent.click(screen.getByRole("button", { name: /keep my account/i }));

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument();
  });

  it("reports a failed deletion without signing the user out", async () => {
    const { deleteAccount } = await import("@/lib/authApi");
    vi.mocked(deleteAccount).mockRejectedValue(new Error("Server said no."));
    const onAccountDeleted = vi.fn();
    render(
      <Dashboard
        onResume={vi.fn()}
        onCreateNew={vi.fn()}
        onAccountDeleted={onAccountDeleted}
        refreshKey={0}
        actionError={null}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    await userEvent.click(screen.getByRole("button", { name: /deletes everything/i }));

    expect(screen.getByText("Server said no.")).toBeInTheDocument();
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  it("links to the privacy policy", () => {
    render(
      <Dashboard
        onResume={vi.fn()}
        onCreateNew={vi.fn()}
        onAccountDeleted={vi.fn()}
        refreshKey={0}
        actionError={null}
      />,
    );

    expect(screen.getByRole("link", { name: /privacy/i })).toHaveAttribute("href", "/privacy");
  });
});
```

The existing `Dashboard` tests need `onAccountDeleted={vi.fn()}` added to their props too, or TypeScript will fail the build.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Dashboard`
Expected: FAIL — no "Delete account" button exists.

- [ ] **Step 3: Add the footer to `Dashboard`**

In `frontend/src/components/Dashboard.tsx`, add `deleteAccount` to the imports, extend the props interface with `onAccountDeleted: () => void`, add state and a handler:

```tsx
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteAccount();
      onAccountDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete your account.");
      setIsConfirmingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }
```

and render this as the last child of the outermost `<div className="flex flex-col gap-6">`:

```tsx
      {/* Account-level actions sit under the documents, behind a rule: this is
          the only screen that is the account rather than a document. Deletion
          is irreversible and cascades, so it takes two deliberate clicks -
          a second inline button rather than a modal, which would be the
          heaviest thing on an otherwise quiet page. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <a href="/privacy" className="ui-link ui-eyebrow">
          Privacy
        </a>

        <div className="flex flex-col items-end gap-2">
          {deleteError && (
            <p className="border-l-2 border-flag py-1 pl-3 text-sm font-medium text-flag-ink">
              {deleteError}
            </p>
          )}
          {isConfirmingDelete ? (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                className="ui-link ui-eyebrow"
              >
                Keep my account
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="ui-btn ui-btn-quiet text-flag-ink"
              >
                {isDeleting ? "Deleting…" : "This deletes everything — confirm"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              className="ui-link ui-eyebrow"
            >
              Delete account
            </button>
          )}
        </div>
      </div>
```

- [ ] **Step 4: Wire it up in `page.tsx`**

Add a handler alongside `handleLogout`:

```tsx
  function handleAccountDeleted() {
    // The server has already cleared the session cookie.
    setCurrentUser(null);
    handleBackToDashboard();
    setView("auth");
  }
```

and pass it where `Dashboard` is rendered: `onAccountDeleted={handleAccountDeleted}`.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npm test && npx tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "Add account deletion and a privacy link to the dashboard

Two deliberate clicks rather than a modal: deletion is irreversible and
cascades, but a modal would be the heaviest thing on an otherwise quiet
page."
```

---

### Task 10: Update the README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

(The `.env` credentials were already commented out in Task 3, Step 0 — that had
to precede the config tests.)

- [ ] **Step 1: Verify the bypass is live**

Run: `cd backend && uv run python -c "from dotenv import load_dotenv; load_dotenv('../.env'); from app.config import github_oauth_configured; print('bypass active:', not github_oauth_configured())"`
Expected: `bypass active: True`

- [ ] **Step 2: Update the README**

In `README.md`:

- In **What it does**, replace the Accounts bullet with:
  `- **Accounts** — sign in with GitHub, backed by a signed HTTP-only session cookie. You can delete your account and everything in it from the documents page.`
- In the environment variable table, add two rows:
  | `GITHUB_CLIENT_ID` | unset | OAuth App client id. **Production only** — see below |
  | `GITHUB_CLIENT_SECRET` | unset | OAuth App client secret. **Production only** — see below |
- Add a short subsection after that table:

  ```markdown
  ### GitHub sign-in

  Production authenticates through a GitHub OAuth App whose callback URL is
  `https://<your-deployment>/api/auth/github/callback`.

  **Do not set `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` locally.** With them
  unset, sign-in skips GitHub entirely and issues a session for a local
  development user, so the quick-start above works with no credentials. Setting
  them locally sends sign-in to GitHub, which then redirects to the *production*
  callback registered on the OAuth App, and the round-trip never completes.

  The app refuses to start if the credentials are missing while `DATABASE_URL` or
  `COOKIE_SECURE` is set, so the bypass cannot reach a real deployment.
  ```

- In the API endpoint table, remove the `/api/auth/signup` and `/api/auth/signin` rows and add:
  | `GET` | `/api/auth/github` | Begin GitHub sign-in (or issue a local session when unconfigured) |
  | `GET` | `/api/auth/github/callback` | Complete sign-in and set the session cookie |
  | `DELETE` | `/api/auth/me` | Delete the account, its documents, and its chat history |
- In **Your data**, add: `Accounts, documents, and chat history are removed immediately when you delete your account. What the deployed app collects and who receives it is described at /privacy.`

- [ ] **Step 3: Run the whole suite one last time**

Run: `cd backend && uv run pytest && cd ../frontend && npm test && npx tsc --noEmit && npm run lint`
Expected: everything green.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document GitHub sign-in and account deletion

Flags the trap the single OAuth App creates: credentials set locally
suppress the development bypass and send sign-in to a callback that
redirects to production."
```

---

## Verification before opening a PR

- [ ] `cd backend && uv run pytest` — green
- [ ] `cd frontend && npm test` — green
- [ ] `cd frontend && npx tsc --noEmit` — no errors
- [ ] `cd frontend && npm run lint` — clean
- [ ] `grep -rn "hashed_password\|bcrypt\|signup\|signin" backend/app frontend/src` returns nothing outside `db.py`'s migration helper
- [ ] `scripts/start-mac.sh` boots and sign-in works with no credentials in `.env`
- [ ] Optional, if a Postgres URL is available: `cd backend && TEST_DATABASE_URL=postgresql://... uv run pytest`

## Deployment note

The first request after this deploys **drops every production account, document,
and chat transcript**, per the clean-cutover decision in the spec. Before
deploying, confirm `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set in the
Vercel project — without them the app refuses to boot, which is the intended
failure rather than a broken deploy.
