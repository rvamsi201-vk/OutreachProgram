# Production Checklist

- `.env.production` exists on the VPS with strong unique secrets.
- `docker compose -f docker-compose.prod.yml run --rm api pnpm --filter @ai-crm/api db:migrate:prod` completed.
- `/health` and `/ready` return healthy statuses.
- Webhook providers have signature validation credentials configured.
- Daily database backups are scheduled and at least one restore has been tested.
- Postgres and Redis do not expose host ports.
- Uploads volume is included in VPS snapshot or object-storage backup strategy.
- GitHub Actions deployment secrets are configured before enabling deploy workflow.
