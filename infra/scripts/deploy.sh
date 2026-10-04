#!/usr/bin/env sh
set -eu

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}

cp .env.production.example .env.production.sample
docker compose -f "$COMPOSE_FILE" pull || true
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" run --rm api pnpm --filter @ai-crm/api db:migrate:prod
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
docker compose -f "$COMPOSE_FILE" ps
