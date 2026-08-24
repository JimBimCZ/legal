from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..config import get_cookie_secure
from ..db import Database, get_connection
from ..deps import get_current_user
from ..schemas import SigninRequest, SignupRequest, UserResponse
from ..security import hash_password, verify_password
from ..session import SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, create_session_token

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


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(
    payload: SignupRequest, response: Response, db: Database = Depends(get_connection)
) -> UserResponse:
    existing = db.execute(
        "SELECT id FROM users WHERE email = ?", (payload.email,)
    ).fetchone()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    hashed = hash_password(payload.password)
    user_id = db.insert_returning_id(
        "INSERT INTO users (email, hashed_password) VALUES (?, ?)",
        (payload.email, hashed),
    )
    db.commit()
    row = db.execute(
        "SELECT id, email, created_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    _set_session_cookie(response, row["id"])
    return UserResponse(**dict(row))


@router.post("/signin", response_model=UserResponse)
def signin(
    payload: SigninRequest, response: Response, db: Database = Depends(get_connection)
) -> UserResponse:
    row = db.execute(
        "SELECT id, email, hashed_password, created_at FROM users WHERE email = ?",
        (payload.email,),
    ).fetchone()
    # Identical error for "no such user" and "wrong password" to avoid leaking
    # which emails are registered.
    if row is None or not verify_password(payload.password, row["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    _set_session_cookie(response, row["id"])
    return UserResponse(id=row["id"], email=row["email"], created_at=row["created_at"])


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME)


@router.get("/me", response_model=UserResponse)
def me(user: UserResponse = Depends(get_current_user)) -> UserResponse:
    return user
