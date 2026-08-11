# ---- Stage 1: build the frontend static export ----
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: python/uv runtime ----
FROM python:3.12-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev

COPY backend/app ./app
COPY --from=frontend-builder /app/frontend/out ./static

ENV DATABASE_PATH=/app/data/app.db
ENV STATIC_DIR=/app/static

EXPOSE 8000
# Invoke the venv's uvicorn directly rather than `uv run` — `uv run` re-syncs
# the project (including dev-only deps) on every invocation, which would hit
# the network and reinstall packages like pytest on every container start.
CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
