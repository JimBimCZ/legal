from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import BACKEND_ROOT, get_static_dir
from .db import init_db
from .routes import auth, chat, documents, health, saved_documents

# No-op if the file is absent (e.g. in the Docker image, where the key is
# instead injected as a real env var via `docker run --env-file`).
load_dotenv(BACKEND_ROOT.parent / ".env")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="Legal Platform API", lifespan=lifespan)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(saved_documents.router)

# Registered after the routers above so "/api/*" always wins over this
# catch-all mount. Guarded so `uv run uvicorn` still boots standalone before
# the frontend has ever been built.
static_dir = get_static_dir()
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
