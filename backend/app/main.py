from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import get_static_dir
from .db import init_db
from .routes import auth, health


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="Legal Platform API", lifespan=lifespan)

app.include_router(health.router)
app.include_router(auth.router)

# Registered after the routers above so "/api/*" always wins over this
# catch-all mount. Guarded so `uv run uvicorn` still boots standalone before
# the frontend has ever been built.
static_dir = get_static_dir()
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
