# Production Architecture

Nginx is the public edge and proxies API, auth, webhook, event stream, voice WebSocket, and SPA traffic to private containers.

Core services:

- `api`: Fastify API, migrations, workers, and readiness checks.
- `web`: Vite-built static React app served by Nginx.
- `voice-gateway`: Fastify WebSocket service for voice sessions.
- `postgres`: pgvector-enabled PostgreSQL with private networking.
- `redis`: BullMQ queue and login lockout storage with append-only persistence.

Tenant isolation uses application-level organization filters and a Phase 6 RLS migration keyed by `app.organization_id` for org-owned tables.
