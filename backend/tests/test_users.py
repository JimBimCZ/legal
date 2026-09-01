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
