import type { FastifyRequest } from 'fastify';
import type { NormalizedEvent } from './messaging-provider.js';

export interface CallInput {
  organizationId: string;
  leadId: string;
  to: string;
  disclosure: string;
  websocketUrl: string;
}

export interface CallRef {
  providerCallId: string;
  status: 'QUEUED' | 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'VOICEMAIL' | 'WRONG_NUMBER' | 'FAILED';
}

export interface RecordingRef {
  url: string;
  transcript?: string;
}

export interface VoiceProvider {
  createCall(input: CallInput): Promise<CallRef>;
  hangup(id: string): Promise<void>;
  getRecording(id: string): Promise<RecordingRef>;
  verifyWebhook(req: FastifyRequest): boolean;
  normalize(payload: unknown): NormalizedEvent[];
}
