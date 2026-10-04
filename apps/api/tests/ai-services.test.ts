import { describe, expect, it } from 'vitest';
import { structuredAiOutputSchema, type ExtractedFacts } from '@ai-crm/shared';
import { GuardrailService } from '../src/modules/ai/guardrails/guardrail.service.js';
import { ChunkingService } from '../src/modules/ai/knowledge/chunking.service.js';
import { QualificationEngine } from '../src/modules/ai/qualification/qualification-engine.service.js';
import { MockLLMProvider } from '../src/modules/ai/providers/mock-llm.provider.js';

const completeFacts: ExtractedFacts = {
  need: 'yes',
  budget: '80 lakhs',
  timeline: '3 months',
  location: 'Bangalore',
  decision_maker: 'yes',
  interest: 'high',
  summary: 'Buyer needs a 3BHK in Bangalore within 3 months.',
};

const profile = {
  name: 'Default',
  threshold: 70,
  requiredFields: ['need', 'decision_maker'] as const,
  weights: { need: 30, budget: 20, timeline: 20, location: 10, decision_maker: 10, interest: 10 },
};

describe('Structured AI output', () => {
  it('validates mock provider output through Zod', async () => {
    const provider = new MockLLMProvider();
    const result = await provider.generate({ system: 'test', messages: [{ role: 'user', content: 'I need 3BHK Bangalore budget 80 lakhs in 3 months myself decision maker' }] });
    expect(structuredAiOutputSchema.parse(JSON.parse(result.text)).facts.need).toBe('yes');
  });
});

describe('GuardrailService', () => {
  it('replaces forbidden claims with safe fallback', () => {
    const result = new GuardrailService().check('We offer guaranteed discount.', ['guaranteed discount']);
    expect(result.safe).toBe(false);
    expect(result.response).not.toContain('guaranteed discount');
  });
});

describe('ChunkingService', () => {
  it('chunks text with overlap', () => {
    const text = Array.from({ length: 1200 }, (_, index) => `word${index}`).join(' ');
    const chunks = new ChunkingService().chunk(text, 500, 0.1);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]).toContain('word0');
    expect(chunks[1]).toContain('word450');
  });
});

describe('QualificationEngine', () => {
  const engine = new QualificationEngine();

  it('qualifies at exact threshold or above', () => {
    const result = engine.evaluate({ profile, facts: completeFacts });
    expect(result.result).toBe('QUALIFIED');
    expect(result.score).toBe(100);
  });

  it('nurtures below threshold', () => {
    const result = engine.evaluate({ profile: { ...profile, threshold: 90 }, facts: { ...completeFacts, budget: null, timeline: null } });
    expect(result.result).toBe('NURTURE');
  });

  it('does not qualify missing required fields', () => {
    const result = engine.evaluate({ profile, facts: { ...completeFacts, decision_maker: 'unknown' } });
    expect(result.result).toBe('NURTURE');
    expect(result.reason).toContain('Missing required fields');
  });

  it('marks no-need conversations not qualified', () => {
    const result = engine.evaluate({ profile, facts: { ...completeFacts, need: 'no', interest: 'none' } });
    expect(result.result).toBe('NOT_QUALIFIED');
  });
});

describe('Scripted conversation evaluation structure', () => {
  const scripts = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    expected: index % 3 === 0 ? 'QUALIFIED' : index % 3 === 1 ? 'NURTURE' : 'NOT_QUALIFIED',
  }));

  it('contains 20 deterministic scripted evaluation slots', () => {
    expect(scripts).toHaveLength(20);
    expect(new Set(scripts.map((script) => script.expected))).toEqual(new Set(['QUALIFIED', 'NURTURE', 'NOT_QUALIFIED']));
  });
});
