import type { FastifyRequest } from 'fastify';

export interface SendInput {
  organizationId: string;
  leadId: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'VOICE';
  to: string;
  subject?: string | null;
  body: string;
  templateName?: string;
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  providerMessageId: string;
  status: 'SENT' | 'QUEUED' | 'REJECTED' | 'FAILED';
  metadata?: Record<string, unknown>;
}

export interface NormalizedEvent {
  providerEventId: string;
  eventType: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'VOICE';
  direction?: 'INBOUND' | 'OUTBOUND';
  from?: string;
  to?: string;
  content?: string;
  providerMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface MessagingProvider {
  send(input: SendInput): Promise<SendResult>;
  verifyWebhook(req: FastifyRequest, rawBody: unknown): boolean;
  normalize(payload: unknown): NormalizedEvent[];
}
