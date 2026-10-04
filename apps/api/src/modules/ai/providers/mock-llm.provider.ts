import type { LLMInput, LLMOutput, LLMProvider } from './llm-provider.js';

function hashEmbedding(text: string) {
  const values = new Array<number>(1536).fill(0);
  for (let i = 0; i < text.length; i += 1) {
    values[i % values.length]! += text.charCodeAt(i) / 255;
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => Number((value / norm).toFixed(6)));
}

export class MockLLMProvider implements LLMProvider {
  async generate(input: LLMInput): Promise<LLMOutput> {
    const latest = input.messages.at(-1)?.content.toLowerCase() ?? '';
    const facts = {
      need: latest.includes('need') || latest.includes('bhk') ? 'yes' : latest.includes('not interested') ? 'no' : 'unknown',
      budget: latest.match(/(\d+\s*(lakhs?|l|crores?|cr))/i)?.[0] ?? null,
      timeline: latest.match(/(\d+\s*(months?|weeks?|days?))/i)?.[0] ?? null,
      location: latest.includes('bangalore') ? 'Bangalore' : null,
      decision_maker: latest.includes('decision') || latest.includes('myself') ? 'yes' : 'unknown',
      interest: latest.includes('not interested') ? 'none' : latest.includes('urgent') ? 'high' : 'medium',
      summary: latest.slice(0, 300) || 'No new information.',
    };
    return {
      model: 'mock-llm',
      text: JSON.stringify({
        response: facts.need === 'no' ? 'Thanks for letting us know. We will not continue this conversation.' : 'Thanks, I have noted that. Our team can help with the next step.',
        facts,
        tools: facts.need === 'no' ? [{ name: 'mark_not_interested', arguments: {} }] : [{ name: 'update_lead_facts', arguments: { facts } }],
        unknownQuestion: latest.includes('?') && latest.includes('price') && !latest.includes('budget'),
      }),
      inputTokens: input.system.length + input.messages.reduce((sum, message) => sum + message.content.length, 0),
      outputTokens: 120,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(hashEmbedding);
  }
}
