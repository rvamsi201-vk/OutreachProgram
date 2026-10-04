import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { NormalizedEvent } from './messaging-provider.js';
import type { CallInput, CallRef, RecordingRef, VoiceProvider } from './voice-provider.js';

export class MockVoiceProvider implements VoiceProvider {
  async createCall(_input: CallInput): Promise<CallRef> {
    return { providerCallId: `mock_call_${randomUUID()}`, status: 'QUEUED' };
  }

  async hangup(_id: string): Promise<void> {}

  async getRecording(id: string): Promise<RecordingRef> {
    return { url: `mock://recordings/${id}`, transcript: '' };
  }

  verifyWebhook(_req: FastifyRequest): boolean {
    return true;
  }

  normalize(payload: unknown): NormalizedEvent[] {
    const body = payload as Record<string, unknown>;
    return [{
      providerEventId: typeof body.eventId === 'string' ? body.eventId : randomUUID(),
      eventType: typeof body.status === 'string' ? `call.${body.status}` : 'call.status',
      channel: 'VOICE',
      metadata: body,
    } as NormalizedEvent];
  }
}
