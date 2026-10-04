import type { FastifyInstance } from 'fastify';
import { contactChannelSchema, createMessageSchema, PERMISSIONS, uuidParamSchema } from '@ai-crm/shared';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { ConversationService } from '../services/crm/conversation.service.js';

export async function conversationRoutes(app: FastifyInstance) {
  const service = new ConversationService();
  app.addHook('preHandler', authenticate);

  app.get('/conversations', { preHandler: [requirePermission(PERMISSIONS.CONVERSATIONS_READ)] }, async (req) => {
    return { data: await service.list(req.ctx.organizationId) };
  });

  app.post('/conversations', { preHandler: [requirePermission(PERMISSIONS.CONVERSATIONS_READ)] }, async (req, reply) => {
    const body = req.body as { leadId: string; channel: string };
    const leadId = uuidParamSchema.shape.id.parse(body.leadId);
    const channel = contactChannelSchema.parse(body.channel);
    const conversation = await service.getOrCreate(req.ctx.organizationId, leadId, channel);
    return reply.code(201).send(conversation);
  });

  app.get('/conversations/:id/messages', { preHandler: [requirePermission(PERMISSIONS.CONVERSATIONS_READ)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return { data: await service.messages(req.ctx.organizationId, id) };
  });

  app.post('/conversations/:id/messages', { preHandler: [requirePermission(PERMISSIONS.CONVERSATIONS_REPLY)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = createMessageSchema.parse(req.body);
    const message = await service.humanReply(req.ctx.organizationId, id, req.ctx.userId, input.content, input.metadata);
    return reply.code(201).send(message);
  });
}
