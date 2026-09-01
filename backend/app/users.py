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
