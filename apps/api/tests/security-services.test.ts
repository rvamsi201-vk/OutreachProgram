import { describe, expect, it } from 'vitest';
import {
  assertAllowedUpload,
  sanitizeCsvCell,
  sanitizeCsvRecord,
  sanitizeFilename,
} from '../src/services/security/upload-security.service.js';
import { LoginProtectionService } from '../src/services/security/login-protection.service.js';

class FakeRedis {
  values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async incr(key: string) {
    const next = Number(this.values.get(key) ?? '0') + 1;
    this.values.set(key, String(next));
    return next;
  }

  async expire() {
    return 1;
  }

  async set(key: string, value: string) {
    this.values.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]) {
    let removed = 0;
    for (const key of keys) {
      removed += this.values.delete(key) ? 1 : 0;
    }
    return removed;
  }
}

describe('upload security helpers', () => {
  it('sanitizes path and control characters from filenames', () => {
    expect(sanitizeFilename('../evil report.csv')).toBe('evil_report.csv');
    expect(sanitizeFilename('')).toBe('upload');
  });

  it('rejects unsupported extensions and oversized files', () => {
    expect(() => assertAllowedUpload('leads.csv', 1024, { allowedExtensions: ['.csv'] })).not.toThrow();
    expect(() => assertAllowedUpload('leads.exe', 1024, { allowedExtensions: ['.csv'] })).toThrow();
    expect(() => assertAllowedUpload('leads.csv', 11, { allowedExtensions: ['.csv'], maxBytes: 10 })).toThrow();
  });

  it('neutralizes CSV formula injection cells', () => {
    expect(sanitizeCsvCell('=cmd|calc')).toBe("'=cmd|calc");
    expect(sanitizeCsvRecord({ name: '+SUM(A1:A2)', email: 'safe@example.com' })).toEqual({
      name: "'+SUM(A1:A2)",
      email: 'safe@example.com',
    });
  });
});

describe('login protection service', () => {
  it('locks a login identity after repeated failures and clears on success', async () => {
    const fakeRedis = new FakeRedis();
    const service = new LoginProtectionService(fakeRedis);

    for (let i = 0; i < 5; i += 1) {
      await service.recordFailure('person@example.com', '127.0.0.1');
    }

    await expect(service.assertCanAttempt('person@example.com', '127.0.0.1')).rejects.toThrow(
      'Too many failed login attempts',
    );

    await service.recordSuccess('person@example.com', '127.0.0.1');
    await expect(service.assertCanAttempt('person@example.com', '127.0.0.1')).resolves.toBeUndefined();
  });
});
