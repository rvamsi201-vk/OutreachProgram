# Hostinger Security

- Keep SSH key-only login enabled and disable password authentication.
- Restrict inbound firewall rules to `22`, `80`, and `443`.
- Store `.env.production` only on the VPS and never commit real values.
- Rotate `JWT_SECRET`, `REFRESH_SECRET`, and `ENCRYPTION_KEY` before first production traffic.
- Run `infra/scripts/backup-postgres.sh` daily from cron and test restores monthly.
- Keep `docker compose -f docker-compose.prod.yml logs api` free of credentials; logger redaction covers auth cookies, tokens, API keys, encrypted credentials, and passwords.
- Use provider webhook signature secrets in channel account credentials before enabling production campaigns.
