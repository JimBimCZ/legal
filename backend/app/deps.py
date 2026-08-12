import sqlite3

from fastapi import Cookie, Depends, HTTPException, status

from .db import get_connection
from .schemas import UserResponse
from .session import SESSION_COOKIE_NAME, verify_session_token


def get_current_user(
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: sqlite3.Connection = Depends(get_connection),
) -> UserResponse:
    user_id = verify_session_token(session) if session else None
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    row = db.execute(
        "SELECT id, email, created_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if row is None:
        # Cookie is validly signed but the user no longer exists, e.g. after
        # a DB wipe on process restart - treat exactly like "not logged in".
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return UserResponse(**dict(row))
