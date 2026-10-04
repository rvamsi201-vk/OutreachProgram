import type { FastifyRequest } from 'fastify';
import { baileysManager } from '../services/whatsapp/baileys-manager.service.js';
import type { MessagingProvider, SendInput, SendResult } from './messaging-provider.js';

export class BaileysMessagingProvider implements MessagingProvider {
  constructor(private readonly accountId: string) {}

  async send(input: SendInput): Promise<SendResult> {
    const providerMessageId = await baileysManager.sendText(input.organizationId, this.accountId, input.to, input.body);
    return { providerMessageId, status: 'SENT', metadata: { provider: 'baileys' } };
  }

  verifyWebhook(_req: FastifyRequest, _rawBody: unknown) { return false; }
  normalize(_payload: unknown) { return []; }
}
