#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="legal-app"

if [ "$(docker ps -q -f "name=^${CONTAINER_NAME}$")" ]; then
  echo "Stopping container '${CONTAINER_NAME}'..."
  docker stop "${CONTAINER_NAME}" >/dev/null
  docker rm "${CONTAINER_NAME}" >/dev/null
  echo "Stopped."
elif [ "$(docker ps -aq -f "name=^${CONTAINER_NAME}$")" ]; then
  docker rm "${CONTAINER_NAME}" >/dev/null
  echo "Removed stopped container '${CONTAINER_NAME}'."
else
  echo "Container '${CONTAINER_NAME}' is not running."
fi
