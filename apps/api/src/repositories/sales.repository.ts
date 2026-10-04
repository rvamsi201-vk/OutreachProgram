import { and, asc, count, desc, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { db, type Database } from '../db/connection.js';
import {
  campaignEnrollments,
  events,
  leadQualifications,
  leads,
  notifications,
  opportunities,
  organizationMembers,
  pipelineStages,
  pipelines,
  salesTasks,
} from '../db/schema/index.js';

export class SalesRepository {
  constructor(private readonly database: Database = db) {}

  listPipelines(organizationId: string) {
    return this.database.query.pipelines.findMany({ where: eq(pipelines.organizationId, organizationId), orderBy: [desc(pipelines.isDefault), asc(pipelines.name)] });
  }

  async findPipeline(organizationId: string, id: string) {
    const pipeline = await this.database.query.pipelines.findFirst({ where: and(eq(pipelines.organizationId, organizationId), eq(pipelines.id, id)) });
    if (!pipeline) return null;
    const stages = await this.database.query.pipelineStages.findMany({ where: and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.pipelineId, id)), orderBy: [asc(pipelineStages.position)] });
    return { ...pipeline, stages };
  }

  async defaultPipeline(organizationId: string) {
    let pipeline = await this.database.query.pipelines.findFirst({ where: and(eq(pipelines.organizationId, organizationId), eq(pipelines.isDefault, true)) });
    if (!pipeline) {
      [pipeline] = await this.database.insert(pipelines).values({ organizationId, name: 'Default Sales Pipeline', isDefault: true }).returning();
      await this.database.insert(pipelineStages).values(['New', 'Contacted', 'Interested', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'].map((name, index) => ({
        organizationId,
        pipelineId: pipeline!.id,
        name,
        position: index + 1,
        kind: name === 'Won' ? 'WON' : name === 'Lost' ? 'LOST' : 'OPEN',
      })));
    }
    return this.findPipeline(organizationId, pipeline!.id);
  }

  async createPipeline(data: typeof pipelines.$inferInsert) {
    if (data.isDefault) await this.database.update(pipelines).set({ isDefault: false }).where(eq(pipelines.organizationId, data.organizationId));
    const [pipeline] = await this.database.insert(pipelines).values(data).returning();
    return pipeline!;
  }

  updatePipeline(organizationId: string, id: string, data: Partial<typeof pipelines.$inferInsert>) {
    return this.database.update(pipelines).set({ ...data, updatedAt: new Date() }).where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.id, id))).returning().then(([row]) => row);
  }

  deletePipeline(organizationId: string, id: string) {
    return this.database.delete(pipelines).where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.id, id)));
  }

  createStage(data: typeof pipelineStages.$inferInsert) {
    return this.database.insert(pipelineStages).values(data).returning().then(([row]) => row!);
  }

  updateStage(organizationId: string, id: string, data: Partial<typeof pipelineStages.$inferInsert>) {
    return this.database.update(pipelineStages).set({ ...data, updatedAt: new Date() }).where(and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.id, id))).returning().then(([row]) => row);
  }

  deleteStage(organizationId: string, id: string) {
    return this.database.delete(pipelineStages).where(and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.id, id)));
  }

  listOpportunities(organizationId: string, filters: { pipelineId?: string; stageId?: string; ownerId?: string; leadId?: string; status?: string }) {
    const clauses: SQL[] = [eq(opportunities.organizationId, organizationId)];
    if (filters.pipelineId) clauses.push(eq(opportunities.pipelineId, filters.pipelineId));
    if (filters.stageId) clauses.push(eq(opportunities.stageId, filters.stageId));
    if (filters.ownerId) clauses.push(eq(opportunities.ownerId, filters.ownerId));
    if (filters.leadId) clauses.push(eq(opportunities.leadId, filters.leadId));
    if (filters.status) clauses.push(eq(opportunities.status, filters.status));
    return this.database.select({
      id: opportunities.id,
      title: opportunities.title,
      leadId: opportunities.leadId,
      pipelineId: opportunities.pipelineId,
      stageId: opportunities.stageId,
      ownerId: opportunities.ownerId,
      value: opportunities.value,
      status: opportunities.status,
      createdAt: opportunities.createdAt,
      leadName: leads.name,
    }).from(opportunities).innerJoin(leads, eq(leads.id, opportunities.leadId)).where(and(...clauses)).orderBy(desc(opportunities.updatedAt));
  }

  findOpportunity(organizationId: string, id: string) {
    return this.database.query.opportunities.findFirst({ where: and(eq(opportunities.organizationId, organizationId), eq(opportunities.id, id)) });
  }

  async createOpportunity(data: typeof opportunities.$inferInsert) {
    const [opportunity] = await this.database.insert(opportunities).values(data).onConflictDoNothing().returning();
    return opportunity ?? this.database.query.opportunities.findFirst({ where: and(eq(opportunities.organizationId, data.organizationId), eq(opportunities.leadId, data.leadId)) });
  }

  updateOpportunity(organizationId: string, id: string, data: Partial<typeof opportunities.$inferInsert>) {
    return this.database.update(opportunities).set({ ...data, updatedAt: new Date(), closedAt: data.status === 'WON' || data.status === 'LOST' ? new Date() : undefined }).where(and(eq(opportunities.organizationId, organizationId), eq(opportunities.id, id))).returning().then(([row]) => row);
  }

  deleteOpportunity(organizationId: string, id: string) {
    return this.database.delete(opportunities).where(and(eq(opportunities.organizationId, organizationId), eq(opportunities.id, id)));
  }

  listSalespeople(organizationId: string) {
    return this.database.query.organizationMembers.findMany({ where: and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.status, 'ACTIVE')) });
  }

  async lastAssignedOwner(organizationId: string) {
    const row = await this.database.query.opportunities.findFirst({ where: eq(opportunities.organizationId, organizationId), orderBy: [desc(opportunities.createdAt)] });
    return row?.ownerId ?? null;
  }

  createTask(data: typeof salesTasks.$inferInsert) {
    return this.database.insert(salesTasks).values(data).returning().then(([row]) => row!);
  }

  listTasks(organizationId: string, filters: { ownerId?: string; status?: string; due?: 'overdue' | 'today' | 'upcoming' }) {
    const clauses: SQL[] = [eq(salesTasks.organizationId, organizationId)];
    if (filters.ownerId) clauses.push(eq(salesTasks.ownerId, filters.ownerId));
    if (filters.status) clauses.push(eq(salesTasks.status, filters.status));
    const now = new Date();
    if (filters.due === 'overdue') clauses.push(lte(salesTasks.dueAt, now), eq(salesTasks.status, 'OPEN'));
    if (filters.due === 'upcoming') clauses.push(gte(salesTasks.dueAt, now));
    return this.database.query.salesTasks.findMany({ where: and(...clauses), orderBy: [asc(salesTasks.dueAt)] });
  }

  findTask(organizationId: string, id: string) {
    return this.database.query.salesTasks.findFirst({ where: and(eq(salesTasks.organizationId, organizationId), eq(salesTasks.id, id)) });
  }

  updateTask(organizationId: string, id: string, data: Partial<typeof salesTasks.$inferInsert>) {
    return this.database.update(salesTasks).set({ ...data, updatedAt: new Date(), completedAt: data.status === 'COMPLETED' ? new Date() : undefined }).where(and(eq(salesTasks.organizationId, organizationId), eq(salesTasks.id, id))).returning().then(([row]) => row);
  }

  createNotification(data: typeof notifications.$inferInsert) {
    return this.database.insert(notifications).values(data).returning().then(([row]) => row!);
  }

  listNotifications(organizationId: string, memberId: string) {
    return this.database.query.notifications.findMany({ where: and(eq(notifications.organizationId, organizationId), eq(notifications.memberId, memberId)), orderBy: [desc(notifications.createdAt)] });
  }

  markNotificationRead(organizationId: string, memberId: string, id: string) {
    return this.database.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.organizationId, organizationId), eq(notifications.memberId, memberId), eq(notifications.id, id))).returning().then(([row]) => row);
  }

  markAllNotificationsRead(organizationId: string, memberId: string) {
    return this.database.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.organizationId, organizationId), eq(notifications.memberId, memberId), isNull(notifications.readAt)));
  }

  async createEvent(data: typeof events.$inferInsert) {
    const [event] = await this.database.insert(events).values(data).onConflictDoNothing().returning();
    return event ?? null;
  }

  pauseActiveEnrollments(organizationId: string, leadId: string) {
    return this.database.update(campaignEnrollments).set({ status: 'QUALIFIED', nextActionAt: null, updatedAt: new Date() }).where(and(eq(campaignEnrollments.organizationId, organizationId), eq(campaignEnrollments.leadId, leadId), eq(campaignEnrollments.status, 'ACTIVE')));
  }

  async overviewCounts(organizationId: string) {
    const [leadCount] = await this.database.select({ value: count() }).from(leads).where(eq(leads.organizationId, organizationId));
    const [qualifiedCount] = await this.database.select({ value: count() }).from(leadQualifications).where(and(eq(leadQualifications.organizationId, organizationId), eq(leadQualifications.result, 'QUALIFIED')));
    const [oppCount] = await this.database.select({ value: count() }).from(opportunities).where(eq(opportunities.organizationId, organizationId));
    const [wonCount] = await this.database.select({ value: count() }).from(opportunities).where(and(eq(opportunities.organizationId, organizationId), eq(opportunities.status, 'WON')));
    return { leads: leadCount?.value ?? 0, qualified: qualifiedCount?.value ?? 0, opportunities: oppCount?.value ?? 0, won: wonCount?.value ?? 0 };
  }
}
