import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { integrationSchema } from '@ai-crm/shared';
import { maskSecret, summarizeCredentials } from '../src/services/security/credential-presenter.service.js';
import { fingerprintCredentials } from '../src/repositories/integration.repository.js';

describe('integration credential presentation', () => {
  it('masks credentials before returning them to the frontend', () => {
    expect(maskSecret('sk-proj-123456789')).toBe('sk-••••6789');
    expect(summarizeCredentials({ apiKey: 'abc123456', token: 'tiny' })).toEqual({
      apiKey: 'abc••••3456',
      token: '••••',
    });
  });

  it('creates a stable fingerprint without exposing raw secret values', () => {
    const first = fingerprintCredentials({ apiKey: 'secret', voiceId: 'voice' });
    const second = fingerprintCredentials({ voiceId: 'voice', apiKey: 'secret' });
    expect(first).toBe(second);
    expect(first).not.toContain('secret');
  });
});

describe('integration schema', () => {
  it('accepts per-organization provider credentials for supported categories', () => {
    const parsed = integrationSchema.parse({
      name: 'Meta WhatsApp',
      category: 'WHATSAPP',
      provider: 'meta_whatsapp',
      credentials: {
        accessToken: 'token',
        phoneNumberId: 'phone-number-id',
      },
      configuration: {
        apiVersion: 'v20.0',
      },
    });

    expect(parsed.category).toBe('WHATSAPP');
    expect(parsed.credentials.accessToken).toBe('token');
  });
});

describe('phase 1 integrations migration', () => {
  const migration = readFileSync(join(process.cwd(), 'drizzle', '0005_phase7_integrations_voice.sql'), 'utf8');

  it('adds tenant-scoped integration and voice data tables with RLS', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "organization_integrations"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "voice_transcript_segments"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "voice_agent_turns"');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("current_setting(''app.organization_id'', true)::uuid");
  });
});
