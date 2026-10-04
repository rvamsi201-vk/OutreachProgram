CREATE TABLE IF NOT EXISTS "organization_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" varchar(255) NOT NULL,
  "category" varchar(30) NOT NULL,
  "provider" varchar(100) NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "encrypted_credentials" text NOT NULL,
  "credentials_fingerprint" varchar(64),
  "last_tested_at" timestamp with time zone,
  "last_test_status" varchar(30),
  "last_test_message" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_integrations_org_category_default_uq"
  ON "organization_integrations" ("organization_id", "category", "is_default")
  WHERE "is_default" = true;

CREATE TABLE IF NOT EXISTS "voice_transcript_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "voice_call_id" uuid NOT NULL REFERENCES "voice_calls"("id") ON DELETE cascade,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE cascade,
  "speaker" varchar(30) NOT NULL,
  "text" text NOT NULL,
  "started_at_ms" integer,
  "ended_at_ms" integer,
  "confidence" integer,
  "language" varchar(50),
  "stt_provider" varchar(100),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "voice_agent_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "voice_call_id" uuid NOT NULL REFERENCES "voice_calls"("id") ON DELETE cascade,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE cascade,
  "input_transcript" text NOT NULL,
  "ai_response_text" text NOT NULL,
  "tts_provider" varchar(100),
  "tts_voice_id" varchar(255),
  "latency_ms" integer,
  "tools_triggered" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "escalation_required" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "voice_transcript_segments_call_idx"
  ON "voice_transcript_segments" ("organization_id", "voice_call_id", "created_at");

CREATE INDEX IF NOT EXISTS "voice_agent_turns_call_idx"
  ON "voice_agent_turns" ("organization_id", "voice_call_id", "created_at");

DO $$
DECLARE
  tbl text;
  org_tables text[] := ARRAY[
    'organization_integrations',
    'voice_transcript_segments',
    'voice_agent_turns'
  ];
BEGIN
  FOREACH tbl IN ARRAY org_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I USING (organization_id = current_setting(''app.organization_id'', true)::uuid) WITH CHECK (organization_id = current_setting(''app.organization_id'', true)::uuid)',
      tbl,
      tbl
    );
  END LOOP;
END $$;
