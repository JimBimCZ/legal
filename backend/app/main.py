from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import BACKEND_ROOT, get_static_dir
from .routes import auth, chat, documents, health, saved_documents

# No-op if the file is absent (e.g. in the Docker image, where the key is
# instead injected as a real env var via `docker run --env-file`).
load_dotenv(BACKEND_ROOT.parent / ".env")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Intentionally empty. Creating the schema used to happen here, but startup
    # runs inside a fixed boot budget on Vercel and connecting to Neon blew it,
    # killing and restarting every cold start. The schema is now created on the
    # first request that needs a connection instead - see db.ensure_schema.
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
