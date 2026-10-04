import { NotFoundError } from '../../errors/index.js';
import { env } from '../../config/env.js';
import { CampaignRepository } from '../../repositories/campaign.repository.js';
import { ConversationRepository } from '../../repositories/conversation.repository.js';
import { LeadRepository } from '../../repositories/lead.repository.js';
import { ProviderFactory } from '../../providers/provider.factory.js';
import { EncryptionService } from '../security/encryption.service.js';

export class ConversationService {
  constructor(
    private readonly repo = new ConversationRepository(),
    private readonly leadRepo = new LeadRepository(),
    private readonly campaignRepo = new CampaignRepository(),
    private readonly providerFactory = new ProviderFactory(),
    private readonly encryption = new EncryptionService(env.ENCRYPTION_KEY),
  ) {}

  list(organizationId: string) {
    return this.repo.list(organizationId);
  }

  async getOrCreate(organizationId: string, leadId: string, channel: string) {
    const lead = await this.leadRepo.findById(organizationId, leadId);
    if (!lead) throw new NotFoundError('Lead', leadId);
    return this.repo.getOrCreate(organizationId, leadId, channel);
  }

  async messages(organizationId: string, conversationId: string) {
    const conversation = await this.repo.findById(organizationId, conversationId);
    if (!conversation) throw new NotFoundError('Conversation', conversationId);
    return this.repo.messages(organizationId, conversationId);
  }

  async humanReply(organizationId: string, conversationId: string, userId: string, content: string, metadata: Record<string, unknown>) {
    const conversation = await this.repo.findById(organizationId, conversationId);
    if (!conversation) throw new NotFoundError('Conversation', conversationId);
    const result = await this.sendThroughProvider(organizationId, conversation.leadId, conversation.channel, content, metadata);
    return this.repo.createMessage({
      organizationId,
      conversationId,
      leadId: conversation.leadId,
      direction: 'OUTBOUND',
      senderType: 'HUMAN',
      senderId: userId,
      content,
      providerMessageId: result.providerMessageId,
      metadata: { ...metadata, status: result.status, provider: result.metadata },
    });
  }

  private async sendThroughProvider(
    organizationId: string,
    leadId: string,
    channel: string,
    content: string,
    metadata: Record<string, unknown>,
  ) {
    if (channel === 'VOICE') throw new Error('Voice replies must be handled through a voice provider flow.');
    const contact = (await this.campaignRepo.contactsForLeadChannel(organizationId, leadId, channel))
      .find((item) => item.validationStatus !== 'INVALID');
    if (!contact) throw new Error(`No valid ${channel} contact found for this lead.`);
    const account = await this.campaignRepo.defaultAccount(organizationId, channel);
    if (!account && channel === 'WHATSAPP') {
      throw new Error('No default WhatsApp account is configured. Connect Baileys in Settings first.');
    }
    const provider = this.providerFactory.create({
      channel,
      provider: account?.provider ?? 'sandbox',
      configuration: account?.configuration as Record<string, unknown> ?? {},
      credentials: account ? this.encryption.decryptJson(account.encryptedCredentials) : {},
      accountId: account?.id,
    });
    return provider.send({
      organizationId,
      leadId,
      channel: channel as 'EMAIL' | 'SMS' | 'WHATSAPP',
      to: contact.normalizedValue,
      body: content,
      metadata: { ...metadata, manualReply: true },
    });
  }
}
