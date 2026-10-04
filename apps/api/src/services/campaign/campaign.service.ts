import type { CampaignCondition, CampaignRunInput, CreateCampaignInput, UpdateCampaignInput } from '@ai-crm/shared';
import { ConflictError, NotFoundError, ValidationError } from '../../errors/index.js';
import { CampaignRepository } from '../../repositories/campaign.repository.js';
import { CampaignStateMachine } from './state-machine.service.js';
import { ConsentService } from '../crm/consent.service.js';
import { db } from '../../db/connection.js';

interface RunPreviewLeadDetail {
  leadId: string;
  name: string;
  company: string | null;
  status: string;
  eligible: boolean;
  reachableChannels: string[];
  contacts: Array<{ requestedChannel: string; contactChannel: string; value: string; normalizedValue: string; validationStatus: string }>;
  excludedReasons: string[];
}

export class CampaignService {
  constructor(
    private readonly repo = new CampaignRepository(),
    private readonly stateMachine = new CampaignStateMachine(),
    private readonly consent = new ConsentService(db),
  ) {}

  list(organizationId: string, query: Parameters<CampaignRepository['list']>[1]) {
    return this.repo.list(organizationId, query);
  }

  get(organizationId: string, id: string) {
    return this.repo.findById(organizationId, id);
  }

  create(organizationId: string, userId: string, input: CreateCampaignInput) {
    this.validateSteps(input.steps);
    return this.repo.create(organizationId, userId, input);
  }

  update(organizationId: string, id: string, input: UpdateCampaignInput) {
    if (input.steps) this.validateSteps(input.steps);
    return this.repo.update(organizationId, id, input);
  }

  delete(organizationId: string, id: string) {
    return this.repo.delete(organizationId, id);
  }

  async previewAudience(organizationId: string, id: string) {
    const campaign = await this.repo.findById(organizationId, id);
    if (!campaign) throw new NotFoundError('Campaign', id);
    const leads = await this.repo.resolveAudience(organizationId, campaign.audience as { leadIds?: string[]; tags?: string[] });
    return { count: leads.length };
  }

  async listRuns(organizationId: string, campaignId: string) {
    const runs = await this.repo.listRuns(organizationId, campaignId);
    return Promise.all(runs.map(async (run) => ({ ...run, stats: await this.repo.runStats(organizationId, run.id) })));
  }

  async getRun(organizationId: string, runId: string) {
    const run = await this.repo.findRunById(organizationId, runId);
    if (!run) return null;
    return { ...run, stats: await this.repo.runStats(organizationId, runId) };
  }

  async previewRun(organizationId: string, campaignId: string, input: CampaignRunInput) {
    const campaign = await this.repo.findById(organizationId, campaignId);
    if (!campaign) throw new NotFoundError('Campaign', campaignId);
    this.validateRunChannels(campaign.steps, input.selectedChannels);
    const audience = await this.repo.resolveRunAudience(organizationId, input.audience);
    const reachable: Record<string, number> = Object.fromEntries(input.selectedChannels.map((channel) => [channel, 0]));
    const eligibleLeadIds: string[] = [];
    const details: RunPreviewLeadDetail[] = [];
    const exclusionSummary: Record<string, number> = {};

    for (const lead of audience) {
      const reachableChannels: string[] = [];
      const previewContacts: RunPreviewLeadDetail['contacts'] = [];
      const excludedReasons = new Set<string>();

      for (const channel of input.selectedChannels) {
        const channelContacts = await this.repo.contactsForLeadChannel(organizationId, lead.id, channel);
        if (channelContacts.length === 0) {
          excludedReasons.add(`no_${channel.toLowerCase()}_contact`);
          continue;
        }
        const usableContact = channelContacts.find((contact) => contact.validationStatus !== 'INVALID');
        if (!usableContact) {
          excludedReasons.add(`invalid_${channel.toLowerCase()}_contact`);
          continue;
        }
        const allowed = await this.consent.canContact(organizationId, lead.id, channel, {
          timezone: input.timezone,
          scheduleWindow: input.scheduleWindow,
        });
        if (!allowed.allowed) {
          excludedReasons.add(allowed.reason);
          continue;
        }
        reachable[channel] = (reachable[channel] ?? 0) + 1;
        reachableChannels.push(channel);
        previewContacts.push({
          requestedChannel: channel,
          contactChannel: usableContact.channel,
          value: usableContact.value,
          normalizedValue: usableContact.normalizedValue,
          validationStatus: usableContact.validationStatus,
        });
      }

      const eligible = reachableChannels.length > 0;
      if (eligible) eligibleLeadIds.push(lead.id);
      else {
        for (const reason of excludedReasons) {
          exclusionSummary[reason] = (exclusionSummary[reason] ?? 0) + 1;
        }
      }
      details.push({
        leadId: lead.id,
        name: lead.name,
        company: lead.company,
        status: lead.status,
        eligible,
        reachableChannels,
        contacts: previewContacts,
        excludedReasons: [...excludedReasons],
      });
    }
    return {
      total: audience.length,
      eligible: eligibleLeadIds.length,
      excluded: audience.length - eligibleLeadIds.length,
      reachable,
      eligibleLeadIds,
      exclusionSummary,
      details,
    };
  }

  async createRun(organizationId: string, campaignId: string, userId: string, input: CampaignRunInput) {
    const campaign = await this.repo.findById(organizationId, campaignId);
    if (!campaign) throw new NotFoundError('Campaign', campaignId);
    this.validateRunChannels(campaign.steps, input.selectedChannels);
    const preview = await this.previewRun(organizationId, campaignId, input);
    if (preview.eligible === 0) throw new ConflictError('No eligible leads for the selected audience and channels');
    const firstStep = campaign.steps.find((step) => input.selectedChannels.includes(step.channel as 'EMAIL' | 'SMS' | 'WHATSAPP'))!;
    const now = new Date();
    const scheduledAt = input.scheduledAt ?? now;
    const status = scheduledAt.getTime() > now.getTime() ? 'SCHEDULED' : 'RUNNING';
    const firstActionAt = new Date(Math.max(scheduledAt.getTime(), now.getTime()) + firstStep.delayMinutes * 60_000);
    return this.repo.createRun(
      organizationId,
      campaignId,
      userId,
      input,
      preview.eligibleLeadIds,
      firstStep.id,
      firstActionAt,
      status,
      preview.total,
    );
  }

  async controlRun(organizationId: string, runId: string, action: 'pause' | 'resume' | 'cancel') {
    const run = await this.repo.findRunById(organizationId, runId);
    if (!run) throw new NotFoundError('Campaign run', runId);
    const allowed: Record<typeof action, string[]> = {
      pause: ['RUNNING', 'SCHEDULED'],
      resume: ['PAUSED'],
      cancel: ['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED'],
    };
    if (!allowed[action].includes(run.status)) throw new ConflictError(`Cannot ${action} a ${run.status.toLowerCase()} run`);
    return this.repo.controlRun(organizationId, runId, action === 'pause' ? 'PAUSED' : action === 'resume' ? 'RUNNING' : 'CANCELLED');
  }

  async launch(organizationId: string, id: string) {
    const campaign = await this.repo.findById(organizationId, id);
    if (!campaign) throw new NotFoundError('Campaign', id);
    this.stateMachine.assertTransition(campaign.status, 'RUNNING');
    if (campaign.steps.length === 0) throw new ValidationError('Campaign must have at least one step');
    const firstStep = campaign.steps[0]!;
    const audience = await this.repo.resolveAudience(organizationId, campaign.audience as { leadIds?: string[]; tags?: string[] });
    const eligibleLeadIds: string[] = [];

    for (const lead of audience) {
      const contacts = await this.repo.contactsForLead(organizationId, lead.id, [firstStep.channel]);
      if (!contacts.some((contact) => contact.validationStatus !== 'INVALID')) continue;
      const allowed = await this.consent.canContact(organizationId, lead.id, firstStep.channel, {
        timezone: campaign.timezone,
        scheduleWindow: campaign.scheduleWindow as { startHour: number; endHour: number },
      });
      if (!allowed.allowed) continue;
      eligibleLeadIds.push(lead.id);
    }

    if (eligibleLeadIds.length === 0) {
      throw new ConflictError('No eligible leads for this campaign');
    }

    const nextActionAt = new Date(Date.now() + firstStep.delayMinutes * 60_000);
    return this.repo.launch(organizationId, id, eligibleLeadIds, firstStep.id, nextActionAt);
  }

  async control(organizationId: string, id: string, action: 'pause' | 'resume' | 'cancel') {
    const campaign = await this.repo.findById(organizationId, id);
    if (!campaign) throw new NotFoundError('Campaign', id);
    const status = action === 'pause' ? 'PAUSED' : action === 'resume' ? 'RUNNING' : 'CANCELLED';
    this.stateMachine.assertTransition(campaign.status, status);
    return this.repo.updateStatus(organizationId, id, status);
  }

  private validateSteps(steps: CreateCampaignInput['steps']) {
    const positions = new Set<number>();
    for (const step of steps) {
      if (positions.has(step.position)) throw new ValidationError('Campaign step positions must be unique');
      positions.add(step.position);
      for (const condition of step.conditions as CampaignCondition[]) {
        if (!condition.if || condition.in.length === 0) {
          throw new ValidationError('Invalid campaign condition');
        }
      }
    }
  }

  private validateRunChannels(steps: Array<{ channel: string }>, selectedChannels: string[]) {
    const available = new Set(steps.map((step) => step.channel));
    const unavailable = selectedChannels.filter((channel) => !available.has(channel));
    if (unavailable.length > 0) throw new ValidationError(`Campaign has no steps for: ${unavailable.join(', ')}`);
  }
}
