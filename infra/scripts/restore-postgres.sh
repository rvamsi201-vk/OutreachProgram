#!/usr/bin/env sh
set -eu

if [ $# -ne 1 ]; then
  echo "Usage: infra/scripts/restore-postgres.sh backups/ai_crm_YYYYMMDDTHHMMSSZ.dump" >&2
  exit 1
fi

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
BACKUP_FILE=$1
BACKUP_NAME=$(basename "$BACKUP_FILE")

docker compose -f "$COMPOSE_FILE" cp "$BACKUP_FILE" "postgres:/tmp/$BACKUP_NAME"
docker compose -f "$COMPOSE_FILE" exec -T postgres pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  -U "${POSTGRES_USER:-ai_crm}" \
  -d "${POSTGRES_DB:-ai_crm}" \
  "/tmp/$BACKUP_NAME"
