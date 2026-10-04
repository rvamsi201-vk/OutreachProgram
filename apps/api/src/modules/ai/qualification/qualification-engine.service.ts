import type { ExtractedFacts, QualificationProfileInput } from '@ai-crm/shared';

export interface QualificationResult {
  score: number;
  result: 'QUALIFIED' | 'NURTURE' | 'NOT_QUALIFIED';
  reason: string;
}

const positive: Record<string, string[]> = {
  need: ['yes'],
  budget: [],
  timeline: [],
  location: [],
  decision_maker: ['yes'],
  interest: ['high', 'medium'],
};

function present(field: keyof ExtractedFacts, facts: ExtractedFacts) {
  const value = facts[field];
  if (value === null || value === 'unknown' || value === 'none' || value === 'no') return false;
  return String(value).trim().length > 0;
}

export class QualificationEngine {
  evaluate(input: { profile: QualificationProfileInput; facts: ExtractedFacts }): QualificationResult {
    const { profile, facts } = input;
    const missing = profile.requiredFields.filter((field) => !present(field, facts));
    if (facts.need === 'no' || facts.interest === 'none') {
      return { score: 0, result: 'NOT_QUALIFIED', reason: 'No requirement or no interest' };
    }

    let score = 0;
    for (const [field, weight] of Object.entries(profile.weights) as Array<[keyof ExtractedFacts, number]>) {
      const value = facts[field];
      if (positive[field]?.includes(String(value)) || (positive[field]?.length === 0 && present(field, facts))) {
        score += weight;
      }
    }

    if (missing.length > 0) {
      return { score, result: 'NURTURE', reason: `Missing required fields: ${missing.join(', ')}` };
    }
    if (score >= profile.threshold) {
      return { score, result: 'QUALIFIED', reason: `Score ${score} meets threshold ${profile.threshold}` };
    }
    return { score, result: 'NURTURE', reason: `Score ${score} below threshold ${profile.threshold}` };
  }
}
