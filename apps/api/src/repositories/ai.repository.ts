import { and, asc, eq, sql } from 'drizzle-orm';
import { db, type Database } from '../db/connection.js';
import {
  aiAgentConfigs,
  aiAgents,
  aiRuns,
  documentChunks,
  documents,
  knowledgeBases,
  leadMemories,
  leadQualifications,
  qualificationProfiles,
  unknownQuestions,
  voiceCalls,
} from '../db/schema/index.js';

export class AiRepository {
  constructor(private readonly database: Database = db) {}

  listAgents(organizationId: string, channel?: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'VOICE') {
    const channelFilter = channel
      ? sql`${aiAgents.supportedChannels} ? ${channel}`
      : undefined;
    return this.database.query.aiAgents.findMany({
      where: channelFilter
        ? and(eq(aiAgents.organizationId, organizationId), channelFilter)
        : eq(aiAgents.organizationId, organizationId),
      orderBy: [asc(aiAgents.name)],
    });
  }

  findAgent(organizationId: string, id: string) {
    return this.database.query.aiAgents.findFirst({ where: and(eq(aiAgents.organizationId, organizationId), eq(aiAgents.id, id)) });
  }

  async createAgent(data: typeof aiAgents.$inferInsert, systemPrompt: string) {
    const [agent] = await this.database.insert(aiAgents).values(data).returning();
    await this.database.insert(aiAgentConfigs).values({
      organizationId: data.organizationId,
      agentId: agent!.id,
      systemPrompt,
      config: data,
    });
    return agent!;
  }

  async updateAgent(organizationId: string, id: string, data: Partial<typeof aiAgents.$inferInsert>, systemPrompt?: string) {
    const [agent] = await this.database.update(aiAgents).set({ ...data, updatedAt: new Date() }).where(and(eq(aiAgents.organizationId, organizationId), eq(aiAgents.id, id))).returning();
    if (agent && systemPrompt) {
      await this.database.insert(aiAgentConfigs).values({ organizationId, agentId: id, systemPrompt, config: data });
    }
    return agent;
  }

  deleteAgent(organizationId: string, id: string) {
    return this.database.delete(aiAgents).where(and(eq(aiAgents.organizationId, organizationId), eq(aiAgents.id, id)));
  }

  latestAgentConfig(organizationId: string, agentId: string) {
    return this.database.query.aiAgentConfigs.findFirst({
      where: and(eq(aiAgentConfigs.organizationId, organizationId), eq(aiAgentConfigs.agentId, agentId)),
      orderBy: [sql`${aiAgentConfigs.createdAt} desc`],
    });
  }

  listKnowledgeBases(organizationId: string) {
    return this.database.query.knowledgeBases.findMany({ where: eq(knowledgeBases.organizationId, organizationId), orderBy: [asc(knowledgeBases.name)] });
  }

  createKnowledgeBase(data: typeof knowledgeBases.$inferInsert) {
    return this.database.insert(knowledgeBases).values(data).returning().then(([row]) => row!);
  }

  updateKnowledgeBase(organizationId: string, id: string, data: Partial<typeof knowledgeBases.$inferInsert>) {
    return this.database.update(knowledgeBases)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(knowledgeBases.organizationId, organizationId), eq(knowledgeBases.id, id)))
      .returning()
      .then(([row]) => row);
  }

  deleteKnowledgeBase(organizationId: string, id: string) {
    return this.database.delete(knowledgeBases).where(and(eq(knowledgeBases.organizationId, organizationId), eq(knowledgeBases.id, id)));
  }

  findKnowledgeBase(organizationId: string, id: string) {
    return this.database.query.knowledgeBases.findFirst({ where: and(eq(knowledgeBases.organizationId, organizationId), eq(knowledgeBases.id, id)) });
  }

  async knowledgeContext(organizationId: string, knowledgeBaseId: string | null, embedding?: number[], limit = 5) {
    if (!knowledgeBaseId) return '';
    const knowledgeBase = await this.findKnowledgeBase(organizationId, knowledgeBaseId);
    if (!knowledgeBase) return '';
    const parts = [
      knowledgeBase.description?.trim()
        ? `Knowledge base: ${knowledgeBase.name}\n${knowledgeBase.description.trim()}`
        : '',
    ];
    if (embedding) {
      const chunks = await this.searchChunks(organizationId, knowledgeBaseId, embedding, limit) as Array<{ content: string }>;
      const chunkText = chunks.map((chunk) => chunk.content).filter(Boolean).join('\n---\n');
      if (chunkText) parts.push(`Additional stored knowledge:\n${chunkText}`);
    }
    return parts.filter(Boolean).join('\n\n');
  }

  listDocuments(organizationId: string, knowledgeBaseId: string) {
    return this.database.query.documents.findMany({
      where: and(eq(documents.organizationId, organizationId), eq(documents.knowledgeBaseId, knowledgeBaseId)),
      orderBy: [sql`${documents.createdAt} desc`],
    });
  }

  createDocument(data: typeof documents.$inferInsert) {
    return this.database.insert(documents).values(data).returning().then(([row]) => row!);
  }

  findDocument(id: string) {
    return this.database.query.documents.findFirst({ where: eq(documents.id, id) });
  }

  updateDocument(id: string, data: Partial<typeof documents.$inferInsert>) {
    return this.database.update(documents).set({ ...data, updatedAt: new Date() }).where(eq(documents.id, id)).returning().then(([row]) => row);
  }

  async replaceChunks(documentId: string, chunks: Array<typeof documentChunks.$inferInsert>) {
    await this.database.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
    if (chunks.length) await this.database.insert(documentChunks).values(chunks);
  }

  async searchChunks(organizationId: string, knowledgeBaseId: string | null, embedding: number[], limit = 5) {
    if (!knowledgeBaseId) return [];
    const vectorLiteral = `[${embedding.join(',')}]`;
    return this.database.execute(sql`
      select id, content, metadata
      from document_chunks
      where organization_id = ${organizationId}
        and knowledge_base_id = ${knowledgeBaseId}
      order by embedding <=> ${vectorLiteral}::vector
      limit ${limit}
    `);
  }

  getMemory(organizationId: string, leadId: string) {
    return this.database.query.leadMemories.findFirst({ where: and(eq(leadMemories.organizationId, organizationId), eq(leadMemories.leadId, leadId)) });
  }

  async upsertMemory(organizationId: string, leadId: string, facts: Record<string, unknown>, summary: string) {
    await this.database.insert(leadMemories).values({ organizationId, leadId, facts, summary })
      .onConflictDoUpdate({ target: [leadMemories.organizationId, leadMemories.leadId], set: { facts, summary, updatedAt: new Date() } });
  }

  createRun(data: typeof aiRuns.$inferInsert) {
    return this.database.insert(aiRuns).values(data).returning().then(([row]) => row!);
  }

  async tokenUsage(organizationId: string, period: 'day' | 'week' | 'month' = 'day') {
    const since = period === 'month' ? sql`now() - interval '12 months'` : period === 'week' ? sql`now() - interval '12 weeks'` : sql`now() - interval '30 days'`;
    const bucket = period === 'month' ? sql`date_trunc('month', created_at)` : period === 'week' ? sql`date_trunc('week', created_at)` : sql`date_trunc('day', created_at)`;
    const [summary, daily, byFeature, recent] = await Promise.all([
      this.database.execute(sql`
        select
          count(*)::int as runs,
          coalesce(sum(input_tokens), 0)::int as input_tokens,
          coalesce(sum(output_tokens), 0)::int as output_tokens,
          coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::int as total_tokens
        from ai_runs
        where organization_id = ${organizationId}
      `),
      this.database.execute(sql`
        select
          ${bucket}::date as bucket,
          count(*)::int as runs,
          coalesce(sum(input_tokens), 0)::int as input_tokens,
          coalesce(sum(output_tokens), 0)::int as output_tokens,
          coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::int as total_tokens
        from ai_runs
        where organization_id = ${organizationId}
          and created_at >= ${since}
        group by 1
        order by 1
      `),
      this.database.execute(sql`
        select
          coalesce(metadata->>'feature', 'conversation') as feature,
          count(*)::int as runs,
          coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::int as total_tokens
        from ai_runs
        where organization_id = ${organizationId}
          and created_at >= ${since}
        group by 1
        order by 3 desc
      `),
      this.database.execute(sql`
        select id, model, status, input_tokens, output_tokens, error, metadata, created_at
        from ai_runs
        where organization_id = ${organizationId}
        order by created_at desc
        limit 50
      `),
    ]);
    return {
      summary: queryRows(summary)[0] ?? { runs: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      daily: queryRows(daily),
      byFeature: queryRows(byFeature),
      recent: queryRows(recent),
    };
  }

  createUnknownQuestion(data: typeof unknownQuestions.$inferInsert) {
    return this.database.insert(unknownQuestions).values(data).returning().then(([row]) => row!);
  }

  createQualificationProfile(data: typeof qualificationProfiles.$inferInsert) {
    return this.database.insert(qualificationProfiles).values(data).returning().then(([row]) => row!);
  }

  listQualificationProfiles(organizationId: string) {
    return this.database.query.qualificationProfiles.findMany({ where: eq(qualificationProfiles.organizationId, organizationId), orderBy: [asc(qualificationProfiles.name)] });
  }

  findQualificationProfile(organizationId: string, id: string) {
    return this.database.query.qualificationProfiles.findFirst({ where: and(eq(qualificationProfiles.organizationId, organizationId), eq(qualificationProfiles.id, id)) });
  }

  createLeadQualification(data: typeof leadQualifications.$inferInsert) {
    return this.database.insert(leadQualifications).values(data).returning().then(([row]) => row!);
  }

  createVoiceCall(data: typeof voiceCalls.$inferInsert) {
    return this.database.insert(voiceCalls).values(data).returning().then(([row]) => row!);
  }
}

function queryRows(result: unknown) {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as { rows: unknown }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}
