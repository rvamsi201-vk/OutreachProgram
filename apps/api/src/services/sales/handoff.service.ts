import { db } from '../../db/connection.js';
import { auditLogs } from '../../db/schema/index.js';
import { SalesRepository } from '../../repositories/sales.repository.js';
import { AssignmentService } from './assignment.service.js';
import { publishRealtime } from '../realtime/event-bus.js';

export class HandoffService {
  constructor(
    private readonly repo = new SalesRepository(),
    private readonly assignment = new AssignmentService(repo),
  ) {}

  async handoffQualifiedLead(input: {
    organizationId: string;
    leadId: string;
    leadName: string;
    qualificationId?: string;
    facts?: Record<string, unknown>;
  }) {
    const idempotencyKey = `handoff:${input.leadId}`;
    const event = await this.repo.createEvent({
      organizationId: input.organizationId,
      type: 'lead.handed_off',
      entityType: 'lead',
      entityId: input.leadId,
      leadId: input.leadId,
      idempotencyKey,
      metadata: { qualificationId: input.qualificationId },
    });
    if (!event) {
      return { idempotent: true };
    }

    await this.repo.pauseActiveEnrollments(input.organizationId, input.leadId);
    const pipeline = await this.repo.defaultPipeline(input.organizationId);
    const firstStage = pipeline?.stages[0];
    if (!pipeline || !firstStage) throw new Error('Default pipeline has no stages');
    const owner = await this.assignment.assignOpportunity(input.organizationId);
    const opportunity = await this.repo.createOpportunity({
      organizationId: input.organizationId,
      leadId: input.leadId,
      pipelineId: pipeline.id,
      stageId: firstStage.id,
      ownerId: owner.id,
      title: `${input.leadName} opportunity`,
      status: 'OPEN',
      source: 'AI_QUALIFICATION',
    });
    const task = await this.repo.createTask({
      organizationId: input.organizationId,
      ownerId: owner.id,
      leadId: input.leadId,
      opportunityId: opportunity!.id,
      title: 'Call qualified lead',
      description: 'Review AI summary, qualification facts, and continue the sales conversation.',
      dueAt: new Date(),
      priority: 'HIGH',
      status: 'OPEN',
    });
    const notification = await this.repo.createNotification({
      organizationId: input.organizationId,
      memberId: owner.id,
      userId: owner.userId,
      title: 'Qualified lead assigned to you',
      body: input.leadName,
      link: `/leads/${input.leadId}`,
    });
    await this.repo.createEvent({
      organizationId: input.organizationId,
      type: 'opportunity.created',
      entityType: 'opportunity',
      entityId: opportunity!.id,
      leadId: input.leadId,
      opportunityId: opportunity!.id,
      idempotencyKey: `opportunity.created:${opportunity!.id}`,
    });
    await this.repo.createEvent({
      organizationId: input.organizationId,
      type: 'sales_task.created',
      entityType: 'sales_task',
      entityId: task.id,
      leadId: input.leadId,
      opportunityId: opportunity!.id,
      idempotencyKey: `sales_task.created:${task.id}`,
    });
    await db.insert(auditLogs).values({
      organizationId: input.organizationId,
      action: 'lead.handed_off',
      entityType: 'lead',
      entityId: input.leadId,
      metadata: { opportunityId: opportunity!.id, ownerId: owner.id },
    });
    publishRealtime({
      organizationId: input.organizationId,
      type: 'notification.created',
      payload: { notificationId: notification.id, leadId: input.leadId, opportunityId: opportunity!.id },
    });
    return { opportunity, task, notification };
  }
}
