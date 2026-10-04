DO $$
DECLARE
  tbl text;
  org_tables text[] := ARRAY[
    'organization_members',
    'teams',
    'leads',
    'lead_contacts',
    'custom_fields',
    'lead_custom_values',
    'tags',
    'lead_tags',
    'suppression_entries',
    'lead_imports',
    'conversations',
    'messages',
    'communication_events',
    'campaigns',
    'campaign_steps',
    'campaign_enrollments',
    'campaign_step_executions',
    'channel_accounts',
    'provider_webhook_events',
    'contact_attempts',
    'knowledge_bases',
    'documents',
    'document_chunks',
    'ai_agents',
    'ai_agent_configs',
    'lead_memories',
    'ai_runs',
    'unknown_questions',
    'qualification_profiles',
    'lead_qualifications',
    'voice_calls',
    'pipelines',
    'pipeline_stages',
    'opportunities',
    'sales_tasks',
    'notifications',
    'events'
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

  ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation_audit_logs ON audit_logs;
  CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    USING (
      organization_id IS NULL
      OR organization_id = current_setting('app.organization_id', true)::uuid
    )
    WITH CHECK (
      organization_id IS NULL
      OR organization_id = current_setting('app.organization_id', true)::uuid
    );
END $$;
