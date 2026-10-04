export interface LLMInput {
  system: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  responseSchema?: string;
}

export interface LLMOutput {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMProvider {
  generate(input: LLMInput): Promise<LLMOutput>;
  embed(texts: string[]): Promise<number[][]>;
}
