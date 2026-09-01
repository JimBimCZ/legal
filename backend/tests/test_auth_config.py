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
    monkeypatch.setenv("SESSION_SECRET", "a-real-random-secret")
    assert_safe_auth_config()  # must not raise


@pytest.mark.parametrize("value", ["1", "yes", "on", "TRUE", "True"])
def test_cookie_secure_accepts_common_truthy_spellings(monkeypatch, value):
    from app.config import get_cookie_secure

    monkeypatch.setenv("COOKIE_SECURE", value)
    assert get_cookie_secure() is True


@pytest.mark.parametrize("value", ["false", "False", "0", "no", "off", ""])
def test_cookie_secure_rejects_falsy_and_empty_values(monkeypatch, value):
    from app.config import get_cookie_secure

    monkeypatch.setenv("COOKIE_SECURE", value)
    assert get_cookie_secure() is False


def test_cookie_secure_defaults_to_false_when_unset(monkeypatch):
    from app.config import get_cookie_secure

    monkeypatch.delenv("COOKIE_SECURE", raising=False)
    assert get_cookie_secure() is False


def test_gate_refuses_the_default_session_secret_alongside_a_database_url(monkeypatch):
    """GitHub OAuth being configured must not shortcut past this check -
    a deployment can have valid credentials and still boot with the
    published default session secret, which lets anyone forge a session."""
    from app.config import DEFAULT_SESSION_SECRET

    monkeypatch.setenv("GITHUB_CLIENT_ID", "id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "secret")
    monkeypatch.setenv("SESSION_SECRET", DEFAULT_SESSION_SECRET)
    monkeypatch.setenv("DATABASE_URL", "postgresql://example/db")
    monkeypatch.delenv("COOKIE_SECURE", raising=False)
    with pytest.raises(RuntimeError, match="SESSION_SECRET is still the published default"):
        assert_safe_auth_config()


def test_gate_refuses_the_default_session_secret_alongside_secure_cookies(monkeypatch):
    from app.config import DEFAULT_SESSION_SECRET

    monkeypatch.setenv("GITHUB_CLIENT_ID", "id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "secret")
    monkeypatch.setenv("SESSION_SECRET", DEFAULT_SESSION_SECRET)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.setenv("COOKIE_SECURE", "true")
    with pytest.raises(RuntimeError, match="SESSION_SECRET is still the published default"):
        assert_safe_auth_config()


def test_gate_allows_the_default_session_secret_locally(monkeypatch):
    """No DATABASE_URL, no COOKIE_SECURE: this is what a laptop looks like,
    and the whole point of the default is to make that setup credential-free."""
    from app.config import DEFAULT_SESSION_SECRET

    monkeypatch.setenv("GITHUB_CLIENT_ID", "id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "secret")
    monkeypatch.setenv("SESSION_SECRET", DEFAULT_SESSION_SECRET)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.setenv("COOKIE_SECURE", "false")
    assert_safe_auth_config()  # must not raise
