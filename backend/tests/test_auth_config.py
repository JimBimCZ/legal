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
