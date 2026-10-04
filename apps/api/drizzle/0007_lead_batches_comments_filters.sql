ALTER TABLE "lead_imports" ADD COLUMN IF NOT EXISTS "title" varchar(255) DEFAULT 'Imported leads' NOT NULL;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "comments" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "import_id" uuid;
ALTER TABLE "leads" ADD CONSTRAINT "leads_import_id_lead_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."lead_imports"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "leads_org_import_id_idx" ON "leads" ("organization_id", "import_id");
CREATE INDEX IF NOT EXISTS "leads_org_status_idx" ON "leads" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "leads_org_source_idx" ON "leads" ("organization_id", "source");
