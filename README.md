# AI Outreach CRM

AI Outreach CRM is a local-first CRM for importing leads, creating reusable outreach campaign templates, running WhatsApp campaigns through Baileys, and syncing conversations back into one inbox.

This repository contains the CRM application. Baileys is installed as an API dependency, so you do not need to commit or run a separate Baileys app for normal CRM use.

## What Is Included

- Web app: React/Vite at `http://localhost:5173`
- API: Fastify at `http://localhost:3000`
- Voice gateway: `http://localhost:3100`
- Database: Postgres with pgvector
- Queue/cache: Redis
- WhatsApp provider: `@whiskeysockets/baileys@6.7.24`
- Gmail OAuth: connect Gmail and manually sync inbox replies
- LLM: OpenRouter/OpenAI-compatible server-side API key from `.env`

## Clone And Install

Clone this CRM repo:

```bash
git clone https://github.com/rvamsi201-vk/OutreachProgram.git ai-crm
cd ai-crm
```

Install requirements:

- Docker Desktop
- Node.js 20+
- pnpm 9+

Check:

```bash
node -v
pnpm -v
docker --version
docker compose version
```

Install dependencies:

```bash
pnpm install
```

## Environment Setup

Copy the example env:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Minimum local values:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_crm_dev
REDIS_URL=redis://localhost:6379
POSTGRES_PORT=5432
REDIS_PORT=6379
JWT_SECRET=dev-jwt-secret-change-in-production-min-32-chars
REFRESH_SECRET=dev-refresh-secret-change-in-production-min-32-chars
ENCRYPTION_KEY=ZGV2LWVuY3J5cHRpb24ta2V5LTMyLWJ5dGVz
APP_URL=http://localhost:5173
API_PORT=3000
VITE_API_URL=http://localhost:3000
```

If local Postgres already uses port `5432`, switch to `5433`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ai_crm_dev
POSTGRES_PORT=5433
```

Do not commit `.env`. Commit only `.env.example` and `.env.production.example`.

## Start Local Services

Start Postgres and Redis:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Run database migrations:

```bash
pnpm db:migrate
```

Optional seed:

```bash
pnpm db:seed
```

The seed creates a complete demo workspace with one admin user, leads, contacts, tags, knowledge base, AI agent, campaign template/run, inbox messages, token usage, pipeline, task, notification, and voice sample.

Demo login:

```text
Email: admin@demo.local
Password: Demo@12345
```

Start the app:

```bash
pnpm dev
```

Open:

```text
http://localhost:5173
```

Create an account from the register page, then log in.

## WhatsApp With Baileys

The CRM uses `@whiskeysockets/baileys@6.7.24` inside `apps/api`. Keep this pinned version unless you intentionally test an upgrade.

Baileys env values:

```env
BAILEYS_WEBSOCKET_URL=wss://web.whatsapp.com/ws/chat
BAILEYS_BROWSER_NAME=AI Outreach CRM
BAILEYS_LOG_LEVEL=warn
```

What these mean:

- `BAILEYS_WEBSOCKET_URL`: WhatsApp Web websocket endpoint used by Baileys. Keep the default.
- `BAILEYS_BROWSER_NAME`: linked-device label shown in WhatsApp.
- `BAILEYS_LOG_LEVEL`: Baileys internal logging. Use `warn` normally.

WhatsApp session state is not stored in `.env`. It is encrypted with `ENCRYPTION_KEY` and stored in Postgres per organization and channel account.

### Connect WhatsApp In CRM

1. Open **Settings**.
2. In **WhatsApp with Baileys**, create or select the WhatsApp account.
3. Click **Connect**.
4. Open WhatsApp on your phone.
5. Go to **Linked devices** -> **Link a device**.
6. Scan the QR code shown in CRM.
7. Wait until Settings shows `CONNECTED` and the linked phone number.

### Send WhatsApp Campaigns

1. Import or create leads.
2. Make sure leads have a valid WhatsApp contact. Indian 10-digit numbers are normalized to `+91`.
3. Create an AI agent if you want AI-personalized openers/replies.
4. Create a campaign template with a WhatsApp step.
5. Enable **AI personalize this message** if the LLM should write each opener.
6. Open the campaign and click **Start Run**.
7. Choose audience: imported batch, selected leads, filters, or all leads.
8. Click **Preview audience** and review eligible/excluded leads.
9. Start the run.

Inbound WhatsApp replies are saved into **Inbox** when the sender phone matches a lead's `WHATSAPP` contact.

### If You Already Have Baileys Running Elsewhere

For this CRM, the recommended setup is to let the CRM API own the Baileys socket. A separate upstream Baileys example process is not connected to CRM campaigns, contacts, inbox, or tenant storage.

Use this path:

1. Stop the external Baileys test/example process.
2. Start this CRM API with `pnpm dev`.
3. Connect the same WhatsApp account from **Settings** using QR.

Do not copy raw Baileys auth/session folders from another project into this CRM. This CRM stores encrypted session state in the database. If you need to connect an external Baileys service instead, add a custom messaging provider and webhook bridge first; that is not the default local setup.

### Optional Upstream Baileys Clone

Only clone upstream Baileys when you want to inspect or test Baileys itself:

```bash
cd ..
git clone https://github.com/WhiskeySockets/Baileys.git Baileys-clone
cd Baileys-clone
corepack yarn install
corepack yarn example
```

Do not commit `Baileys-clone` into this CRM repo. The CRM already installs Baileys from `apps/api/package.json`.

Full WhatsApp guide:

- [WhatsApp Baileys Local Setup](docs/whatsapp-baileys-local-setup.md)

## OpenRouter / LLM Setup

The LLM API key stays server-side in `.env`. Never put it in `VITE_*` variables or browser settings.

For OpenRouter:

```env
LLM_PROVIDER=openai-compatible
OPENAI_API_KEY=your_openrouter_key_here
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_CHAT_MODEL=qwen/qwen3.8-27b:free
LLM_EMBEDDING_MODEL=local-hash
```

Restart the API after changing `.env`.

The LLM is used for AI-personalized campaign openers, AI conversation replies, knowledge-base summarization, and token usage tracking.

## Gmail OAuth Setup

Gmail OAuth lets the CRM connect a Gmail account and sync replies into the inbox. Tokens are encrypted server-side.

### Google Cloud Setup

1. Open Google Cloud Console.
2. Create or select a Google Cloud project.
3. Enable **Gmail API**.
4. Configure the OAuth consent screen.
5. While testing, add your Gmail address as a test user.
6. Create credentials: **OAuth Client ID** -> **Web application**.
7. Add this local authorized redirect URI exactly:

```text
http://localhost:3000/api/channel-accounts/gmail/oauth/callback
```

8. Add production redirect URI if needed:

```text
https://YOUR_DOMAIN/api/channel-accounts/gmail/oauth/callback
```

9. Copy the Google client ID and secret.

### CRM Env

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_OAUTH_REDIRECT_URL=http://localhost:3000/api/channel-accounts/gmail/oauth/callback
```

Restart:

```bash
pnpm dev
```

### Connect Gmail In Admin Panel

1. Open **Settings**.
2. Go to **Gmail OAuth**.
3. Click **Connect Gmail**.
4. Approve the Google consent screen.
5. Return to CRM Settings.
6. Click **Sync inbox**.
7. Open **Inbox** -> **Email** to see matched replies.

Replies match only when the sender email exists as an `EMAIL` contact on a lead. Unmatched emails are counted during sync and are not attached to a lead conversation.

Current Gmail support is inbox sync. If campaign email sending should use Gmail directly, add a Gmail messaging provider that calls Gmail API `users.messages.send`; otherwise email sends may use the sandbox provider depending on current configuration.

## Import Leads From External CRM

1. Open **Leads**.
2. Click **Import from CRM**.
3. Fetch leads from the configured CRM endpoint.
4. Filter the fetched list by domain, city, area, state, size, priority, search, or tags.
5. Select individual leads or **select all filtered**.
6. Import selected leads.

The bearer token/login token used for import should be temporary and cleared after import. Do not store external CRM bearer tokens in `.env` unless you intentionally add a server-side integration.

## Campaign Flow

1. Add leads.
2. Add knowledge base details for your company, product, FAQ, rules, and pricing boundaries.
3. Create an AI agent and attach the knowledge base.
4. Choose agent channels: WhatsApp, Email, SMS, or Voice.
5. Create a reusable campaign template.
6. Add one or more channel steps.
7. Start a campaign run.
8. Preview audience eligibility.
9. Start or schedule the run.
10. Watch status under the campaign's runs and conversations under **Inbox**.

## Production Compose

For production-like Docker builds:

```bash
cp .env.production.example .env.production
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm api pnpm --filter @ai-crm/api db:migrate:prod
docker compose -f docker-compose.prod.yml up -d
```

The production compose includes Postgres, Redis, API, web, voice gateway, and nginx.

Use strong values for:

- `JWT_SECRET`
- `REFRESH_SECRET`
- `ENCRYPTION_KEY`
- `POSTGRES_PASSWORD`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_SECRET`

Keep `ENCRYPTION_KEY` stable after launch. Changing it will make encrypted provider credentials and WhatsApp sessions unreadable.

## Common Commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:studio
```

Stop local services:

```bash
docker compose -f docker-compose.dev.yml down
```

Reset local Postgres/Redis data:

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
```

## GitHub Push Checklist

Before pushing:

1. Confirm `.env` and `.env.production` are not tracked.
2. Confirm `apps/api/uploads/` is not tracked.
3. Do not commit `Baileys-clone/`, `auth_info_baileys/`, or any WhatsApp session files.
4. Commit `.env.example`, `.env.production.example`, README files, source code, migrations, and lockfile.
5. Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Troubleshooting

### API says environment variables are missing

Make sure `.env` exists at the repo root and includes database, Redis, JWT, refresh, encryption, app, and API URL values.

### Docker says Postgres port is allocated

Use another host port:

```env
POSTGRES_PORT=5433
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ai_crm_dev
```

Then restart Compose:

```bash
docker compose -f docker-compose.dev.yml up -d
```

### WhatsApp replies do not show in CRM

- Confirm Settings shows WhatsApp `CONNECTED`.
- Confirm only one CRM/API process owns the Baileys account.
- Confirm the lead has a `WHATSAPP` contact matching the sender number.
- Confirm the phone number includes the same country code WhatsApp sends.
- Restart the API and reconnect if Baileys message decryption errors continue.

### Campaign says leads are excluded

Open **Start Run** -> **Preview audience**. The exclusion panel shows reasons such as missing channel contact, invalid contact, opted out, do not contact, cap reached, or no selected channel.

### Gmail sync imports zero replies

- Click **Sync inbox** manually.
- Confirm the Gmail account is connected in Settings.
- Confirm the sender email exists on a lead as an `EMAIL` contact.
- Confirm the Google OAuth redirect URL in `.env` exactly matches Google Cloud.
