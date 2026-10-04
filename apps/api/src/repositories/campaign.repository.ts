import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { db, type Database } from '../db/connection.js';
import {
  campaignEnrollments,
  campaignRuns,
  campaigns,
  campaignStepExecutions,
  campaignSteps,
  channelAccounts,
  leadContacts,
  leads,
  leadTags,
  providerWebhookEvents,
  tags,
} from '../db/schema/index.js';
import type { CampaignListQuery, CampaignRunAudienceInput, CampaignRunInput, CreateCampaignInput, UpdateCampaignInput } from '@ai-crm/shared';

export class CampaignRepository {
  constructor(private readonly database: Database = db) {}

  async list(organizationId: string, query: CampaignListQuery) {
    const filters: SQL[] = [eq(campaigns.organizationId, organizationId)];
    if (query.status) filters.push(eq(campaigns.status, query.status));
    if (query.search) filters.push(ilike(campaigns.name, `%${query.search}%`));
    const rows = await this.database.query.campaigns.findMany({
      where: and(...filters),
      orderBy: [desc(campaigns.createdAt)],
      limit: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const data = await Promise.all(page.map(async (campaign) => ({
      ...campaign,
      steps: await this.database.query.campaignSteps.findMany({
        where: and(eq(campaignSteps.organizationId, organizationId), eq(campaignSteps.campaignId, campaign.id)),
        orderBy: [asc(campaignSteps.position)],
      }),
    })));
    return { data, hasMore: rows.length > query.limit, nextCursor: rows.length > query.limit ? data.at(-1)?.id ?? null : null };
  }

  async findById(organizationId: string, id: string) {
    const campaign = await this.database.query.campaigns.findFirst({
      where: and(eq(campaigns.organizationId, organizationId), eq(campaigns.id, id)),
    });
    if (!campaign) return null;
    const steps = await this.database.query.campaignSteps.findMany({
      where: and(eq(campaignSteps.organizationId, organizationId), eq(campaignSteps.campaignId, id)),
      orderBy: [asc(campaignSteps.position)],
    });
    return { ...campaign, steps };
  }

  async create(organizationId: string, userId: string, input: CreateCampaignInput) {
    return this.database.transaction(async (tx) => {
      const [campaign] = await tx.insert(campaigns).values({
        organizationId,
        createdBy: userId,
        name: input.name,
        description: input.description,
        audience: input.audience,
        scheduleWindow: input.scheduleWindow,
        timezone: input.timezone,
        aiAgentId: input.aiAgentId,
        qualificationProfileId: input.qualificationProfileId,
      }).returning();
      await tx.insert(campaignSteps).values(input.steps.map((step) => ({
        organizationId,
        campaignId: campaign!.id,
        position: step.position,
        channel: step.channel,
        delayMinutes: step.delayMinutes,
        subject: step.subject,
        template: step.template,
        configuration: step.configuration,
        retryPolicy: step.retryPolicy,
        conditions: step.conditions,
      })));
      return campaign!;
    });
  }

  async update(organizationId: string, id: string, input: UpdateCampaignInput) {
    return this.database.transaction(async (tx) => {
      const [campaign] = await tx.update(campaigns).set({
        name: input.name,
        description: input.description,
        audience: input.audience,
        scheduleWindow: input.scheduleWindow,
        timezone: input.timezone,
        aiAgentId: input.aiAgentId,
        qualificationProfileId: input.qualificationProfileId,
        status: input.status,
        updatedAt: new Date(),
      }).where(and(eq(campaigns.organizationId, organizationId), eq(campaigns.id, id))).returning();
      if (campaign && input.steps) {
        await tx.delete(campaignSteps).where(and(eq(campaignSteps.organizationId, organizationId), eq(campaignSteps.campaignId, id)));
        await tx.insert(campaignSteps).values(input.steps.map((step) => ({
          organizationId,
          campaignId: id,
          position: step.position,
          channel: step.channel,
          delayMinutes: step.delayMinutes,
          subject: step.subject,
          template: step.template,
          configuration: step.configuration,
          retryPolicy: step.retryPolicy,
          conditions: step.conditions,
        })));
      }
      return campaign;
    });
  }

  async delete(organizationId: string, id: string) {
    await this.database.delete(campaigns).where(and(eq(campaigns.organizationId, organizationId), eq(campaigns.id, id)));
  }

  async resolveAudience(organizationId: string, audience: { leadIds?: string[]; tags?: string[] }) {
    const leadIdSet = new Set<string>(audience.leadIds ?? []);
    if (audience.tags?.length) {
      const tagged = await this.database
        .select({ leadId: leadTags.leadId })
        .from(leadTags)
        .innerJoin(tags, eq(tags.id, leadTags.tagId))
        .where(and(eq(tags.organizationId, organizationId), inArray(tags.name, audience.tags)));
      tagged.forEach((row) => leadIdSet.add(row.leadId));
    }
    if (leadIdSet.size > 0) {
      return this.database.query.leads.findMany({
        where: and(eq(leads.organizationId, organizationId), inArray(leads.id, [...leadIdSet])),
      });
    }
    return this.database.query.leads.findMany({
      where: eq(leads.organizationId, organizationId),
      limit: 10000,
    });
  }

  async resolveRunAudience(organizationId: string, audience: CampaignRunAudienceInput) {
    const filters: SQL[] = [eq(leads.organizationId, organizationId)];
    if (audience.mode === 'BATCHES') {
      if (audience.importIds.length === 0) return [];
      filters.push(inArray(leads.importId, audience.importIds));
    }
    if (audience.mode === 'SELECTED') {
      if (audience.leadIds.length === 0) return [];
      filters.push(inArray(leads.id, audience.leadIds));
    }
    if (audience.mode === 'FILTERS') {
      const query = audience.filters;
      if (query.status) filters.push(eq(leads.status, query.status));
      if (query.ownerId) filters.push(eq(leads.ownerId, query.ownerId));
      if (query.source) filters.push(eq(leads.source, query.source));
      if (query.businessSize) filters.push(eq(leads.businessSize, query.businessSize));
      if (query.priority) filters.push(eq(leads.priority, query.priority));
      if (query.importId) filters.push(eq(leads.importId, query.importId));
      if (query.createdFrom) filters.push(gte(leads.createdAt, query.createdFrom));
      if (query.createdTo) filters.push(lte(leads.createdAt, query.createdTo));
      if (query.search) {
        const like = `%${query.search}%`;
        filters.push(or(ilike(leads.name, like), ilike(leads.company, like), ilike(leads.location, like), ilike(leads.source, like))!);
      }
    }
    if (audience.tags.length > 0) {
      const tagged = await this.database.select({ leadId: leadTags.leadId })
        .from(leadTags)
        .innerJoin(tags, eq(tags.id, leadTags.tagId))
        .where(and(eq(tags.organizationId, organizationId), inArray(tags.name, audience.tags)));
      const ids = [...new Set(tagged.map((row) => row.leadId))];
      if (ids.length === 0) return [];
      filters.push(inArray(leads.id, ids));
    }
    return this.database.query.leads.findMany({ where: and(...filters), orderBy: [asc(leads.createdAt)], limit: 10_000 });
  }

  async listRuns(organizationId: string, campaignId: string) {
    return this.database.query.campaignRuns.findMany({
      where: and(eq(campaignRuns.organizationId, organizationId), eq(campaignRuns.campaignId, campaignId)),
      orderBy: [desc(campaignRuns.createdAt)],
    });
  }

  async findRunById(organizationId: string, runId: string) {
    return this.database.query.campaignRuns.findFirst({
      where: and(eq(campaignRuns.organizationId, organizationId), eq(campaignRuns.id, runId)),
    });
  }

  async runStats(organizationId: string, runId: string) {
    const rows = await this.database.select({ status: campaignEnrollments.status, count: sql<number>`count(*)::int` })
      .from(campaignEnrollments)
      .where(and(eq(campaignEnrollments.organizationId, organizationId), eq(campaignEnrollments.campaignRunId, runId)))
      .groupBy(campaignEnrollments.status);
    return Object.fromEntries(rows.map((row) => [row.status, row.count]));
  }

  async maybeCompleteRun(runId: string) {
    const [remaining] = await this.database.select({ count: sql<number>`count(*)::int` })
      .from(campaignEnrollments)
      .where(and(eq(campaignEnrollments.campaignRunId, runId), inArray(campaignEnrollments.status, ['ACTIVE', 'PAUSED'])));
    if ((remaining?.count ?? 0) === 0) {
      await this.database.update(campaignRuns).set({ status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(campaignRuns.id, runId), eq(campaignRuns.status, 'RUNNING')));
    }
  }

  async createRun(
    organizationId: string,
    campaignId: string,
    userId: string,
    input: CampaignRunInput,
    leadIds: string[],
    firstStepId: string,
    firstActionAt: Date,
    status: 'SCHEDULED' | 'RUNNING',
    totalLeads: number,
  ) {
    return this.database.transaction(async (tx) => {
      const [run] = await tx.insert(campaignRuns).values({
        organizationId,
        campaignId,
        createdBy: userId,
        title: input.title,
        status,
        audience: input.audience,
        audienceSnapshot: leadIds,
        selectedChannels: input.selectedChannels,
        scheduledAt: input.scheduledAt,
        timezone: input.timezone,
        scheduleWindow: input.scheduleWindow,
        sendingDays: input.sendingDays,
        rateLimitPerHour: input.rateLimitPerHour,
        totalLeads,
        eligibleLeads: leadIds.length,
        excludedLeads: Math.max(totalLeads - leadIds.length, 0),
        startedAt: status === 'RUNNING' ? new Date() : null,
      }).returning();
      if (leadIds.length > 0) {
        await tx.insert(campaignEnrollments).values(leadIds.map((leadId) => ({
          organizationId,
          campaignId,
          campaignRunId: run!.id,
          leadId,
          status: 'ACTIVE',
          currentStepId: firstStepId,
          nextActionAt: firstActionAt,
        })));
      }
      return run!;
    });
  }

  async updateRunStatus(organizationId: string, runId: string, status: string) {
    const [run] = await this.database.update(campaignRuns).set({
      status,
      startedAt: status === 'RUNNING' ? new Date() : undefined,
      completedAt: ['COMPLETED', 'CANCELLED'].includes(status) ? new Date() : undefined,
      updatedAt: new Date(),
    }).where(and(eq(campaignRuns.organizationId, organizationId), eq(campaignRuns.id, runId))).returning();
    return run;
  }

  async controlRun(organizationId: string, runId: string, status: 'RUNNING' | 'PAUSED' | 'CANCELLED') {
    return this.database.transaction(async (tx) => {
      const now = new Date();
      const [run] = await tx.update(campaignRuns).set({
        status,
        startedAt: status === 'RUNNING' ? now : undefined,
        completedAt: status === 'CANCELLED' ? now : undefined,
        updatedAt: now,
      }).where(and(eq(campaignRuns.organizationId, organizationId), eq(campaignRuns.id, runId))).returning();

      if (status === 'PAUSED') {
        await tx.update(campaignEnrollments).set({ status: 'PAUSED', updatedAt: now })
          .where(and(
            eq(campaignEnrollments.organizationId, organizationId),
            eq(campaignEnrollments.campaignRunId, runId),
            eq(campaignEnrollments.status, 'ACTIVE'),
          ));
      }
      if (status === 'RUNNING') {
        await tx.update(campaignEnrollments).set({ status: 'ACTIVE', updatedAt: now })
          .where(and(
            eq(campaignEnrollments.organizationId, organizationId),
            eq(campaignEnrollments.campaignRunId, runId),
            eq(campaignEnrollments.status, 'PAUSED'),
          ));
      }
      if (status === 'CANCELLED') {
        await tx.update(campaignEnrollments).set({ status: 'CANCELLED', nextActionAt: null, completedAt: now, updatedAt: now })
          .where(and(
            eq(campaignEnrollments.organizationId, organizationId),
            eq(campaignEnrollments.campaignRunId, runId),
            inArray(campaignEnrollments.status, ['ACTIVE', 'PAUSED']),
          ));
      }

      return run;
    });
  }

  async activateDueRuns() {
    return this.database.update(campaignRuns).set({ status: 'RUNNING', startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(campaignRuns.status, 'SCHEDULED'), lte(campaignRuns.scheduledAt, new Date())))
      .returning({ id: campaignRuns.id });
  }

  async contactsForLead(organizationId: string, leadId: string, channels: string[]) {
    return this.database.query.leadContacts.findMany({
      where: and(
        eq(leadContacts.organizationId, organizationId),
        eq(leadContacts.leadId, leadId),
        inArray(leadContacts.channel, channels),
      ),
    });
  }

  async contactsForLeadChannel(organizationId: string, leadId: string, channel: string) {
    const channels = channel === 'WHATSAPP' ? ['WHATSAPP', 'SMS', 'VOICE'] : [channel];
    return this.database.query.leadContacts.findMany({
      where: and(
        eq(leadContacts.organizationId, organizationId),
        eq(leadContacts.leadId, leadId),
        inArray(leadContacts.channel, channels),
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
  }

  async launch(organizationId: string, campaignId: string, leadIds: string[], firstStepId: string, firstActionAt: Date) {
    return this.database.transaction(async (tx) => {
      if (leadIds.length > 0) {
        await tx.insert(campaignEnrollments).values(leadIds.map((leadId) => ({
          organizationId,
          campaignId,
          leadId,
          status: 'ACTIVE',
          currentStepId: firstStepId,
          nextActionAt: firstActionAt,
        }))).onConflictDoNothing();
      }
      const [campaign] = await tx.update(campaigns).set({
        status: 'RUNNING',
        launchedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(campaigns.organizationId, organizationId), eq(campaigns.id, campaignId))).returning();
      return campaign!;
    });
  }

  async updateStatus(organizationId: string, campaignId: string, status: string) {
    const [campaign] = await this.database.update(campaigns).set({ status, updatedAt: new Date() })
      .where(and(eq(campaigns.organizationId, organizationId), eq(campaigns.id, campaignId))).returning();
    return campaign;
  }

  async dueEnrollmentIds(limit = 100) {
    const result = await this.database.execute(sql<{ id: string }>`
      with due as (
        select
          ce.id,
          ce.next_action_at,
          cr.rate_limit_per_hour,
          (select count(*)::int from campaign_step_executions cse where cse.campaign_run_id = cr.id and cse.created_at >= now() - interval '1 hour') as recent_count,
          row_number() over (partition by cr.id order by ce.next_action_at asc) as run_position
        from campaign_enrollments ce
        join campaign_runs cr on cr.id = ce.campaign_run_id
        where ce.status = 'ACTIVE'
          and cr.status = 'RUNNING'
          and ce.next_action_at <= now()
          and extract(dow from now() at time zone cr.timezone)::int in (select jsonb_array_elements_text(cr.sending_days)::int)
          and extract(hour from now() at time zone cr.timezone)::int >= (cr.schedule_window->>'startHour')::int
          and extract(hour from now() at time zone cr.timezone)::int < (cr.schedule_window->>'endHour')::int
      )
      select id from due
      where run_position <= greatest(rate_limit_per_hour - recent_count, 0)
      order by next_action_at asc
      limit ${limit}
    `);
    return result.map((row) => String(row.id));
  }

  async createExecutionForEnrollment(enrollmentId: string) {
    const enrollment = await this.database.query.campaignEnrollments.findFirst({
      where: eq(campaignEnrollments.id, enrollmentId),
    });
    if (!enrollment?.currentStepId) return null;
    const [execution] = await this.database.insert(campaignStepExecutions).values({
      organizationId: enrollment.organizationId,
      campaignId: enrollment.campaignId,
      campaignRunId: enrollment.campaignRunId,
      enrollmentId: enrollment.id,
      stepId: enrollment.currentStepId,
      leadId: enrollment.leadId,
      status: 'QUEUED',
    }).onConflictDoNothing().returning();
    return execution ?? null;
  }

  async executionBundle(executionId: string) {
    const execution = await this.database.query.campaignStepExecutions.findFirst({
      where: eq(campaignStepExecutions.id, executionId),
    });
    if (!execution) return null;
    const [campaign, run, enrollment, step, lead] = await Promise.all([
      this.database.query.campaigns.findFirst({ where: eq(campaigns.id, execution.campaignId) }),
      execution.campaignRunId ? this.database.query.campaignRuns.findFirst({ where: eq(campaignRuns.id, execution.campaignRunId) }) : Promise.resolve(null),
      this.database.query.campaignEnrollments.findFirst({ where: eq(campaignEnrollments.id, execution.enrollmentId) }),
      this.database.query.campaignSteps.findFirst({ where: eq(campaignSteps.id, execution.stepId) }),
      this.database.query.leads.findFirst({ where: eq(leads.id, execution.leadId) }),
    ]);
    return { execution, campaign, run, enrollment, step, lead };
  }

  async markExecution(id: string, data: Partial<typeof campaignStepExecutions.$inferInsert>) {
    const [execution] = await this.database.update(campaignStepExecutions).set({ ...data, updatedAt: new Date() }).where(eq(campaignStepExecutions.id, id)).returning();
    return execution;
  }

  async advanceEnrollment(enrollmentId: string, nextStepId: string | null, nextActionAt: Date | null, outcome: string) {
    const [enrollment] = await this.database.update(campaignEnrollments).set({
      currentStepId: nextStepId,
      nextActionAt,
      status: nextStepId ? 'ACTIVE' : 'COMPLETED',
      lastOutcome: outcome,
      completedAt: nextStepId ? null : new Date(),
      updatedAt: new Date(),
    }).where(eq(campaignEnrollments.id, enrollmentId)).returning();
    return enrollment;
  }

  async nextStep(organizationId: string, campaignId: string, position: number, selectedChannels?: string[]) {
    const filters: SQL[] = [eq(campaignSteps.organizationId, organizationId), eq(campaignSteps.campaignId, campaignId), sql`${campaignSteps.position} > ${position}`];
    if (selectedChannels?.length) filters.push(inArray(campaignSteps.channel, selectedChannels));
    return this.database.query.campaignSteps.findFirst({ where: and(...filters), orderBy: [asc(campaignSteps.position)] });
  }

  async defaultAccount(organizationId: string, channel: string) {
    return this.database.query.channelAccounts.findFirst({
      where: and(eq(channelAccounts.organizationId, organizationId), eq(channelAccounts.channel, channel), eq(channelAccounts.isDefault, true)),
    });
  }

  async createWebhookEvent(data: typeof providerWebhookEvents.$inferInsert) {
    const [event] = await this.database.insert(providerWebhookEvents).values(data).onConflictDoNothing().returning();
    return event ?? null;
  }
}
