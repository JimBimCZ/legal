#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="legal-app"
CONTAINER_NAME="legal-app"
PORT="8000"
# Named volume for the SQLite database. Survives `docker rm` (which both this
# script and stop-linux.sh do), so accounts and saved documents persist across
# restarts. Remove it with `docker volume rm legal-app-data` for a clean slate.
DATA_VOLUME="legal-app-data"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "$(docker ps -q -f "name=^${CONTAINER_NAME}$")" ]; then
  echo "Container '${CONTAINER_NAME}' is already running at http://localhost:${PORT}"
  exit 0
fi

if [ "$(docker ps -aq -f "name=^${CONTAINER_NAME}$")" ]; then
  echo "Removing stopped container '${CONTAINER_NAME}'..."
  docker rm "${CONTAINER_NAME}" >/dev/null
fi

echo "Building image '${IMAGE_NAME}'..."
docker build -t "${IMAGE_NAME}" "${PROJECT_ROOT}"

ENV_FILE_ARGS=()
if [ -f "${PROJECT_ROOT}/.env" ]; then
  ENV_FILE_ARGS=(--env-file "${PROJECT_ROOT}/.env")
else
  echo "Warning: no .env file found at ${PROJECT_ROOT}/.env — the AI chat feature needs OPENROUTER_API_KEY to work."
fi

echo "Starting container '${CONTAINER_NAME}' on port ${PORT}..."
docker run -d --name "${CONTAINER_NAME}" "${ENV_FILE_ARGS[@]}" -v "${DATA_VOLUME}:/app/data" -p "${PORT}:8000" "${IMAGE_NAME}"

echo "Backend available at http://localhost:${PORT}"
