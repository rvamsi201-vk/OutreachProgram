import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db, type Database } from '../db/connection.js';
import {
  communicationEvents,
  customFields,
  leadContacts,
  leadCustomValues,
  leadImports,
  leads,
  leadTags,
  suppressionEntries,
  tags,
} from '../db/schema/index.js';
import type { CreateLeadInput, LeadListQuery, SuppressionInput, TagInput, UpdateLeadInput } from '@ai-crm/shared';

export class LeadRepository {
  constructor(private readonly database: Database = db) {}

  async list(organizationId: string, query: LeadListQuery) {
    const filters: SQL[] = [eq(leads.organizationId, organizationId)];
    if (query.cursor) filters.push(gt(leads.id, query.cursor));
    if (query.status) filters.push(eq(leads.status, query.status));
    if (query.ownerId) filters.push(eq(leads.ownerId, query.ownerId));
    if (query.source) filters.push(eq(leads.source, query.source));
    if (query.businessSize) filters.push(eq(leads.businessSize, query.businessSize));
    if (query.priority) filters.push(eq(leads.priority, query.priority));
    if (query.minScore !== undefined) filters.push(gte(leads.score, query.minScore));
    if (query.maxScore !== undefined) filters.push(lte(leads.score, query.maxScore));
    if (query.hasWebsite === 'yes') filters.push(sql`${leads.website} is not null and ${leads.website} <> ''`);
    if (query.hasWebsite === 'no') filters.push(sql`(${leads.website} is null or ${leads.website} = '')`);
    if (query.importId) filters.push(eq(leads.importId, query.importId));
    if (query.createdFrom) filters.push(gte(leads.createdAt, query.createdFrom));
    if (query.createdTo) filters.push(lte(leads.createdAt, query.createdTo));
    if (query.search) {
      const like = `%${query.search}%`;
      filters.push(or(
        ilike(leads.name, like),
        ilike(leads.company, like),
        ilike(leads.source, like),
        ilike(leads.location, like),
        ilike(leads.pitch, like),
        ilike(leads.info, like),
        ilike(leads.comments, like),
        ilike(leads.website, like),
        ilike(leads.ratings, like),
        sql`exists (
          select 1
          from lead_tags lt
          inner join tags t on t.id = lt.tag_id
          where lt.organization_id = ${organizationId}
            and lt.lead_id = ${leads.id}
            and t.name ilike ${like}
        )`,
        sql`exists (
          select 1
          from lead_contacts lc
          where lc.organization_id = ${organizationId}
            and lc.lead_id = ${leads.id}
            and (lc.value ilike ${like} or lc.normalized_value ilike ${like})
        )`,
      )!);
    }
    if (query.channel) {
      filters.push(sql`exists (
        select 1 from ${leadContacts}
        where ${leadContacts.organizationId} = ${organizationId}
          and ${leadContacts.leadId} = ${leads.id}
          and ${leadContacts.channel} = ${query.channel}
      )`);
    }
    const tagFilter = query.tag ?? query.businessTag;
    if (tagFilter) {
      const rows = await this.database
        .select({ leadId: leadTags.leadId })
        .from(leadTags)
        .innerJoin(tags, eq(tags.id, leadTags.tagId))
        .where(and(eq(tags.organizationId, organizationId), eq(tags.name, tagFilter)));
      const ids = rows.map((row) => row.leadId);
      if (ids.length === 0) return { data: [], nextCursor: null, hasMore: false, total: 0 };
      filters.push(inArray(leads.id, ids));
    }

    const orderColumn = {
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      name: leads.name,
      status: leads.status,
      source: leads.source,
      priority: leads.priority,
      score: leads.score,
      location: leads.location,
      businessSize: leads.businessSize,
    }[query.sortBy];
    const order = query.sortOrder === 'asc' ? asc(orderColumn) : desc(orderColumn);
    const [countRow] = await this.database.select({ total: sql<number>`count(*)::int` }).from(leads).where(and(...filters));
    const total = countRow?.total ?? 0;
    const rows = await this.database.query.leads.findMany({
      where: and(...filters),
      orderBy: [order, desc(leads.createdAt), asc(leads.id)],
      limit: query.limit + 1,
      offset: query.offset,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const leadIds = pageRows.map((lead) => lead.id);
    const tagRows = leadIds.length
      ? await this.database
          .select({ leadId: leadTags.leadId, tag: tags })
          .from(leadTags)
          .innerJoin(tags, eq(tags.id, leadTags.tagId))
          .where(and(eq(leadTags.organizationId, organizationId), inArray(leadTags.leadId, leadIds)))
      : [];
    const tagsByLead = new Map<string, typeof tags.$inferSelect[]>();
    for (const row of tagRows) {
      const existing = tagsByLead.get(row.leadId) ?? [];
      existing.push(row.tag);
      tagsByLead.set(row.leadId, existing);
    }
    const data = pageRows.map((lead) => ({ ...lead, tags: tagsByLead.get(lead.id) ?? [] }));
    return { data, nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null, hasMore, total };
  }

  async findById(organizationId: string, id: string) {
    const lead = await this.database.query.leads.findFirst({
      where: and(eq(leads.organizationId, organizationId), eq(leads.id, id)),
    });
    if (!lead) return null;
    const [contacts, tagRows, customRows, suppressions] = await Promise.all([
      this.database.query.leadContacts.findMany({ where: and(eq(leadContacts.organizationId, organizationId), eq(leadContacts.leadId, id)) }),
      this.database.select().from(leadTags).innerJoin(tags, eq(tags.id, leadTags.tagId)).where(and(eq(leadTags.organizationId, organizationId), eq(leadTags.leadId, id))),
      this.database.select().from(leadCustomValues).innerJoin(customFields, eq(customFields.id, leadCustomValues.customFieldId)).where(and(eq(leadCustomValues.organizationId, organizationId), eq(leadCustomValues.leadId, id))),
      this.database.query.suppressionEntries.findMany({ where: and(eq(suppressionEntries.organizationId, organizationId), eq(suppressionEntries.leadId, id)) }),
    ]);
    return {
      ...lead,
      contacts,
      tags: tagRows.map((row) => row.tags),
      customFields: customRows.map((row) => ({ ...row.custom_fields, value: row.lead_custom_values.value })),
      suppressions,
    };
  }

  async findByContact(organizationId: string, channel: string, normalizedValue: string) {
    const channels = channel === 'WHATSAPP' ? ['WHATSAPP', 'SMS', 'VOICE'] : [channel];
    const contact = await this.database.query.leadContacts.findFirst({
      where: and(
        eq(leadContacts.organizationId, organizationId),
        inArray(leadContacts.channel, channels),
        eq(leadContacts.normalizedValue, normalizedValue),
      ),
      orderBy: [
        sql`case ${leadContacts.channel}
          when ${channel} then 0
          when 'SMS' then 1
          when 'VOICE' then 2
          else 3
        end`,
      ],
    });
    if (!contact) return null;
    return this.database.query.leads.findFirst({
      where: and(eq(leads.organizationId, organizationId), eq(leads.id, contact.leadId)),
    });
  }

  async createBase(organizationId: string, input: CreateLeadInput) {
    const [lead] = await this.database.insert(leads).values({
      organizationId,
      name: input.name,
      company: input.company,
      pitch: input.pitch,
      info: input.info,
      comments: input.comments,
      status: input.status,
      source: input.source,
      location: input.location,
      businessSize: input.businessSize,
      website: input.website,
      otherLinks: input.otherLinks,
      ratings: input.ratings,
      score: input.score,
      priority: input.priority,
      importId: input.importId,
      ownerId: input.ownerId,
      timezone: input.timezone,
      doNotContact: input.doNotContact,
      optedOut: input.optedOut,
      wrongNumber: input.wrongNumber,
      blocked: input.blocked,
    }).returning();
    return lead!;
  }

  async updateBase(organizationId: string, id: string, input: UpdateLeadInput) {
    const [lead] = await this.database.update(leads).set({
      name: input.name,
      company: input.company,
      pitch: input.pitch,
      info: input.info,
      comments: input.comments,
      status: input.status,
      source: input.source,
      location: input.location,
      businessSize: input.businessSize,
      website: input.website,
      otherLinks: input.otherLinks,
      ratings: input.ratings,
      score: input.score,
      priority: input.priority,
      importId: input.importId,
      ownerId: input.ownerId,
      timezone: input.timezone,
      doNotContact: input.doNotContact,
      optedOut: input.optedOut,
      wrongNumber: input.wrongNumber,
      blocked: input.blocked,
      updatedAt: new Date(),
    }).where(and(eq(leads.organizationId, organizationId), eq(leads.id, id))).returning();
    return lead;
  }

  async delete(organizationId: string, id: string) {
    await this.database.delete(leads).where(and(eq(leads.organizationId, organizationId), eq(leads.id, id)));
  }

  async addContact(data: typeof leadContacts.$inferInsert) {
    const [contact] = await this.database.insert(leadContacts).values(data).onConflictDoNothing().returning();
    return contact;
  }

  async replaceContacts(organizationId: string, leadId: string, contacts: (typeof leadContacts.$inferInsert)[]) {
    await this.database.delete(leadContacts).where(and(eq(leadContacts.organizationId, organizationId), eq(leadContacts.leadId, leadId)));
    if (contacts.length > 0) await this.database.insert(leadContacts).values(contacts).onConflictDoNothing();
  }

  async getOrCreateTag(organizationId: string, input: TagInput) {
    const existing = await this.database.query.tags.findFirst({
      where: and(eq(tags.organizationId, organizationId), eq(tags.name, input.name)),
    });
    if (existing) return existing;
    const [tag] = await this.database.insert(tags).values({ organizationId, ...input }).returning();
    return tag!;
  }

  async listTags(organizationId: string) {
    return this.database.query.tags.findMany({ where: eq(tags.organizationId, organizationId), orderBy: [asc(tags.name)] });
  }

  async assignTags(organizationId: string, leadId: string, names: string[]) {
    if (names.length === 0) return;
    const tagRows = await Promise.all(names.map((name) => this.getOrCreateTag(organizationId, { name })));
    await this.database.insert(leadTags).values(tagRows.map((tag) => ({ organizationId, leadId, tagId: tag.id }))).onConflictDoNothing();
  }

  async replaceTags(organizationId: string, leadId: string, names: string[]) {
    await this.database.delete(leadTags).where(and(eq(leadTags.organizationId, organizationId), eq(leadTags.leadId, leadId)));
    await this.assignTags(organizationId, leadId, names);
  }

  async upsertCustomValues(organizationId: string, leadId: string, values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) {
      let field = await this.database.query.customFields.findFirst({
        where: and(eq(customFields.organizationId, organizationId), eq(customFields.key, key)),
      });
      if (!field) {
        [field] = await this.database.insert(customFields).values({
          organizationId,
          key,
          label: key.replace(/_/g, ' '),
          type: typeof value === 'number' ? 'NUMBER' : typeof value === 'boolean' ? 'BOOLEAN' : 'TEXT',
        }).returning();
      }
      if (!field) continue;
      await this.database.insert(leadCustomValues).values({
        organizationId,
        leadId,
        customFieldId: field.id,
        value,
      }).onConflictDoUpdate({
        target: [leadCustomValues.leadId, leadCustomValues.customFieldId],
        set: { value, updatedAt: new Date() },
      });
    }
  }

  async createSuppression(organizationId: string, userId: string, input: SuppressionInput) {
    const [entry] = await this.database.insert(suppressionEntries).values({
      organizationId,
      leadId: input.leadId,
      channel: input.channel,
      reason: input.reason,
      notes: input.notes,
      createdBy: userId,
    }).returning();
    return entry!;
  }

  async removeSuppression(organizationId: string, id: string) {
    await this.database.delete(suppressionEntries).where(and(eq(suppressionEntries.organizationId, organizationId), eq(suppressionEntries.id, id)));
  }

  async hasAnySuppression(organizationId: string, leadId: string) {
    return this.database.query.suppressionEntries.findFirst({
      where: and(eq(suppressionEntries.organizationId, organizationId), eq(suppressionEntries.leadId, leadId), isNull(suppressionEntries.channel)),
    });
  }

  async createImport(data: typeof leadImports.$inferInsert) {
    const [row] = await this.database.insert(leadImports).values(data).returning();
    return row!;
  }

  async updateImport(id: string, data: Partial<typeof leadImports.$inferInsert>) {
    const [row] = await this.database.update(leadImports).set(data).where(eq(leadImports.id, id)).returning();
    return row;
  }

  async getImport(organizationId: string, id: string) {
    return this.database.query.leadImports.findFirst({
      where: and(eq(leadImports.organizationId, organizationId), eq(leadImports.id, id)),
    });
  }

  async listImports(organizationId: string) {
    return this.database.query.leadImports.findMany({
      where: eq(leadImports.organizationId, organizationId),
      orderBy: [desc(leadImports.createdAt)],
      limit: 100,
    });
  }

  async timeline(organizationId: string, leadId: string) {
    return this.database.query.communicationEvents.findMany({
      where: and(eq(communicationEvents.organizationId, organizationId), eq(communicationEvents.leadId, leadId)),
      orderBy: [desc(communicationEvents.createdAt)],
    });
  }
}
