import { and, eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/connection.js';
import { contactAttempts, leadContacts } from '../../db/schema/index.js';
import { ProviderFactory } from '../../providers/provider.factory.js';
import { CampaignRepository } from '../../repositories/campaign.repository.js';
import { ConversationRepository } from '../../repositories/conversation.repository.js';
import { ConsentService } from '../crm/consent.service.js';
import { EncryptionService } from '../security/encryption.service.js';
import { ConditionEvaluator } from './condition-evaluator.service.js';
import { CampaignMessageComposer } from './campaign-message-composer.service.js';

function renderTemplate(
  template: string,
  lead: Record<string, unknown>,
  contact?: { channel: string; value: string; normalizedValue: string; validationStatus: string },
) {
  const values: Record<string, unknown> = {
    unsubscribe_url: 'https://example.invalid/unsubscribe',
    'lead.id': lead.id,
    'lead.name': lead.name,
    'lead.company': lead.company,
    'lead.pitch': lead.pitch,
    'lead.info': lead.info,
    'lead.comments': lead.comments,
    'lead.status': lead.status,
    'lead.source': lead.source,
    'lead.location': lead.location,
    'lead.business_size': lead.businessSize,
    'lead.businessSize': lead.businessSize,
    'lead.website': lead.website,
    'lead.ratings': lead.ratings,
    'lead.score': lead.score,
    'lead.priority': lead.priority,
    'lead.timezone': lead.timezone,
    'contact.channel': contact?.channel,
    'contact.value': contact?.value,
    'contact.normalized_value': contact?.normalizedValue,
    'contact.normalizedValue': contact?.normalizedValue,
    'contact.validation_status': contact?.validationStatus,
    'contact.validationStatus': contact?.validationStatus,
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (Array.isArray(value)) return value.join(', ');
    return value === null || typeof value === 'undefined' ? '' : String(value);
  });
}

function todayInTimezone(now: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(now);
}

export class CampaignExecutionService {
  constructor(
    private readonly repo = new CampaignRepository(),
    private readonly conversations = new ConversationRepository(),
    private readonly consent = new ConsentService(db),
    private readonly evaluator = new ConditionEvaluator(),
    private readonly encryption = new EncryptionService(env.ENCRYPTION_KEY),
    private readonly providerFactory = new ProviderFactory(),
    private readonly composer = new CampaignMessageComposer(),
  ) {}

  async execute(executionId: string) {
    const bundle = await this.repo.executionBundle(executionId);
    if (!bundle?.execution || !bundle.campaign || !bundle.enrollment || !bundle.step || !bundle.lead) return;
    const { execution, campaign, run, enrollment, step, lead } = bundle;

    if (execution.status === 'COMPLETED') return;
    await this.repo.markExecution(execution.id, { status: 'RUNNING', startedAt: new Date(), attempt: execution.attempt + 1 });

    if ((run ? run.status !== 'RUNNING' : campaign.status !== 'RUNNING') || enrollment.status !== 'ACTIVE') {
      await this.repo.markExecution(execution.id, { status: 'SKIPPED', outcome: 'NOT_ACTIVE', completedAt: new Date() });
      return;
    }

    const conditions = step.conditions as Array<{ if: string; in: Array<string | number | boolean | null> }>;
    if (!this.evaluator.evaluateAll(conditions, { previous: { outcome: enrollment.lastOutcome } })) {
      await this.repo.markExecution(execution.id, { status: 'SKIPPED', outcome: 'CONDITION_NOT_MET', completedAt: new Date() });
      await this.advance(step, enrollment.id, 'CONDITION_NOT_MET', run?.selectedChannels as string[] | undefined, run?.id);
      return;
    }

    const timezone = run?.timezone ?? campaign.timezone ?? lead.timezone;
    const scheduleWindow = (run?.scheduleWindow ?? campaign.scheduleWindow ?? { startHour: 9, endHour: 20 }) as { startHour: number; endHour: number };
    const allowed = await this.consent.canContact(execution.organizationId, lead.id, step.channel, {
      timezone,
      scheduleWindow,
    });
    if (!allowed.allowed) {
      const outcome = allowed.reason === 'opted_out' ? 'OPTED_OUT' : 'CONSENT_BLOCKED';
      await this.repo.markExecution(execution.id, { status: outcome, outcome: allowed.reason, completedAt: new Date() });
      await this.repo.advanceEnrollment(enrollment.id, null, null, outcome);
      if (run?.id) await this.repo.maybeCompleteRun(run.id);
      return;
    }

    const contact = step.channel === 'WHATSAPP'
      ? (await this.repo.contactsForLeadChannel(execution.organizationId, lead.id, 'WHATSAPP')).find((item) => item.validationStatus !== 'INVALID')
      : await db.query.leadContacts.findFirst({
        where: and(
          eq(leadContacts.organizationId, execution.organizationId),
          eq(leadContacts.leadId, lead.id),
          eq(leadContacts.channel, step.channel),
        ),
      });
    if (!contact) {
      await this.repo.markExecution(execution.id, { status: 'FAILED', outcome: 'NO_CONTACT', error: 'No contact found', completedAt: new Date() });
      await this.advance(step, enrollment.id, 'NO_CONTACT', run?.selectedChannels as string[] | undefined, run?.id);
      return;
    }

    const account = await this.repo.defaultAccount(execution.organizationId, step.channel);
    const credentials = account ? this.encryption.decryptJson(account.encryptedCredentials) : {};
    const provider = this.providerFactory.create({
      channel: step.channel,
      provider: account?.provider ?? 'sandbox',
      configuration: account?.configuration as Record<string, unknown> ?? {},
      credentials,
      accountId: account?.id,
    });

    const conversation = await this.conversations.getOrCreate(execution.organizationId, lead.id, step.channel);
    const fallbackBody = renderTemplate(step.template, lead, contact);
    const subject = step.subject ? renderTemplate(step.subject, lead, contact) : undefined;
    const composed = await this.composer.compose({
      organizationId: execution.organizationId,
      lead,
      channel: step.channel,
      fallbackBody,
      campaignName: campaign.name,
      campaignDescription: campaign.description,
      agentId: campaign.aiAgentId,
      stepConfiguration: step.configuration as Record<string, unknown>,
    });
    const body = composed.body;
    const result = await provider.send({
      organizationId: execution.organizationId,
      leadId: lead.id,
      channel: step.channel as 'EMAIL' | 'SMS' | 'WHATSAPP',
      to: contact.normalizedValue,
      subject,
      body,
      metadata: { campaignId: campaign.id, executionId, aiGenerated: composed.aiGenerated },
    });

    const message = await this.conversations.createMessage({
      organizationId: execution.organizationId,
      conversationId: conversation.id,
      leadId: lead.id,
      direction: 'OUTBOUND',
      senderType: 'SYSTEM',
      content: body,
      providerMessageId: result.providerMessageId,
      metadata: {
        campaignId: campaign.id,
        executionId,
        status: result.status,
        subject,
        aiGenerated: composed.aiGenerated,
        aiModel: composed.model,
        aiFallbackReason: composed.error,
      },
    });

    await db.insert(contactAttempts).values({
      organizationId: execution.organizationId,
      leadId: lead.id,
      channel: step.channel,
      attemptedOn: todayInTimezone(new Date(), timezone),
    });

    await this.repo.markExecution(execution.id, {
      status: 'COMPLETED',
      providerMessageId: result.providerMessageId,
      outcome: result.status,
      metadata: { messageId: message.id, aiGenerated: composed.aiGenerated, aiModel: composed.model, aiFallbackReason: composed.error },
      completedAt: new Date(),
    });
    await this.advance(step, enrollment.id, result.status, run?.selectedChannels as string[] | undefined, run?.id);
  }

  private async advance(step: { organizationId: string; campaignId: string; position: number }, enrollmentId: string, outcome: string, selectedChannels?: string[], runId?: string) {
    const nextStep = await this.repo.nextStep(step.organizationId, step.campaignId, step.position, selectedChannels);
    const nextActionAt = nextStep ? new Date(Date.now() + nextStep.delayMinutes * 60_000) : null;
    await this.repo.advanceEnrollment(enrollmentId, nextStep?.id ?? null, nextActionAt, outcome);
    if (runId) await this.repo.maybeCompleteRun(runId);
  }
}
