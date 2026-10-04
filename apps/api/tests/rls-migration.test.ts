import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(process.cwd(), 'drizzle', '0004_phase6_rls.sql'), 'utf8');

describe('phase 6 RLS migration', () => {
  it('enables forced RLS for core tenant tables', () => {
    for (const table of ['leads', 'campaigns', 'messages', 'opportunities', 'documents']) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
  });

  it('uses app.organization_id for policy isolation', () => {
    expect(migration).toContain("current_setting(''app.organization_id'', true)::uuid");
    expect(migration).toContain('CREATE POLICY tenant_isolation_audit_logs');
  });
});
