import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import { Queue, Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { LeadRepository } from '../repositories/lead.repository.js';
import { LeadService } from '../services/crm/lead.service.js';
import { ContactNormalizationService } from '../services/crm/normalization.service.js';
import { logger } from '../config/logger.js';
import { sanitizeCsvRecord } from '../services/security/upload-security.service.js';

export interface LeadImportJob {
  importId: string;
  organizationId: string;
  filePath: string;
  mapping?: LeadImportMapping;
}

interface LeadImportMapping {
  columns?: Partial<Record<LeadImportField, string>>;
  defaults?: Partial<Record<LeadImportField, string>>;
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  pitch?: string;
  info?: string;
  comments?: string;
  source?: string;
  status?: string;
  location?: string;
  businessSize?: string;
  website?: string;
  otherLinks?: string;
  ratings?: string;
  score?: string;
  priority?: string;
  timezone?: string;
  tags?: string;
}

type LeadImportField =
  | 'name'
  | 'company'
  | 'email'
  | 'phone'
  | 'pitch'
  | 'info'
  | 'comments'
  | 'source'
  | 'status'
  | 'location'
  | 'businessSize'
  | 'website'
  | 'otherLinks'
  | 'ratings'
  | 'score'
  | 'priority'
  | 'timezone'
  | 'tags';

const queueConnection = redis.duplicate({ maxRetriesPerRequest: null });

export const leadImportQueue = new Queue<LeadImportJob>('lead-imports', {
  connection: queueConnection,
});

export function startLeadImportWorker() {
  return new Worker<LeadImportJob>(
    'lead-imports',
    async (job) => {
      const repo = new LeadRepository();
      const service = new LeadService(repo);
      const normalizer = new ContactNormalizationService();
      const { importId, organizationId, filePath, mapping } = job.data;
      const summary = { imported: 0, cleaned: 0, duplicates: 0, invalid: 0, ready: 0 };
      await repo.updateImport(importId, { status: 'RUNNING', startedAt: new Date(), summary });

      const parser = createReadStream(filePath).pipe(parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }));

      for await (const unsafeRecord of parser as AsyncIterable<Record<string, string>>) {
        const record = sanitizeCsvRecord(unsafeRecord);
        const email = getMapped(record, mapping, 'email', ['email', 'Email', 'EMAIL', 'email address']);
        const phone = getMapped(record, mapping, 'phone', ['phone', 'Phone', 'mobile', 'Mobile', 'phone number']);
        const name = getMapped(record, mapping, 'name', ['name', 'Name', 'full name'])
          || `${record.firstName ?? record.first_name ?? ''} ${record.lastName ?? record.last_name ?? ''}`.trim()
          || getMapped(record, mapping, 'company', ['company', 'Company', 'business name']);
        if (!name || (!email && !phone)) {
          summary.invalid += 1;
          continue;
        }

        const contacts = [
          ...(email ? [{ channel: 'EMAIL' as const, value: email, isPrimary: true }] : []),
          ...(phone ? [{ channel: 'SMS' as const, value: phone, isPrimary: !email }] : []),
        ];
        let duplicate = false;
        for (const contact of contacts) {
          const normalized = normalizer.normalize(contact.channel, contact.value);
          if (await repo.findByContact(organizationId, contact.channel, normalized.normalizedValue)) {
            duplicate = true;
            break;
          }
        }
        const lead = await service.create(organizationId, {
          name,
          company: getMapped(record, mapping, 'company', ['company', 'Company', 'business', 'business name']) || null,
          pitch: getMapped(record, mapping, 'pitch', ['pitch']) || null,
          info: getMapped(record, mapping, 'info', ['info', 'notes', 'description']) || null,
          comments: getMapped(record, mapping, 'comments', ['comments', 'comment', 'remarks']) || null,
          status: normalizeStatus(getMapped(record, mapping, 'status', ['status'])),
          source: getMapped(record, mapping, 'source', ['source', 'Source']) || 'CSV',
          location: getMapped(record, mapping, 'location', ['location', 'city', 'address']) || null,
          businessSize: normalizeBusinessSize(getMapped(record, mapping, 'businessSize', ['business size', 'size'])),
          website: getMapped(record, mapping, 'website', ['website', 'url']) || null,
          otherLinks: splitList(getMapped(record, mapping, 'otherLinks', ['links', 'other links', 'social links'])),
          ratings: getMapped(record, mapping, 'ratings', ['rating', 'ratings']) || null,
          score: normalizeScore(getMapped(record, mapping, 'score', ['score'])),
          priority: normalizePriority(getMapped(record, mapping, 'priority', ['priority'])),
          importId,
          timezone: getMapped(record, mapping, 'timezone', ['timezone', 'Timezone']) || 'Asia/Kolkata',
          doNotContact: false,
          optedOut: false,
          wrongNumber: false,
          blocked: false,
          contacts,
          tags: splitList(getMapped(record, mapping, 'tags', ['tags'])),
          customFields: {},
        });
        summary.cleaned += 1;
        summary.ready += 1;
        if (lead && duplicate) summary.duplicates += 1;
        else summary.imported += 1;
      }

      await repo.updateImport(importId, { status: 'COMPLETED', completedAt: new Date(), summary });
      return summary;
    },
    { connection: queueConnection },
  ).on('failed', async (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Lead import failed');
    if (job) {
      await new LeadRepository().updateImport(job.data.importId, {
        status: 'FAILED',
        completedAt: new Date(),
        summary: { error: err.message },
      });
    }
  });
}

function getMapped(
  record: Record<string, string>,
  mapping: LeadImportMapping | undefined,
  field: LeadImportField,
  fallbacks: string[],
) {
  const mappedColumn = mapping?.columns?.[field] ?? mapping?.[field];
  if (mappedColumn && record[mappedColumn]) return record[mappedColumn]?.trim() ?? '';
  const fallback = fallbacks.find((column) => record[column]);
  const value = fallback ? record[fallback]?.trim() ?? '' : '';
  return value || mapping?.defaults?.[field]?.trim() || '';
}

function splitList(value: string) {
  return value.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeStatus(value: string) {
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const allowed = ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'NURTURE', 'NOT_QUALIFIED', 'CONVERTED', 'LOST'];
  return allowed.includes(upper) ? upper as 'NEW' : 'NEW';
}

function normalizeBusinessSize(value: string): 'SOLO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE' | 'UNKNOWN' | null {
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!upper) return null;
  if (['SOLO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE', 'UNKNOWN'].includes(upper)) {
    return upper as 'SOLO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE' | 'UNKNOWN';
  }
  if (upper.includes('SMALL')) return 'SMALL';
  if (upper.includes('MEDIUM')) return 'MEDIUM';
  if (upper.includes('LARGE')) return 'LARGE';
  return 'UNKNOWN';
}

function normalizePriority(value: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null {
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(upper) ? upper as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' : null;
}

function normalizeScore(value: string) {
  const score = Number.parseInt(value, 10);
  if (Number.isNaN(score)) return null;
  return Math.max(0, Math.min(100, score));
}
