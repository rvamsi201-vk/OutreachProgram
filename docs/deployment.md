# Production Deployment

This repo includes a Hostinger VPS-friendly deployment using Docker Compose and Nginx.

1. Copy `.env.production.example` to `.env.production` and replace every secret.
2. Point DNS for the production hostname to the VPS public IP.
3. Install Docker and the Docker Compose plugin on the VPS.
4. From the repo root, run `docker compose -f docker-compose.prod.yml build`.
5. Run migrations with `docker compose -f docker-compose.prod.yml run --rm api pnpm --filter @ai-crm/api db:migrate:prod`.
6. Start services with `docker compose -f docker-compose.prod.yml up -d`.
7. Check readiness with `curl http://localhost/ready` through the API path or `docker compose -f docker-compose.prod.yml ps`.

Only Nginx publishes ports. Postgres and Redis stay on the private Compose network.
