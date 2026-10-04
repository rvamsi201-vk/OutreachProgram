import { describe, expect, it } from 'vitest';
import { ConditionEvaluator } from '../src/services/campaign/condition-evaluator.service.js';
import { CampaignStateMachine } from '../src/services/campaign/state-machine.service.js';
import { EncryptionService } from '../src/services/security/encryption.service.js';

describe('CampaignStateMachine', () => {
  const machine = new CampaignStateMachine();

  it('allows valid launch and pause transitions', () => {
    expect(machine.transition('DRAFT', 'RUNNING')).toBe('RUNNING');
    expect(machine.transition('RUNNING', 'PAUSED')).toBe('PAUSED');
  });

  it('rejects invalid transitions', () => {
    expect(() => machine.transition('COMPLETED', 'RUNNING')).toThrow('Invalid campaign status transition');
  });
});

describe('ConditionEvaluator', () => {
  const evaluator = new ConditionEvaluator();

  it('evaluates deterministic JSON path membership', () => {
    expect(evaluator.evaluate({ if: 'previous.outcome', in: ['NO_ANSWER'] }, { previous: { outcome: 'NO_ANSWER' } })).toBe(true);
    expect(evaluator.evaluate({ if: 'previous.outcome', in: ['NO_ANSWER'] }, { previous: { outcome: 'REPLIED' } })).toBe(false);
  });

  it('requires all conditions to match', () => {
    expect(evaluator.evaluateAll([
      { if: 'previous.outcome', in: ['SENT'] },
      { if: 'lead.status', in: ['NEW'] },
    ], { previous: { outcome: 'SENT' }, lead: { status: 'NEW' } })).toBe(true);
  });
});

describe('EncryptionService', () => {
  it('encrypts and decrypts credentials with AES-GCM', () => {
    const service = new EncryptionService('x'.repeat(32));
    const encrypted = service.encryptJson({ apiKey: 'secret-key' });
    expect(encrypted).not.toContain('secret-key');
    expect(service.decryptJson(encrypted)).toEqual({ apiKey: 'secret-key' });
  });

  it('encrypts structured WhatsApp session state without leaking key material', () => {
    const service = new EncryptionService('x'.repeat(32));
    const state = { payload: JSON.stringify({ creds: { noiseKey: 'private-key' }, keys: { session: { lead: 'signal-key' } } }) };
    const encrypted = service.encryptJson(state);
    expect(encrypted).not.toContain('private-key');
    expect(service.decryptJson<typeof state>(encrypted)).toEqual(state);
  });
});
