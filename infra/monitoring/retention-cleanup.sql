DELETE FROM provider_webhook_events WHERE created_at < now() - interval '90 days';
DELETE FROM ai_runs WHERE created_at < now() - interval '180 days';
DELETE FROM communication_events WHERE created_at < now() - interval '180 days';
DELETE FROM audit_logs WHERE created_at < now() - interval '365 days';
