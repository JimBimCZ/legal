from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import get_session_secret

SESSION_COOKIE_NAME = "session"
SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_session_secret(), salt="legal-app-session")


def create_session_token(user_id: int) -> str:
    return _serializer().dumps(user_id)


def verify_session_token(token: str) -> int | None:
    try:
        return _serializer().loads(token, max_age=SESSION_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
