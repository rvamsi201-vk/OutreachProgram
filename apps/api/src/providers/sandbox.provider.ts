import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { MessagingProvider, NormalizedEvent, SendInput, SendResult } from './messaging-provider.js';

export class SandboxMessagingProvider implements MessagingProvider {
  constructor(
    private readonly channel: 'EMAIL' | 'SMS' | 'WHATSAPP',
    private readonly credentials: Record<string, string>,
  ) {}

  async send(_input: SendInput): Promise<SendResult> {
    return {
      providerMessageId: `sandbox_${this.channel.toLowerCase()}_${randomUUID()}`,
      status: 'SENT',
      metadata: { provider: 'sandbox' },
    };
  }

  verifyWebhook(req: FastifyRequest, rawBody: unknown) {
    const secret = this.credentials.webhookSecret;
    if (!secret) return true;
    const signature = req.headers['x-sandbox-signature'];
    if (typeof signature !== 'string') return false;
    const expected = createHmac('sha256', secret)
      .update(JSON.stringify(rawBody ?? {}))
      .digest('hex');
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  normalize(payload: unknown): NormalizedEvent[] {
    const body = payload as Record<string, unknown>;
    const eventId = typeof body.eventId === 'string' ? body.eventId : randomUUID();
    return [{
      providerEventId: eventId,
      eventType: typeof body.eventType === 'string' ? body.eventType : 'message.received',
      channel: this.channel,
      direction: body.direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
      from: typeof body.from === 'string' ? body.from : undefined,
      to: typeof body.to === 'string' ? body.to : undefined,
      content: typeof body.content === 'string' ? body.content : undefined,
      providerMessageId: typeof body.providerMessageId === 'string' ? body.providerMessageId : undefined,
      metadata: { rawType: body.eventType },
    }];
  }
}
