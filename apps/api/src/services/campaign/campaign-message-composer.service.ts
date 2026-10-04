import { LLMProviderFactory } from '../../modules/ai/providers/llm-provider.factory.js';
import { AiRepository } from '../../repositories/ai.repository.js';
import { GuardrailService } from '../../modules/ai/guardrails/guardrail.service.js';

interface ComposeInput {
  organizationId: string;
  lead: Record<string, unknown>;
  channel: string;
  fallbackBody: string;
  campaignName: string;
  campaignDescription?: string | null;
  agentId?: string | null;
  stepConfiguration?: Record<string, unknown>;
}

interface ComposeResult {
  body: string;
  aiGenerated: boolean;
  model?: string;
  error?: string;
}

function enabled(configuration?: Record<string, unknown>) {
  return configuration?.aiPersonalize === true;
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanMessage(text: string) {
  return text
    .replace(/^["']|["']$/g, '')
    .replace(/\s+\n/g, '\n')
    .trim();
}

export class CampaignMessageComposer {
  constructor(
    private readonly llmFactory = new LLMProviderFactory(),
    private readonly aiRepo = new AiRepository(),
    private readonly guardrails = new GuardrailService(),
  ) {}

  async compose(input: ComposeInput): Promise<ComposeResult> {
    if (!enabled(input.stepConfiguration)) {
      return { body: input.fallbackBody, aiGenerated: false };
    }
    const started = Date.now();
    const leadId = typeof input.lead.id === 'string' ? input.lead.id : undefined;

    try {
      const llm = this.llmFactory.createFromEnv();
      const [agent, agentConfig] = input.agentId
        ? await Promise.all([
          this.aiRepo.findAgent(input.organizationId, input.agentId),
          this.aiRepo.latestAgentConfig(input.organizationId, input.agentId),
        ])
        : [null, null] as const;
      const knowledge = await this.aiRepo.knowledgeContext(input.organizationId, agent?.knowledgeBaseId ?? null);
      const output = await llm.generate({
        system: [
          agentConfig?.systemPrompt ?? '',
          knowledge ? `Knowledge:\n${knowledge}` : '',
          'Write a first outreach message for a sales conversation.',
          'The message must feel written for this exact lead, using their business summary and the available sales pitch.',
          'Keep it concise, natural, and suitable for WhatsApp or SMS.',
          'Ask one simple question that invites the client to start the conversation.',
          'Do not invent facts, promises, pricing, meetings, or names that are not provided.',
          'Return only the final message text. No markdown, labels, JSON, or placeholders.',
        ].join(' '),
        messages: [{
          role: 'user',
          content: JSON.stringify({
            channel: input.channel,
            campaign: {
              name: input.campaignName,
              description: input.campaignDescription,
              objective: textValue(input.stepConfiguration?.aiObjective),
            },
            lead: {
              name: input.lead.name,
              company: input.lead.company,
              pitch: input.lead.pitch,
              info: input.lead.info,
              comments: input.lead.comments,
              source: input.lead.source,
              location: input.lead.location,
              businessSize: input.lead.businessSize,
              website: input.lead.website,
              ratings: input.lead.ratings,
              priority: input.lead.priority,
            },
            fallbackTemplate: input.fallbackBody,
          }),
        }],
      });
      const body = cleanMessage(output.text);
      if (!body) return { body: input.fallbackBody, aiGenerated: false, error: 'AI returned empty message' };
      const guarded = this.guardrails.check(body, agent?.forbiddenClaims as string[] ?? []);
      await this.aiRepo.createRun({
        organizationId: input.organizationId,
        leadId,
        agentId: input.agentId ?? undefined,
        model: output.model,
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
        latencyMs: Date.now() - started,
        status: guarded.violation ? 'GUARDRAIL_FALLBACK' : 'OK',
        guardrailViolation: guarded.violation,
        metadata: {
          feature: 'campaign_outreach_message',
          channel: input.channel,
          campaignName: input.campaignName,
        },
      });
      return {
        body: guarded.response,
        aiGenerated: true,
        model: output.model,
        error: guarded.violation ? `Guardrail fallback: ${guarded.violation}` : undefined,
      };
    } catch (error) {
      await this.aiRepo.createRun({
        organizationId: input.organizationId,
        leadId,
        agentId: input.agentId ?? undefined,
        model: 'unknown',
        latencyMs: Date.now() - started,
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          feature: 'campaign_outreach_message',
          channel: input.channel,
          campaignName: input.campaignName,
        },
      });
      return {
        body: input.fallbackBody,
        aiGenerated: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
