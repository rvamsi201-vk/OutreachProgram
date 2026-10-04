import type { CreateLeadInput } from '@ai-crm/shared';

export interface ExistingLeadSnapshot {
  id: string;
  name: string;
  company: string | null;
  source: string | null;
  ownerId: string | null;
  timezone: string;
}

export type MergeableLeadFields = Pick<
  CreateLeadInput,
  'name' | 'company' | 'source' | 'ownerId' | 'timezone'
>;

export class DeduplicationService {
  mergeLead(existing: ExistingLeadSnapshot, incoming: MergeableLeadFields) {
    return {
      name: existing.name || incoming.name,
      company: existing.company || incoming.company || null,
      source: existing.source || incoming.source || null,
      ownerId: existing.ownerId || incoming.ownerId || null,
      timezone: existing.timezone || incoming.timezone || 'Asia/Kolkata',
    };
  }

  shouldReplaceContact(existingNormalizedValues: Set<string>, normalizedValue: string) {
    return !existingNormalizedValues.has(normalizedValue);
  }
}
