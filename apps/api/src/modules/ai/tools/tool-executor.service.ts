import type { AiToolRequest, ExtractedFacts } from '@ai-crm/shared';
import { LeadRepository } from '../../../repositories/lead.repository.js';
import { AiRepository } from '../../../repositories/ai.repository.js';

export class ToolExecutor {
  constructor(
    private readonly leadRepo = new LeadRepository(),
    private readonly aiRepo = new AiRepository(),
  ) {}

  async execute(input: {
    organizationId: string;
    leadId: string;
    tool: AiToolRequest;
    currentFacts: Record<string, unknown>;
    currentSummary: string;
  }) {
    const { organizationId, leadId, tool } = input;
    if (tool.name === 'update_lead_facts') {
      const args = tool.arguments as { facts?: Partial<ExtractedFacts> };
      const facts = { ...input.currentFacts, ...(args.facts ?? {}) };
      await this.aiRepo.upsertMemory(organizationId, leadId, facts, input.currentSummary);
      return { executed: true };
    }
    if (tool.name === 'mark_not_interested') {
      await this.leadRepo.updateBase(organizationId, leadId, { status: 'NOT_QUALIFIED' });
      return { executed: true };
    }
    if (tool.name === 'mark_wrong_number') {
      await this.leadRepo.updateBase(organizationId, leadId, { status: 'NOT_QUALIFIED' });
      return { executed: true };
    }
    if (tool.name === 'request_human' || tool.name === 'schedule_callback' || tool.name === 'end_conversation') {
      return { executed: true };
    }
    return { executed: false };
  }
}
