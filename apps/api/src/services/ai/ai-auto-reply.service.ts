import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/connection.js';
import { campaignEnrollments, campaigns } from '../../db/schema/index.js';
import { CampaignRepository } from '../../repositories/campaign.repository.js';
import { ConversationRepository } from '../../repositories/conversation.repository.js';
import { ConversationEngine } from '../../modules/ai/conversation/conversation-engine.service.js';
import { EncryptionService } from '../security/encryption.service.js';

interface AutoReplyInput {
  organizationId: string;
  leadId: string;
  conversationId: string;
  channel: 'SMS' | 'WHATSAPP';
  to: string;
  message: string;
  sendReply?: (body: string, metadata: Record<string, unknown>) => Promise<{ providerMessageId: string; status: string }>;
}

export class AiAutoReplyService {
  constructor(
    private readonly campaignRepo = new CampaignRepository(),
    private readonly conversations = new ConversationRepository(),
    private readonly encryption = new EncryptionService(env.ENCRYPTION_KEY),
    private readonly engine = new ConversationEngine(),
  ) {}

  async maybeReply(input: AutoReplyInput) {
    const context = await this.activeAiCampaign(input.organizationId, input.leadId);
    if (!context?.agentId) return null;

    const ai = await this.engine.respond({
      organizationId: input.organizationId,
      leadId: input.leadId,
      conversationId: input.conversationId,
      agentId: context.agentId,
      qualificationProfileId: context.qualificationProfileId,
      message: input.message,
    });
    if (!ai.response.trim()) return null;

    const metadata = { aiAutoReply: true, campaignId: context.campaignId };
    const result = input.sendReply
      ? await input.sendReply(ai.response, metadata)
      : await this.sendWithDefaultAccount(input, ai.response, metadata);
    if (!result) return null;
    const message = await this.conversations.createMessage({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      leadId: input.leadId,
      direction: 'OUTBOUND',
      senderType: 'AI',
      content: ai.response,
      providerMessageId: result.providerMessageId,
      metadata: {
        aiAutoReply: true,
        campaignId: context.campaignId,
        status: result.status,
      },
    });
    return message;
  }

  private async sendWithDefaultAccount(input: AutoReplyInput, body: string, metadata: Record<string, unknown>) {
    const account = await this.campaignRepo.defaultAccount(input.organizationId, input.channel);
    if (!account) return null;
    const { ProviderFactory } = await import('../../providers/provider.factory.js');
    const provider = new ProviderFactory().create({
      channel: input.channel,
      provider: account.provider,
      configuration: account.configuration as Record<string, unknown>,
      credentials: this.encryption.decryptJson(account.encryptedCredentials),
      accountId: account.id,
    });
    return provider.send({
      organizationId: input.organizationId,
      leadId: input.leadId,
      channel: input.channel,
      to: input.to,
      body,
      metadata,
    });
  }

  private async activeAiCampaign(organizationId: string, leadId: string) {
    const [row] = await db
      .select({
        campaignId: campaigns.id,
        agentId: campaigns.aiAgentId,
        qualificationProfileId: campaigns.qualificationProfileId,
      })
      .from(campaignEnrollments)
      .innerJoin(campaigns, eq(campaigns.id, campaignEnrollments.campaignId))
      .where(and(
        eq(campaignEnrollments.organizationId, organizationId),
        eq(campaignEnrollments.leadId, leadId),
        inArray(campaignEnrollments.status, ['ACTIVE', 'COMPLETED']),
        isNotNull(campaigns.aiAgentId),
      ))
      .orderBy(desc(campaignEnrollments.updatedAt))
      .limit(1);
    return row ?? null;
  }
}
