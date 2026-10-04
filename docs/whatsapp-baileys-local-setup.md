# WhatsApp Baileys Local Setup

This CRM uses `@whiskeysockets/baileys@6.7.24` inside the API service. You do not need to run the upstream Baileys example for normal CRM use. The upstream clone is only for inspecting/testing Baileys itself.

## What Runs Where

- Web app: `http://localhost:5173`
- CRM API: `http://localhost:3000`
- Baileys socket: created by the CRM API when you click **Connect** in Settings
- Session storage: encrypted in the CRM database, keyed by organization and WhatsApp channel account
- Inbound replies: saved into CRM conversations when the sender matches a lead's WhatsApp contact
- Campaign sends: sent by campaign workers through the default WhatsApp Baileys channel account

## Env

Add these values to `.env`:

```env
BAILEYS_WEBSOCKET_URL=wss://web.whatsapp.com/ws/chat
BAILEYS_BROWSER_NAME=AI Outreach CRM
BAILEYS_LOG_LEVEL=warn
API_REQUEST_LOGGING=false
DB_LOG_QUERIES=false
```

The Baileys package version is pinned in `apps/api/package.json`:

```json
"@whiskeysockets/baileys": "6.7.24"
```

`BAILEYS_WEBSOCKET_URL` is the WhatsApp Web socket endpoint used by Baileys. Keep the default unless you intentionally test a custom socket endpoint.

`BAILEYS_BROWSER_NAME` is the device/browser label shown for the linked WhatsApp session.

`BAILEYS_LOG_LEVEL` controls only Baileys internals. Keep it at `warn` during normal use. Setting it to `debug` can print noisy WhatsApp sync messages like `unprocessable update` for stickers, contacts, and bot metadata.

`API_REQUEST_LOGGING=false` hides routine Fastify request logs such as repeated `GET /auth/me`.

`DB_LOG_QUERIES=false` hides Drizzle SQL query logs. Set it to `true` only while debugging SQL.

The usual CRM env values are still required:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ai_crm_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-jwt-secret-change-in-production-min-32-chars
REFRESH_SECRET=dev-refresh-secret-change-in-production-min-32-chars
ENCRYPTION_KEY=ZGV2LWVuY3J5cHRpb24ta2V5LTMyLWJ5dGVz
APP_URL=http://localhost:5173
API_PORT=3000
VITE_API_URL=http://localhost:3000
API_REQUEST_LOGGING=false
DB_LOG_QUERIES=false
```

## Run The CRM

From `D:\llm-outreach\ai-crm`:

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Open:

```text
http://localhost:5173
```

## Connect WhatsApp

1. Log in to the CRM.
2. Open **Settings**.
3. In **WhatsApp with Baileys**, create a WhatsApp account if one does not exist.
4. Select the WhatsApp account.
5. Click **Connect**.
6. Scan the QR code from WhatsApp on your phone:
   - WhatsApp > Linked devices > Link a device

When connected, Settings shows `CONNECTED` and the linked phone number.

## Send Through Campaigns

1. Make sure leads have a `WHATSAPP` contact value with country code.
2. Create a campaign template with a WhatsApp step.
3. Open the campaign and click **Start Run**.
4. Choose the audience and select `WHATSAPP`.
5. Click **Preview audience**.
6. Start or schedule the run.

The campaign worker will send due WhatsApp steps through the connected default Baileys account.

## Inbound User Replies

When a WhatsApp user replies:

1. Baileys receives `messages.upsert`.
2. The API normalizes the sender phone number.
3. The API looks for a CRM lead with a matching `WHATSAPP` contact.
4. If found, the reply is stored as an inbound CRM conversation message.
5. Active campaign enrollment is marked with reply outcome by the webhook-style processing path.

If replies are not appearing, confirm the lead's WhatsApp contact includes the same country-code number that WhatsApp sends.

## Upstream Baileys Clone

The upstream repository can be cloned separately for local inspection:

```text
D:\llm-outreach\Baileys-clone
```

Clone and run the upstream example manually:

```bash
cd D:\llm-outreach
git clone https://github.com/WhiskeySockets/Baileys.git Baileys-clone
cd D:\llm-outreach\Baileys-clone
corepack yarn install
corepack yarn example
```

That example is not connected to CRM data. Use the CRM Settings flow above when you want campaigns and inbox replies to work inside AI Outreach CRM.

## If Another Baileys Service Is Already Running

The CRM expects the API service to own the Baileys socket for a WhatsApp channel account. If another local Baileys example or service is already connected to the same WhatsApp account, it will not automatically sync CRM leads, campaign runs, or inbox records.

Recommended path:

1. Stop the external Baileys service.
2. Start AI Outreach CRM.
3. Open **Settings** -> **WhatsApp with Baileys**.
4. Connect the same WhatsApp account by scanning the QR code.

Do not copy raw Baileys auth/session directories from another project into this CRM. Session state is encrypted and stored in the CRM database. To use an external Baileys process intentionally, create a custom CRM messaging provider and inbound webhook bridge first.

## Troubleshooting

If Settings stays disconnected:

```bash
pnpm --filter @ai-crm/api typecheck
pnpm dev
```

Then reopen Settings and click **Connect** again.

If campaign messages do not send:

- Confirm the WhatsApp account is `CONNECTED`.
- Confirm the WhatsApp channel account is default.
- Confirm Redis is running because campaign workers use queues.
- Confirm the lead has a valid `WHATSAPP` contact.
- Confirm the run preview shows eligible WhatsApp contacts.

Baileys uses the unofficial WhatsApp Web protocol. Keep volume conservative, contact only users with consent, and follow WhatsApp's terms.
