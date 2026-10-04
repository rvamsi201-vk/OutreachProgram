import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  aiAgentSchema,
  documentUrlSchema,
  knowledgeTextDocumentSchema,
  knowledgeBaseSchema,
  PERMISSIONS,
  qualificationProfileSchema,
  uuidParamSchema,
} from '@ai-crm/shared';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { NotFoundError } from '../errors/index.js';
import { AiRepository } from '../repositories/ai.repository.js';
import { AgentPromptBuilder } from '../modules/ai/agents/prompt-builder.service.js';
import { documentIngestionQueue } from '../queues/ai.queue.js';
import { ConversationEngine } from '../modules/ai/conversation/conversation-engine.service.js';
import {
  assertAllowedUpload,
  getSafeStoredFilename,
  sanitizeFilename,
} from '../services/security/upload-security.service.js';

export async function aiRoutes(app: FastifyInstance) {
  const repo = new AiRepository();
  const promptBuilder = new AgentPromptBuilder();
  app.addHook('preHandler', authenticate);

  app.get('/agents', { preHandler: [requirePermission(PERMISSIONS.AI_MANAGE)] }, async (req) => {
    const channel = (req.query as { channel?: string }).channel;
    const filteredChannel = ['EMAIL', 'SMS', 'WHATSAPP', 'VOICE'].includes(channel ?? '')
      ? channel as 'EMAIL' | 'SMS' | 'WHATSAPP' | 'VOICE'
      : undefined;
    return { data: await repo.listAgents(req.ctx.organizationId, filteredChannel) };
  });

  app.post('/agents', { preHandler: [requirePermission(PERMISSIONS.AI_MANAGE)] }, async (req, reply) => {
    const input = aiAgentSchema.parse(req.body);
    const systemPrompt = promptBuilder.build(input);
    const agent = await repo.createAgent({ organizationId: req.ctx.organizationId, ...input }, systemPrompt);
    return reply.code(201).send(agent);
  });

  app.get('/agents/:id', { preHandler: [requirePermission(PERMISSIONS.AI_MANAGE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const agent = await repo.findAgent(req.ctx.organizationId, id);
    if (!agent) throw new NotFoundError('Agent', id);
    return agent;
  });

  app.patch('/agents/:id', { preHandler: [requirePermission(PERMISSIONS.AI_MANAGE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = aiAgentSchema.partial().parse(req.body);
    const existing = await repo.findAgent(req.ctx.organizationId, id);
    if (!existing) throw new NotFoundError('Agent', id);
    const merged = { ...existing, ...input };
    const systemPrompt = promptBuilder.build({
      name: merged.name,
      role: merged.role,
      tone: merged.tone,
      languages: merged.languages as string[],
      objective: merged.objective,
      mustCollectFields: merged.mustCollectFields as string[],
      allowedClaims: merged.allowedClaims as string[],
      forbiddenClaims: merged.forbiddenClaims as string[],
      escalationRules: merged.escalationRules as string[],
    });
    return repo.updateAgent(req.ctx.organizationId, id, input, systemPrompt);
  });

  app.delete('/agents/:id', { preHandler: [requirePermission(PERMISSIONS.AI_MANAGE)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    await repo.deleteAgent(req.ctx.organizationId, id);
    return reply.code(204).send();
  });

  app.get('/knowledge-bases', { preHandler: [requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE)] }, async (req) => {
    return { data: await repo.listKnowledgeBases(req.ctx.organizationId) };
  });

  app.post('/knowledge-bases', { preHandler: [requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE)] }, async (req, reply) => {
    const input = knowledgeBaseSchema.parse(req.body);
    const kb = await repo.createKnowledgeBase({ organizationId: req.ctx.organizationId, ...input });
    return reply.code(201).send(kb);
  });

  app.patch('/knowledge-bases/:id', { preHandler: [requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = knowledgeBaseSchema.partial().parse(req.body);
    const kb = await repo.updateKnowledgeBase(req.ctx.organizationId, id, input);
    if (!kb) throw new NotFoundError('Knowledge base', id);
    return kb;
  });

  app.delete('/knowledge-bases/:id', { preHandler: [requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    await repo.deleteKnowledgeBase(req.ctx.organizationId, id);
    return reply.code(204).send();
  });

  app.get('/knowledge-bases/:id/documents', { preHandler: [requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return { data: await repo.listDocuments(req.ctx.organizationId, id) };
  });

  app.post('/knowledge-bases/:id/documents/upload', { preHandler: [requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const kb = await repo.findKnowledgeBase(req.ctx.organizationId, id);
    if (!kb) throw new NotFoundError('Knowledge base', id);
    const file = await req.file();
    if (!file) throw new Error('Document file is required');
    const buffer = await file.toBuffer();
    assertAllowedUpload(file.filename, buffer.byteLength, {
      allowedExtensions: ['.pdf', '.docx', '.txt', '.md'],
      maxBytes: 25 * 1024 * 1024,
    });
    const uploadDir = join(process.cwd(), 'uploads', req.ctx.organizationId, 'knowledge');
    await mkdir(uploadDir, { recursive: true });
    const safeOriginalName = sanitizeFilename(file.filename);
    const filePath = join(uploadDir, getSafeStoredFilename(file.filename));
    await writeFile(filePath, buffer);
    const document = await repo.createDocument({
      organizationId: req.ctx.organizationId,
      knowledgeBaseId: id,
      fileName: safeOriginalName,
      sourceType: safeOriginalName.toLowerCase().endsWith('.pdf') ? 'PDF' : safeOriginalName.toLowerCase().endsWith('.docx') ? 'DOCX' : 'TXT',
      filePath,
      status: 'PENDING',
    });
    await documentIngestionQueue.add('ingest', { documentId: document.id }, { jobId: document.id, attempts: 3 });
    return reply.code(202).send(document);
  });

  app.post('/documents/url', { preHandler: [requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE)] }, async (req, reply) => {
    const input = documentUrlSchema.parse(req.body);
    const kb = await repo.findKnowledgeBase(req.ctx.organizationId, input.knowledgeBaseId);
    if (!kb) throw new NotFoundError('Knowledge base', input.knowledgeBaseId);
    const document = await repo.createDocument({
      organizationId: req.ctx.organizationId,
      knowledgeBaseId: input.knowledgeBaseId,
      fileName: input.url,
      sourceType: 'URL',
      sourceUrl: input.url,
      status: 'PENDING',
    });
    await documentIngestionQueue.add('ingest', { documentId: document.id }, { jobId: document.id, attempts: 3 });
    return reply.code(202).send(document);
  });

  app.post('/documents/text', { preHandler: [requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE)] }, async (req, reply) => {
    const input = knowledgeTextDocumentSchema.parse(req.body);
    const kb = await repo.findKnowledgeBase(req.ctx.organizationId, input.knowledgeBaseId);
    if (!kb) throw new NotFoundError('Knowledge base', input.knowledgeBaseId);
    const document = await repo.createDocument({
      organizationId: req.ctx.organizationId,
      knowledgeBaseId: input.knowledgeBaseId,
      fileName: input.title,
      sourceType: input.sourceType,
      content: input.content,
      status: 'PENDING',
    });
    await documentIngestionQueue.add('ingest', { documentId: document.id }, { jobId: document.id, attempts: 3 });
    return reply.code(202).send(document);
  });

  app.get('/qualification-profiles', { preHandler: [requirePermission(PERMISSIONS.AI_MANAGE)] }, async (req) => {
    return { data: await repo.listQualificationProfiles(req.ctx.organizationId) };
  });

  app.post('/qualification-profiles', { preHandler: [requirePermission(PERMISSIONS.AI_MANAGE)] }, async (req, reply) => {
    const input = qualificationProfileSchema.parse(req.body);
    const profile = await repo.createQualificationProfile({ organizationId: req.ctx.organizationId, ...input });
    return reply.code(201).send(profile);
  });

  app.post('/ai/respond', { preHandler: [requirePermission(PERMISSIONS.AI_MANAGE)] }, async (req) => {
    const body = req.body as { leadId: string; conversationId: string; agentId: string; qualificationProfileId?: string; message: string };
    return new ConversationEngine().respond({
      organizationId: req.ctx.organizationId,
      leadId: body.leadId,
      conversationId: body.conversationId,
      agentId: body.agentId,
      qualificationProfileId: body.qualificationProfileId,
      message: body.message,
    });
  });

  app.get('/analytics/token-usage', { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_READ)] }, async (req) => {
    const period = (req.query as { period?: string }).period;
    return repo.tokenUsage(req.ctx.organizationId, period === 'week' || period === 'month' ? period : 'day');
  });
}
