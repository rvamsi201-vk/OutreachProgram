CREATE TABLE IF NOT EXISTS "campaign_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE cascade,
  "title" varchar(255) NOT NULL,
  "status" varchar(30) DEFAULT 'DRAFT' NOT NULL,
  "audience" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "audience_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "selected_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scheduled_at" timestamp with time zone,
  "timezone" varchar(100) DEFAULT 'Asia/Kolkata' NOT NULL,
  "schedule_window" jsonb DEFAULT '{"startHour":9,"endHour":20}'::jsonb NOT NULL,
  "sending_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
  "rate_limit_per_hour" integer DEFAULT 100 NOT NULL,
  "total_leads" integer DEFAULT 0 NOT NULL,
  "eligible_leads" integer DEFAULT 0 NOT NULL,
  "excluded_leads" integer DEFAULT 0 NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "campaign_runs_org_campaign_created_idx"
  ON "campaign_runs" ("organization_id", "campaign_id", "created_at" DESC);

ALTER TABLE "campaign_enrollments" ADD COLUMN IF NOT EXISTS "campaign_run_id" uuid REFERENCES "campaign_runs"("id") ON DELETE cascade;
ALTER TABLE "campaign_step_executions" ADD COLUMN IF NOT EXISTS "campaign_run_id" uuid REFERENCES "campaign_runs"("id") ON DELETE cascade;

DROP INDEX IF EXISTS "campaign_enrollments_campaign_lead_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_enrollments_run_lead_uq"
  ON "campaign_enrollments" ("campaign_run_id", "lead_id")
  WHERE "campaign_run_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "campaign_enrollments_run_status_idx"
  ON "campaign_enrollments" ("campaign_run_id", "status", "next_action_at");
CREATE INDEX IF NOT EXISTS "campaign_step_executions_run_status_idx"
  ON "campaign_step_executions" ("campaign_run_id", "status", "created_at");

ALTER TABLE "campaign_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_campaign_runs" ON "campaign_runs";
CREATE POLICY "tenant_isolation_campaign_runs" ON "campaign_runs"
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);
