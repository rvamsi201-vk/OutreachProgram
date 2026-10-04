#!/usr/bin/env sh
set -eu

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}

docker compose -f "$COMPOSE_FILE" down
docker compose -f "$COMPOSE_FILE" up -d --no-build
docker compose -f "$COMPOSE_FILE" ps
