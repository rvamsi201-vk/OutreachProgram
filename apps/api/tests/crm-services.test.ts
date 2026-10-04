import { describe, expect, it } from 'vitest';
import { ContactNormalizationService } from '../src/services/crm/normalization.service.js';
import { DeduplicationService } from '../src/services/crm/deduplication.service.js';
import { ConsentService } from '../src/services/crm/consent.service.js';

describe('ContactNormalizationService', () => {
  const service = new ContactNormalizationService();

  it('normalizes email by trimming and lowercasing', () => {
    const result = service.normalizeEmail('  Rahul@Example.COM ');
    expect(result.normalizedValue).toBe('rahul@example.com');
    expect(result.validationStatus).toBe('VALID');
  });

  it('normalizes Indian phone numbers to E.164', () => {
    const result = service.normalizePhone('99999 99999', 'IN');
    expect(result.normalizedValue).toBe('+919999999999');
    expect(result.validationStatus).toBe('VALID');
  });
});

describe('DeduplicationService', () => {
  const service = new DeduplicationService();

  it('preserves existing non-empty lead fields while merging new empty slots', () => {
    const result = service.mergeLead(
      {
        id: 'lead-1',
        name: 'Rahul',
        company: null,
        source: null,
        ownerId: null,
        timezone: 'Asia/Kolkata',
      },
      {
        name: 'Rahul Kumar',
        company: 'Acme',
        source: 'CSV',
        ownerId: null,
        timezone: 'Asia/Kolkata',
      },
    );

    expect(result.name).toBe('Rahul');
    expect(result.company).toBe('Acme');
    expect(result.source).toBe('CSV');
  });

  it('detects missing normalized contact values', () => {
    expect(service.shouldReplaceContact(new Set(['+919999999999']), '+919999999999')).toBe(false);
    expect(service.shouldReplaceContact(new Set(['+919999999999']), 'rahul@example.com')).toBe(true);
  });
});

describe('ConsentService', () => {
  it('blocks opted-out leads', async () => {
    const database = fakeConsentDatabase({
      lead: {
        doNotContact: false,
        optedOut: true,
        wrongNumber: false,
        blocked: false,
        timezone: 'Asia/Kolkata',
        dailyContactCap: 3,
        perLeadContactCap: 10,
      },
    });
    const service = new ConsentService(database);

    await expect(service.canContact('org-1', 'lead-1', 'SMS')).resolves.toEqual({
      allowed: false,
      reason: 'opted_out',
    });
  });

  it('blocks quiet hours', async () => {
    const database = fakeConsentDatabase({
      lead: {
        doNotContact: false,
        optedOut: false,
        wrongNumber: false,
        blocked: false,
        timezone: 'Asia/Kolkata',
        dailyContactCap: 3,
        perLeadContactCap: 10,
      },
    });
    const service = new ConsentService(database);

    await expect(service.canContact('org-1', 'lead-1', 'SMS', new Date('2026-09-30T00:00:00.000Z'))).resolves.toEqual({
      allowed: false,
      reason: 'quiet_hours',
    });
  });
});

function fakeConsentDatabase({ lead }: { lead: Record<string, unknown> }) {
  const emptyCount = [{ value: 0 }];
  return {
    query: {
      leads: { findFirst: async () => lead },
      suppressionEntries: { findFirst: async () => null },
    },
    select: () => ({
      from: () => ({
        where: async () => emptyCount,
      }),
    }),
  } as never;
}
