#!/usr/bin/env sh
set -eu

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
STAMP=$(date -u +"%Y%m%dT%H%M%SZ")
mkdir -p backups

docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-ai_crm}" \
  -d "${POSTGRES_DB:-ai_crm}" \
  --format=custom \
  --file="/backups/ai_crm_${STAMP}.dump"

find backups -name "ai_crm_*.dump" -mtime +14 -delete
echo "backups/ai_crm_${STAMP}.dump"
