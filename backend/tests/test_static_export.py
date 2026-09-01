"""Serves the real `frontend/out` static export, not a component render.

The bug this guards: `next build` with output: "export" wrote both
`out/privacy.html` and a directory `out/privacy/` holding only RSC .txt
payloads and no index.html. Starlette's StaticFiles (mounted with html=True
in app.main) maps a *directory* to <dir>/index.html but never appends .html
to a bare path, so a request for `/privacy` hit the empty directory and
404'd - dead in production despite every existing frontend test passing,
because those only render <AuthScreen /> / <Dashboard /> directly and assert
the href, never the exported file layout. frontend/next.config.ts now sets
trailingSlash: true so every route is its own directory with an index.html.
"""

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

FRONTEND_OUT = Path(__file__).resolve().parent.parent.parent / "frontend" / "out"

pytestmark = pytest.mark.skipif(
    not (FRONTEND_OUT / "index.html").exists(),
    reason="frontend/out is not built - run `cd frontend && npm run build` first",
)


@pytest.fixture()
def exported_client(monkeypatch):
    monkeypatch.setenv("STATIC_DIR", str(FRONTEND_OUT))
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")

    # app.main.static_dir is decided once, at module import time, from
    # whatever STATIC_DIR was set when some earlier test first imported this
    # module - every other test in the suite points it at a directory that
    # doesn't exist, so the mount is skipped for the life of that cached
    # module object. Reloading re-runs that top-level code against the
    # STATIC_DIR set above, so this test gets its own real mount instead of
    # inheriting the already-decided "no static files" state.
    import app.main as main_module

    importlib.reload(main_module)

    with TestClient(main_module.app) as test_client:
        yield test_client

    # Restore the no-static-mount state for every test that runs after this
    # one in the same process - they assume STATIC_DIR is never mounted.
    monkeypatch.undo()
    importlib.reload(main_module)


def test_root_serves_the_app(exported_client):
    response = exported_client.get("/")
    assert response.status_code == 200


def test_privacy_serves_the_policy(exported_client):
    """The exact regression: this 404'd before trailingSlash: true."""
    response = exported_client.get("/privacy")
    assert response.status_code == 200
    assert "Privacy Policy" in response.text


def test_privacy_with_trailing_slash_also_serves_the_policy(exported_client):
    response = exported_client.get("/privacy/")
    assert response.status_code == 200
    assert "Privacy Policy" in response.text
