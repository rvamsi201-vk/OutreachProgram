ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "pitch" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "info" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "location" varchar(255);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "business_size" varchar(30);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "website" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "other_links" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ratings" varchar(50);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "score" integer;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "priority" varchar(30);
