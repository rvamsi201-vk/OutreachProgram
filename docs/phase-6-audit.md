# Phase 6 Audit

## Current State

- Monorepo with `apps/api`, `apps/web`, `apps/voice-gateway`, and `packages/shared`.
- API uses Fastify, Drizzle, PostgreSQL/pgvector, Redis, BullMQ, Zod, cookie JWT auth, and Pino.
- Frontend uses React, Vite, TanStack Query, Tailwind, and Recharts.
- Voice gateway is a separate Node/TypeScript WebSocket process.
- Auth uses short-lived access JWT cookies, refresh-token rotation, httpOnly cookies, and CSRF token cookies.
- Backend routes consistently use `req.ctx.organizationId` for tenant filtering in most repository methods.
- BullMQ queues exist for imports, campaigns, AI document ingestion, and channel workers.
- Provider credentials are encrypted with AES-256-GCM before storage.
- Health endpoint checks database and Redis.
- Development Docker Compose only runs Postgres and Redis with public host ports.
- CI exists but production deployment, Docker image build, migrations, backup, and rollback are not complete.

## Security Gaps

- PostgreSQL RLS is not enabled on organization-owned tables.
- API does not set transaction-scoped `app.organization_id` for tenant requests.
- Login has generic errors but no persistent failed-login lockout.
- File uploads need filename sanitization, random stored names, and extension/type checks.
- Webhook payload validation is minimal and processing is partly synchronous.
- Pino redaction covers cookies/authorization but not all secret field names.
- Security headers are not set by production Nginx because production Nginx config does not exist.
- Lint script is configured but ESLint is not installed in the workspace.

## Production Gaps

- No production Dockerfiles or production Docker Compose stack.
- No Nginx TLS/static/API/WebSocket reverse proxy config.
- No production `.env` template.
- No `/ready` endpoint.
- No worker-specific health process.
- No Sentry/error-tracking configuration.
- No queue monitoring/metrics script.

## Deployment Gaps

- No Hostinger deployment scripts.
- No GitHub Actions deploy workflow.
- No immutable image tagging/rollback script.
- No production migration script wrapper.

## Backup Gaps

- No PostgreSQL backup script.
- No off-server upload script hook.
- No documented restore drill.
- No retention cleanup job.

## Monitoring Gaps

- No operational runbook.
- No queue-depth monitoring script.
- No disk/backup status documentation.
- No production architecture documentation.

## Phase 6 Changes

- Add RLS migration for organization-owned tables.
- Add request/transaction helpers for `app.organization_id`.
- Add login failure lockout service and generic login responses.
- Add upload security helpers for random filenames, extension checks, and CSV formula sanitization.
- Add `/ready` endpoint.
- Expand log redaction.
- Add production Dockerfiles, Compose stack, Nginx config, and environment template.
- Add backup, restore, deploy, rollback, retention, and queue monitoring scripts.
- Add CI/CD workflow for test/build/docker/deploy.
- Add Hostinger hardening, backup/restore, deployment, architecture, and production checklist docs.
- Add focused tests for auth lockout, upload sanitization, and RLS SQL presence.
