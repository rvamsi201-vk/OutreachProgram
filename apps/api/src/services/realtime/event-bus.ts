import { EventEmitter } from 'node:events';

export interface RealtimeEvent {
  organizationId: string;
  type: string;
  payload: Record<string, unknown>;
}

export const realtimeEvents = new EventEmitter();

export function publishRealtime(event: RealtimeEvent) {
  realtimeEvents.emit('event', event);
}
