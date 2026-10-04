import { extractedFactsSchema, structuredAiOutputSchema, type QualificationProfileInput } from '@ai-crm/shared';
import { AiRepository } from '../../../repositories/ai.repository.js';
import { ConversationRepository } from '../../../repositories/conversation.repository.js';
import { LeadRepository } from '../../../repositories/lead.repository.js';
import { GuardrailService } from '../guardrails/guardrail.service.js';
import { QualificationEngine } from '../qualification/qualification-engine.service.js';
import { LLMProviderFactory } from '../providers/llm-provider.factory.js';
import { ToolExecutor } from '../tools/tool-executor.service.js';
import { HandoffService } from '../../../services/sales/handoff.service.js';

export class ConversationEngine {
  constructor(
    private readonly aiRepo = new AiRepository(),
    private readonly conversations = new ConversationRepository(),
    private readonly leadRepo = new LeadRepository(),
    private readonly llmFactory = new LLMProviderFactory(),
    private readonly guardrails = new GuardrailService(),
    private readonly tools = new ToolExecutor(),
    private readonly qualification = new QualificationEngine(),
    private readonly handoff = new HandoffService(),
  ) {}

  async respond(input: {
    organizationId: string;
    leadId: string;
    conversationId: string;
    agentId: string;
    qualificationProfileId?: string | null;
    message: string;
  }) {
    const started = Date.now();
    const [agent, agentConfig, lead, memory, recentMessages] = await Promise.all([
      this.aiRepo.findAgent(input.organizationId, input.agentId),
      this.aiRepo.latestAgentConfig(input.organizationId, input.agentId),
      this.leadRepo.findById(input.organizationId, input.leadId),
      this.aiRepo.getMemory(input.organizationId, input.leadId),
      this.conversations.messages(input.organizationId, input.conversationId),
    ]);
    if (!agent || !agentConfig || !lead) throw new Error('AI context not found');
    const llm = this.llmFactory.createFromEnv();
    const embedding = await llm.embed([input.message]);
    const knowledge = await this.aiRepo.knowledgeContext(input.organizationId, agent.knowledgeBaseId, embedding[0]!, 5);
    const context = [
      agentConfig.systemPrompt,
      `Lead: ${lead.name}, ${lead.company ?? 'no company'}`,
      `Memory summary: ${memory?.summary ?? ''}`,
      `Facts: ${JSON.stringify(memory?.facts ?? {})}`,
      `Knowledge:\n${knowledge || 'No relevant knowledge found.'}`,
      `Recent messages:\n${recentMessages.slice(-8).map((message) => `${message.senderType}: ${message.content}`).join('\n')}`,
    ].join('\n\n');

    try {
      const output = await llm.generate({
        system: context,
        messages: [{ role: 'user', content: input.message }],
        responseSchema: 'structuredAiOutput',
      });
      const parsed = structuredAiOutputSchema.parse(JSON.parse(output.text));
      const guarded = this.guardrails.check(parsed.response, agent.forbiddenClaims as string[]);
      const facts = extractedFactsSchema.parse(parsed.facts);
      const summary = facts.summary || memory?.summary || '';

      for (const tool of parsed.tools) {
        await this.tools.execute({
          organizationId: input.organizationId,
          leadId: input.leadId,
          tool,
          currentFacts: memory?.facts as Record<string, unknown> ?? {},
          currentSummary: summary,
        });
      }
      await this.aiRepo.upsertMemory(input.organizationId, input.leadId, { ...(memory?.facts as Record<string, unknown> ?? {}), ...facts }, summary);
      if (parsed.unknownQuestion) {
        await this.aiRepo.createUnknownQuestion({
          organizationId: input.organizationId,
          leadId: input.leadId,
          conversationId: input.conversationId,
          question: input.message,
        });
      }

      if (input.qualificationProfileId) {
        const profile = await this.aiRepo.findQualificationProfile(input.organizationId, input.qualificationProfileId);
        if (profile) {
          const result = this.qualification.evaluate({
            profile: {
              name: profile.name,
              threshold: profile.threshold,
              requiredFields: profile.requiredFields as QualificationProfileInput['requiredFields'],
              weights: profile.weights as QualificationProfileInput['weights'],
            },
            facts,
          });
          await this.aiRepo.createLeadQualification({
            organizationId: input.organizationId,
            leadId: input.leadId,
            profileId: profile.id,
            score: result.score,
            result: result.result,
            reason: result.reason,
            facts,
          });
          if (result.result === 'QUALIFIED') {
            await this.handoff.handoffQualifiedLead({
              organizationId: input.organizationId,
              leadId: input.leadId,
              leadName: lead.name,
              facts,
            });
          }
        }
      }

      await this.aiRepo.createRun({
        organizationId: input.organizationId,
        leadId: input.leadId,
        conversationId: input.conversationId,
        agentId: input.agentId,
        model: output.model,
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
        latencyMs: Date.now() - started,
        status: guarded.safe ? 'OK' : 'GUARDRAIL_FALLBACK',
        guardrailViolation: guarded.violation,
        metadata: { feature: 'conversation_auto_reply', unknownQuestion: parsed.unknownQuestion },
      });
      return { response: guarded.response, facts, unknownQuestion: parsed.unknownQuestion };
    } catch (error) {
      await this.aiRepo.createRun({
        organizationId: input.organizationId,
        leadId: input.leadId,
        conversationId: input.conversationId,
        agentId: input.agentId,
        model: 'unknown',
        latencyMs: Date.now() - started,
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        response: 'I am having trouble processing that. A team member can follow up.',
        facts: null,
        unknownQuestion: false,
      };
    }
  }

}
