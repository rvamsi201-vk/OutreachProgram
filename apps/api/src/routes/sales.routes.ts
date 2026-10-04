import type { FastifyInstance } from 'fastify';
import { analyticsQuerySchema, opportunitySchema, PERMISSIONS, pipelineSchema, pipelineStageSchema, taskSchema, uuidParamSchema } from '@ai-crm/shared';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { NotFoundError } from '../errors/index.js';
import { SalesRepository } from '../repositories/sales.repository.js';
import { realtimeEvents, type RealtimeEvent } from '../services/realtime/event-bus.js';

export async function salesRoutes(app: FastifyInstance) {
  const repo = new SalesRepository();
  app.addHook('preHandler', authenticate);
  const normalizeOpportunity = (value: Partial<ReturnType<typeof opportunitySchema.parse>>) => ({
    ...value,
    expectedCloseDate: value.expectedCloseDate instanceof Date ? value.expectedCloseDate.toISOString().slice(0, 10) : value.expectedCloseDate,
  });

  app.get('/pipelines', { preHandler: [requirePermission(PERMISSIONS.SETTINGS_UPDATE)] }, async (req) => ({ data: await repo.listPipelines(req.ctx.organizationId) }));
  app.post('/pipelines', { preHandler: [requirePermission(PERMISSIONS.SETTINGS_UPDATE)] }, async (req, reply) => reply.code(201).send(await repo.createPipeline({ organizationId: req.ctx.organizationId, ...pipelineSchema.parse(req.body) })));
  app.get('/pipelines/:id', { preHandler: [requirePermission(PERMISSIONS.SETTINGS_UPDATE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const pipeline = await repo.findPipeline(req.ctx.organizationId, id);
    if (!pipeline) throw new NotFoundError('Pipeline', id);
    return pipeline;
  });
  app.patch('/pipelines/:id', { preHandler: [requirePermission(PERMISSIONS.SETTINGS_UPDATE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const pipeline = await repo.updatePipeline(req.ctx.organizationId, id, pipelineSchema.partial().parse(req.body));
    if (!pipeline) throw new NotFoundError('Pipeline', id);
    return pipeline;
  });
  app.delete('/pipelines/:id', { preHandler: [requirePermission(PERMISSIONS.SETTINGS_UPDATE)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    await repo.deletePipeline(req.ctx.organizationId, id);
    return reply.code(204).send();
  });
  app.post('/pipelines/:id/stages', { preHandler: [requirePermission(PERMISSIONS.SETTINGS_UPDATE)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const stage = pipelineStageSchema.parse(req.body);
    return reply.code(201).send(await repo.createStage({ organizationId: req.ctx.organizationId, pipelineId: id, ...stage }));
  });
  app.patch('/pipelines/:id/stages/:stageId', { preHandler: [requirePermission(PERMISSIONS.SETTINGS_UPDATE)] }, async (req) => {
    const { stageId } = req.params as { id: string; stageId: string };
    const stage = await repo.updateStage(req.ctx.organizationId, stageId, pipelineStageSchema.partial().parse(req.body));
    if (!stage) throw new NotFoundError('Pipeline stage', stageId);
    return stage;
  });
  app.delete('/pipelines/:id/stages/:stageId', { preHandler: [requirePermission(PERMISSIONS.SETTINGS_UPDATE)] }, async (req, reply) => {
    const { stageId } = req.params as { id: string; stageId: string };
    await repo.deleteStage(req.ctx.organizationId, stageId);
    return reply.code(204).send();
  });

  app.get('/opportunities', { preHandler: [requirePermission(PERMISSIONS.LEADS_READ)] }, async (req) => ({ data: await repo.listOpportunities(req.ctx.organizationId, req.query as Record<string, string>) }));
  app.post('/opportunities', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req, reply) => {
    const input = opportunitySchema.parse(req.body);
    return reply.code(201).send(await repo.createOpportunity({
      organizationId: req.ctx.organizationId,
      ...input,
      expectedCloseDate: input.expectedCloseDate instanceof Date ? input.expectedCloseDate.toISOString().slice(0, 10) : input.expectedCloseDate,
    }));
  });
  app.get('/opportunities/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_READ)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const opportunity = await repo.findOpportunity(req.ctx.organizationId, id);
    if (!opportunity) throw new NotFoundError('Opportunity', id);
    return opportunity;
  });
  app.patch('/opportunities/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = normalizeOpportunity(opportunitySchema.partial().parse(req.body));
    const opportunity = await repo.updateOpportunity(req.ctx.organizationId, id, input);
    if (!opportunity) throw new NotFoundError('Opportunity', id);
    await repo.createEvent({
      organizationId: req.ctx.organizationId,
      type: input.stageId ? 'opportunity.stage_changed' : input.status === 'WON' ? 'opportunity.won' : input.status === 'LOST' ? 'opportunity.lost' : 'opportunity.updated',
      entityType: 'opportunity',
      entityId: id,
      leadId: opportunity.leadId,
      opportunityId: id,
      idempotencyKey: `opportunity.updated:${id}:${Date.now()}`,
      metadata: input,
    });
    return opportunity;
  });
  app.delete('/opportunities/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_DELETE)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    await repo.deleteOpportunity(req.ctx.organizationId, id);
    return reply.code(204).send();
  });

  app.get('/tasks', { preHandler: [requirePermission(PERMISSIONS.LEADS_READ)] }, async (req) => {
    const query = req.query as { mine?: string; status?: string; due?: 'overdue' | 'today' | 'upcoming' };
    return { data: await repo.listTasks(req.ctx.organizationId, { ownerId: query.mine === 'true' ? req.ctx.memberId : undefined, status: query.status, due: query.due }) };
  });
  app.post('/tasks', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req, reply) => reply.code(201).send(await repo.createTask({ organizationId: req.ctx.organizationId, ...taskSchema.parse(req.body) })));
  app.get('/tasks/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_READ)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const task = await repo.findTask(req.ctx.organizationId, id);
    if (!task) throw new NotFoundError('Task', id);
    return task;
  });
  app.patch('/tasks/:id', { preHandler: [requirePermission(PERMISSIONS.LEADS_UPDATE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const task = await repo.updateTask(req.ctx.organizationId, id, taskSchema.partial().parse(req.body));
    if (!task) throw new NotFoundError('Task', id);
    if (task.status === 'COMPLETED') {
      await repo.createEvent({ organizationId: req.ctx.organizationId, type: 'sales_task.completed', entityType: 'sales_task', entityId: id, leadId: task.leadId, opportunityId: task.opportunityId, idempotencyKey: `sales_task.completed:${id}` });
    }
    return task;
  });

  app.get('/notifications', async (req) => ({ data: await repo.listNotifications(req.ctx.organizationId, req.ctx.memberId) }));
  app.post('/notifications/:id/read', async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return repo.markNotificationRead(req.ctx.organizationId, req.ctx.memberId, id);
  });
  app.post('/notifications/read-all', async (req, reply) => {
    await repo.markAllNotificationsRead(req.ctx.organizationId, req.ctx.memberId);
    return reply.code(204).send();
  });

  app.get('/analytics/overview', { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_READ)] }, async (req) => {
    analyticsQuerySchema.parse(req.query);
    const counts = await repo.overviewCounts(req.ctx.organizationId);
    return { ...counts, aiCost: null };
  });
  app.get('/analytics/funnel', { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_READ)] }, async (req) => {
    analyticsQuerySchema.parse(req.query);
    const counts = await repo.overviewCounts(req.ctx.organizationId);
    return { leads: counts.leads, reached: 0, responded: 0, interested: 0, qualified: counts.qualified, handedOff: counts.opportunities, won: counts.won };
  });
  app.get('/analytics/channels', { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_READ)] }, async () => ({ data: [] }));
  app.get('/analytics/campaigns/:id', { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_READ)] }, async () => ({ audience: 0, enrolled: 0, reached: 0, responded: 0, interested: 0, qualified: 0, optedOut: 0, failed: 0, completed: 0 }));
  app.get('/analytics/salespeople', { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_READ)] }, async () => ({ data: [] }));
  app.get('/analytics/ai', { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_READ)] }, async () => ({ runs: 0, inputTokens: 0, outputTokens: 0, cost: null, costPerQualifiedLead: null }));
}

export async function realtimeRoutes(app: FastifyInstance) {
  app.get('/events/stream', { preHandler: [authenticate] }, async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const handler = (event: RealtimeEvent) => {
      if (event.organizationId === req.ctx.organizationId) {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event.payload)}\n\n`);
      }
    };
    realtimeEvents.on('event', handler);
    req.raw.on('close', () => realtimeEvents.off('event', handler));
  });
}
