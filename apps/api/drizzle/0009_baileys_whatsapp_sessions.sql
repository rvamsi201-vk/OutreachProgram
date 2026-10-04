CREATE TABLE IF NOT EXISTS "whatsapp_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "channel_account_id" uuid NOT NULL REFERENCES "channel_accounts"("id") ON DELETE cascade,
  "encrypted_auth_state" text NOT NULL,
  "status" varchar(30) DEFAULT 'DISCONNECTED' NOT NULL,
  "phone_number" varchar(50),
  "last_error" text,
  "last_connected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_sessions_channel_account_uq"
  ON "whatsapp_sessions" ("channel_account_id");
CREATE INDEX IF NOT EXISTS "whatsapp_sessions_org_status_idx"
  ON "whatsapp_sessions" ("organization_id", "status");

ALTER TABLE "whatsapp_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_sessions" ON "whatsapp_sessions";
CREATE POLICY "tenant_isolation_whatsapp_sessions" ON "whatsapp_sessions"
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);
