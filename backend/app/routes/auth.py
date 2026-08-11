import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from ..db import get_connection
from ..schemas import SigninRequest, SignupRequest, UserResponse
from ..security import hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(
    payload: SignupRequest, db: sqlite3.Connection = Depends(get_connection)
) -> UserResponse:
    existing = db.execute(
        "SELECT id FROM users WHERE email = ?", (payload.email,)
    ).fetchone()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    hashed = hash_password(payload.password)
    cursor = db.execute(
        "INSERT INTO users (email, hashed_password) VALUES (?, ?)",
        (payload.email, hashed),
    )
    db.commit()
    row = db.execute(
        "SELECT id, email, created_at FROM users WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return UserResponse(**dict(row))


@router.post("/signin", response_model=UserResponse)
def signin(
    payload: SigninRequest, db: sqlite3.Connection = Depends(get_connection)
) -> UserResponse:
    row = db.execute(
        "SELECT id, email, hashed_password, created_at FROM users WHERE email = ?",
        (payload.email,),
    ).fetchone()
    # Identical error for "no such user" and "wrong password" to avoid leaking
    # which emails are registered.
    if row is None or not verify_password(payload.password, row["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return UserResponse(id=row["id"], email=row["email"], created_at=row["created_at"])
