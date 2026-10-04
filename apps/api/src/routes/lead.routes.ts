import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  createLeadSchema,
  customFieldSchema,
  externalCrmLeadFetchSchema,
  externalCrmLeadImportSchema,
  leadListQuerySchema,
  PERMISSIONS,
  suppressionSchema,
  tagSchema,
  updateLeadSchema,
  uuidParamSchema,
} from '@ai-crm/shared';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { NotFoundError } from '../errors/index.js';
import { LeadRepository } from '../repositories/lead.repository.js';
import { LeadService } from '../services/crm/lead.service.js';
import { ConsentService } from '../services/crm/consent.service.js';
import { leadImportQueue } from '../queues/import.queue.js';
import { contactAttempts, customFields, leads, tags } from '../db/schema/index.js';
import { db } from '../db/connection.js';
import { and, eq } from 'drizzle-orm';
import {
  assertAllowedUpload,
  getSafeStoredFilename,
  sanitizeFilename,
} from '../services/security/upload-security.service.js';

type ExternalCrmLead = Record<string, unknown>;

const EXTERNAL_CRM_DEFAULT_MAPPING = {
  id: 'customFields.external_crm_id',
  school_name: 'name, company',
  address: 'comments, location fallback, customFields.external_address',
  phone: 'contacts.WHATSAPP, contacts.SMS',
  website: 'website',
  rating: 'ratings',
  reviews: 'customFields.external_reviews, info',
  source: 'source',
  status: 'status',
  assigned_id: 'customFields.external_assigned_id',
  deal_value: 'customFields.external_deal_value',
  domain: 'tags, customFields.business_sector, info',
  size: 'businessSize, customFields.external_size',
  city: 'location, customFields.external_city',
  area: 'location, customFields.external_area',
  state: 'location, customFields.external_state',
  country: 'location, customFields.external_country',
  normalized_location: 'info, customFields.external_normalized_location',
  base_score: 'customFields.external_base_score',
  score: 'score',
  final_score: 'score, customFields.external_final_score',
  priority: 'priority',
  website_status: 'info, customFields.external_website_status',
  gaps_found: 'info, customFields.external_gaps_found',
  pitch: 'pitch',
  notes: 'comments',
  search_query: 'info, customFields.external_search_query',
  assigned_at: 'customFields.external_assigned_at',
  created_at: 'customFields.external_created_at',
} as const;

export async function leadRoutes(app: FastifyInstance) {
  const repo = new LeadRepository();
  const service = new LeadService(repo);
  const consent = new ConsentService(db);

  app.addHook('preHandler', authenticate);

  app.get('/leads', { preHandler: [requirePermission(PERMISSIONS.LEADS_READ)] }, async (req) => {
    const query = leadListQuerySchema.parse(req.query);
    const result = await service.list(req.ctx.organizationId, query);
    return { data: result.data, pagination: { nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total } };
  });

  app.post('/leads', { preHandler: [requirePermission(PERMISSIONS.LEADS_CREATE)] }, async (req, reply) => {
    const input = createLeadSchema.parse(req.body);
    const lead = await service.create(req.ctx.organizationId, input);
    return reply.code(201).send(lead);
  });

  app.get('/leads/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_READ)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const lead = await service.get(req.ctx.organizationId, id);
    if (!lead) throw new NotFoundError('Lead', id);
    return lead;
  });

  app.patch('/leads/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateLeadSchema.parse(req.body);
    const lead = await service.update(req.ctx.organizationId, id, input);
    if (!lead) throw new NotFoundError('Lead', id);
    return lead;
  });

  app.delete('/leads/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_DELETE)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const existing = await service.get(req.ctx.organizationId, id);
    if (!existing) throw new NotFoundError('Lead', id);
    await service.delete(req.ctx.organizationId, id);
    return reply.code(204).send();
  });

  app.delete('/leads/:id/contact-attempts/today', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.organizationId, req.ctx.organizationId), eq(leads.id, id)),
    });
    if (!lead) throw new NotFoundError('Lead', id);
    const attemptedOn = todayInTimezone(new Date(), lead.timezone);
    const result = await db.delete(contactAttempts)
      .where(and(
        eq(contactAttempts.organizationId, req.ctx.organizationId),
        eq(contactAttempts.leadId, id),
        eq(contactAttempts.attemptedOn, attemptedOn),
      ))
      .returning({ id: contactAttempts.id });
    return { deleted: result.length, attemptedOn };
  });

  app.get('/leads/:id/timeline', { preHandler: [requirePermission(PERMISSIONS.LEADS_READ)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const lead = await service.get(req.ctx.organizationId, id);
    if (!lead) throw new NotFoundError('Lead', id);
    const events = await repo.timeline(req.ctx.organizationId, id);
    return { data: events };
  });

  app.post('/leads/import', { preHandler: [requirePermission(PERMISSIONS.LEADS_IMPORT)] }, async (req, reply) => {
    const file = await req.file();
    if (!file) throw new Error('CSV file is required');
    const mapping = file.fields.mapping && 'value' in file.fields.mapping
      ? JSON.parse(String(file.fields.mapping.value)) as Record<string, string>
      : {};
    const title = file.fields.title && 'value' in file.fields.title
      ? String(file.fields.title.value).trim().slice(0, 255)
      : '';
    const buffer = await file.toBuffer();
    assertAllowedUpload(file.filename, buffer.byteLength, {
      allowedExtensions: ['.csv'],
      maxBytes: 10 * 1024 * 1024,
    });
    const uploadDir = join(process.cwd(), 'uploads', req.ctx.organizationId);
    await mkdir(uploadDir, { recursive: true });
    const safeOriginalName = sanitizeFilename(file.filename);
    const filePath = join(uploadDir, getSafeStoredFilename(file.filename));
    await writeFile(filePath, buffer);
    const leadImport = await repo.createImport({
      organizationId: req.ctx.organizationId,
      uploadedBy: req.ctx.userId,
      title: title || `${safeOriginalName} import`,
      fileName: safeOriginalName,
      filePath,
      status: 'QUEUED',
      summary: { imported: 0, cleaned: 0, duplicates: 0, invalid: 0, ready: 0, mapping },
    });
    await leadImportQueue.add('process', { importId: leadImport.id, organizationId: req.ctx.organizationId, filePath, mapping });
    return reply.code(202).send({ importId: leadImport.id });
  });

  app.post('/leads/import/external-crm/preview', { preHandler: [requirePermission(PERMISSIONS.LEADS_IMPORT)] }, async (req) => {
    const input = externalCrmLeadFetchSchema.parse(req.body);
    const { endpoint, rows } = await fetchExternalCrmRows(input);
    return {
      data: rows,
      fetched: rows.length,
      endpoint: endpoint.toString(),
      mapping: EXTERNAL_CRM_DEFAULT_MAPPING,
    };
  });

  app.post('/leads/import/external-crm', { preHandler: [requirePermission(PERMISSIONS.LEADS_IMPORT)] }, async (req, reply) => {
    const input = externalCrmLeadImportSchema.parse(req.body);
    const endpoint = leadsEndpoint(input.baseUrl);
    const rows = input.rows?.length
      ? input.rows.slice(0, input.limit) as ExternalCrmLead[]
      : (await fetchExternalCrmRows(input)).rows;

    const leadImport = await repo.createImport({
      organizationId: req.ctx.organizationId,
      uploadedBy: req.ctx.userId,
      title: `External CRM${input.domain ? ` - ${input.domain}` : ''}`,
      fileName: endpoint.hostname,
      filePath: endpoint.toString(),
      status: 'PROCESSING',
      summary: {
        source: 'external-crm',
        endpoint: endpoint.toString(),
        mapping: EXTERNAL_CRM_DEFAULT_MAPPING,
        requested: rows.length,
        imported: 0,
        duplicates: 0,
        invalid: 0,
        filters: {
          domain: input.domain,
          city: input.city,
          area: input.area,
          state: input.state,
          size: input.size,
        },
      },
    });

    let imported = 0;
    let duplicates = 0;
    let invalid = 0;
    for (const row of rows) {
      const mapped = mapExternalCrmLead(row, leadImport.id);
      if (!mapped) {
        invalid += 1;
        continue;
      }
      const before = await repo.findByContact(req.ctx.organizationId, 'WHATSAPP', mapped.normalizedPhone);
      await service.create(req.ctx.organizationId, mapped.input);
      const after = await repo.findByContact(req.ctx.organizationId, 'WHATSAPP', mapped.normalizedPhone);
      if (before?.id && after?.id === before.id) duplicates += 1;
      else imported += 1;
    }

    await repo.updateImport(leadImport.id, {
      status: 'COMPLETED',
      completedAt: new Date(),
      summary: {
        source: 'external-crm',
        endpoint: endpoint.toString(),
        mapping: EXTERNAL_CRM_DEFAULT_MAPPING,
        requested: rows.length,
        imported,
        duplicates,
        invalid,
        ready: imported + duplicates,
        filters: {
          domain: input.domain,
          city: input.city,
          area: input.area,
          state: input.state,
          size: input.size,
        },
      },
    });

    return reply.code(201).send({ importId: leadImport.id, requested: rows.length, imported, duplicates, invalid });
  });

  app.get('/leads/import-batches', { preHandler: [requirePermission(PERMISSIONS.LEADS_READ)] }, async (req) => {
    return { data: await repo.listImports(req.ctx.organizationId) };
  });

  app.get('/leads/import/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_IMPORT)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const leadImport = await repo.getImport(req.ctx.organizationId, id);
    if (!leadImport) throw new NotFoundError('Lead import', id);
    return leadImport;
  });

  app.get('/tags', { preHandler: [requirePermission(PERMISSIONS.LEADS_READ)] }, async (req) => {
    return { data: await repo.listTags(req.ctx.organizationId) };
  });

  app.post('/tags', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req, reply) => {
    const input = tagSchema.parse(req.body);
    const tag = await repo.getOrCreateTag(req.ctx.organizationId, input);
    return reply.code(201).send(tag);
  });

  app.patch('/tags/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = tagSchema.partial().parse(req.body);
    const [tag] = await db.update(tags).set({ ...input, updatedAt: new Date() }).where(and(eq(tags.organizationId, req.ctx.organizationId), eq(tags.id, id))).returning();
    if (!tag) throw new NotFoundError('Tag', id);
    return tag;
  });

  app.delete('/tags/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    await db.delete(tags).where(and(eq(tags.organizationId, req.ctx.organizationId), eq(tags.id, id)));
    return reply.code(204).send();
  });

  app.get('/custom-fields', { preHandler: [requirePermission(PERMISSIONS.LEADS_READ)] }, async (req) => {
    return { data: await db.query.customFields.findMany({ where: eq(customFields.organizationId, req.ctx.organizationId) }) };
  });

  app.post('/custom-fields', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req, reply) => {
    const input = customFieldSchema.parse(req.body);
    const [field] = await db.insert(customFields).values({ organizationId: req.ctx.organizationId, ...input }).returning();
    return reply.code(201).send(field);
  });

  app.patch('/custom-fields/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = customFieldSchema.partial().parse(req.body);
    const [field] = await db.update(customFields).set({ ...input, updatedAt: new Date() }).where(and(eq(customFields.organizationId, req.ctx.organizationId), eq(customFields.id, id))).returning();
    if (!field) throw new NotFoundError('Custom field', id);
    return field;
  });

  app.delete('/custom-fields/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    await db.delete(customFields).where(and(eq(customFields.organizationId, req.ctx.organizationId), eq(customFields.id, id)));
    return reply.code(204).send();
  });

  app.post('/suppressions', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req, reply) => {
    const input = suppressionSchema.parse(req.body);
    const lead = await service.get(req.ctx.organizationId, input.leadId);
    if (!lead) throw new NotFoundError('Lead', input.leadId);
    const entry = await repo.createSuppression(req.ctx.organizationId, req.ctx.userId, input);
    return reply.code(201).send(entry);
  });

  app.delete('/suppressions/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    await repo.removeSuppression(req.ctx.organizationId, id);
    return reply.code(204).send();
  });

  app.get('/leads/:id/consent/:channel', { preHandler: [requirePermission(PERMISSIONS.LEADS_READ)] }, async (req) => {
    const { id, channel } = req.params as { id: string; channel: string };
    return consent.canContact(req.ctx.organizationId, id, channel);
  });
}

function mapExternalCrmLead(row: ExternalCrmLead, importId: string) {
  const phone = stringValue(row.phone);
  const name = stringValue(row.school_name) ?? stringValue(row.name) ?? stringValue(row.business_name) ?? stringValue(row.company);
  if (!phone || !name) return null;
  const normalizedPhone = normalizeIndianPhone(phone);
  const domain = stringValue(row.domain);
  const city = stringValue(row.city);
  const area = stringValue(row.area);
  const state = stringValue(row.state);
  const country = stringValue(row.country);
  const address = stringValue(row.address);
  const gaps = stringifyValue(row.gaps_found);
  const source = stringValue(row.source) ?? 'external-crm';
  const website = stringValue(row.website);
  const priority = priorityValue(row.priority);
  const score = numberValue(row.score) ?? numberValue(row.final_score) ?? numberValue(row.base_score);
  const businessSize = businessSizeValue(row.size);
  const location = [area, city, state, country].filter(Boolean).join(', ') || address || null;
  const info = [
    domain ? `Domain: ${domain}` : null,
    stringValue(row.normalized_location) ? `Normalized location: ${stringValue(row.normalized_location)}` : null,
    row.reviews !== undefined ? `Reviews: ${String(row.reviews)}` : null,
    row.website_status ? `Website status: ${String(row.website_status)}` : null,
    gaps ? `Gaps found: ${gaps}` : null,
    stringValue(row.search_query) ? `Search query: ${stringValue(row.search_query)}` : null,
  ].filter(Boolean).join('\n');

  return {
    normalizedPhone,
    input: {
      name,
      company: name,
      pitch: stringValue(row.pitch),
      info: info || null,
      comments: stringValue(row.notes) ?? address,
      status: statusValue(row.status),
      source: `External CRM: ${source}`,
      location,
      businessSize,
      website,
      otherLinks: [],
      ratings: stringValue(row.rating),
      score: score === undefined ? null : Math.max(0, Math.min(100, Math.round(score))),
      priority,
      importId,
      timezone: 'Asia/Kolkata',
      doNotContact: false,
      optedOut: false,
      wrongNumber: false,
      blocked: false,
      contacts: [
        { channel: 'WHATSAPP' as const, value: phone, isPrimary: true },
        { channel: 'SMS' as const, value: phone, isPrimary: false },
      ],
      tags: ['external-crm', ...(domain ? [domain] : [])],
      customFields: {
        external_crm_id: stringValue(row.id) ?? null,
        business_sector: domain ?? null,
        external_city: city ?? null,
        external_area: area ?? null,
        external_state: state ?? null,
        external_country: country ?? null,
        external_address: address ?? null,
        external_size: stringValue(row.size) ?? null,
        external_deal_value: stringValue(row.deal_value) ?? null,
        external_reviews: numberValue(row.reviews) ?? stringValue(row.reviews) ?? null,
        external_normalized_location: stringValue(row.normalized_location) ?? null,
        external_base_score: stringValue(row.base_score) ?? null,
        external_final_score: stringValue(row.final_score) ?? null,
        external_website_status: stringValue(row.website_status) ?? null,
        external_gaps_found: gaps,
        external_search_query: stringValue(row.search_query) ?? null,
        external_assigned_id: stringValue(row.assigned_id) ?? null,
        external_assigned_at: stringValue(row.assigned_at) ?? null,
        external_created_at: stringValue(row.created_at) ?? null,
      },
    },
  };
}

function leadsEndpoint(value: string) {
  const url = new URL(value);
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/api/leads';
  }
  return url;
}

async function fetchExternalCrmRows(input: {
  baseUrl: string;
  loginUrl?: string | null;
  email?: string | null;
  password?: string | null;
  bearerToken?: string | null;
  domain?: string | null;
  city?: string | null;
  area?: string | null;
  state?: string | null;
  size?: string | null;
  limit: number;
}) {
  const endpoint = leadsEndpoint(input.baseUrl);
  const bearerToken = await resolveExternalCrmBearerToken(input);
  endpoint.searchParams.set('limit', String(input.limit));
  for (const [key, value] of Object.entries({
    domain: input.domain,
    city: input.city,
    area: input.area,
    state: input.state,
    size: input.size,
  })) {
    if (value) endpoint.searchParams.set(key, String(value));
  }

  const response = await fetch(endpoint, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${bearerToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`External CRM returned ${response.status}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('External CRM response must be a JSON array');
  return { endpoint, rows: payload.slice(0, input.limit) as ExternalCrmLead[] };
}

async function resolveExternalCrmBearerToken(input: {
  baseUrl: string;
  loginUrl?: string | null;
  email?: string | null;
  password?: string | null;
  bearerToken?: string | null;
}) {
  if (input.bearerToken?.trim()) return input.bearerToken.trim();
  if (!input.email || !input.password) throw new Error('External CRM email and password are required');

  const endpoint = externalCrmLoginEndpoint(input.baseUrl, input.loginUrl);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });

  if (!response.ok) {
    throw new Error(`External CRM login returned ${response.status}`);
  }

  const payload = await response.json();
  const token = extractBearerToken(payload);
  if (!token) {
    throw new Error('External CRM login did not return a bearer token');
  }
  return token;
}

function externalCrmLoginEndpoint(baseUrl: string, loginUrl?: string | null) {
  if (loginUrl) return new URL(loginUrl);
  const url = new URL(baseUrl);
  url.pathname = '/api/auth/login';
  url.search = '';
  url.hash = '';
  return url;
}

function extractBearerToken(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const tokenKeys = new Set(['token', 'accessToken', 'access_token', 'bearerToken', 'jwt', 'idToken']);
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, nested] of Object.entries(current)) {
      if (tokenKeys.has(key) && typeof nested === 'string' && nested.trim()) {
        return nested.replace(/^Bearer\s+/i, '').trim();
      }
      if (nested && typeof nested === 'object') stack.push(nested);
    }
  }
  return null;
}

function stringValue(value: unknown) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function stringifyValue(value: unknown) {
  if (value === null || typeof value === 'undefined') return null;
  if (typeof value === 'string') return value.trim() || null;
  return JSON.stringify(value);
}

function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 ? `+91${digits}` : digits.startsWith('91') ? `+${digits}` : `+${digits}`;
}

function todayInTimezone(now: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(now);
}

function statusValue(value: unknown) {
  const normalized = stringValue(value)?.toUpperCase();
  return ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'NURTURE', 'NOT_QUALIFIED', 'CONVERTED', 'LOST'].includes(normalized ?? '') ? normalized as 'NEW' : 'NEW';
}

function priorityValue(value: unknown) {
  const normalized = stringValue(value)?.toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(normalized ?? '') ? normalized as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' : null;
}

function businessSizeValue(value: unknown) {
  const normalized = stringValue(value)?.toUpperCase();
  if (!normalized) return null;
  if (normalized === 'BIG') return 'LARGE' as const;
  return ['SOLO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE', 'UNKNOWN'].includes(normalized) ? normalized as 'SOLO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE' | 'UNKNOWN' : 'UNKNOWN';
}
