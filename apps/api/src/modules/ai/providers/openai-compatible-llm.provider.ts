import type { LLMInput, LLMOutput, LLMProvider } from './llm-provider.js';

interface OpenAICompatibleOptions {
  apiKey: string;
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
}

export class OpenAICompatibleLLMProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.chatModel = options.chatModel ?? 'gpt-4o-mini';
    this.embeddingModel = options.embeddingModel ?? 'text-embedding-3-small';
  }

  async generate(input: LLMInput): Promise<LLMOutput> {
    const structuredJson = input.responseSchema === 'structuredAiOutput';
    const apiKey = this.options.apiKey.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY is empty. Set your OpenRouter/OpenAI key in .env and restart the API.');
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'AI Outreach CRM',
      },
      body: JSON.stringify({
        model: this.chatModel,
        temperature: 0.6,
        ...(structuredJson ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: structuredJson ? `${input.system}\n\nReturn a JSON object with keys response, facts, tools, and unknownQuestion. facts must include need, budget, timeline, location, decision_maker, interest, and summary.` : input.system },
          ...input.messages,
        ],
      }),
    });
    const payload = await response.json() as ChatCompletionResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `LLM request failed with ${response.status}`);
    }
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('LLM returned an empty response');
    return {
      text,
      model: payload.model ?? this.chatModel,
      inputTokens: payload.usage?.prompt_tokens,
      outputTokens: payload.usage?.completion_tokens,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (this.embeddingModel === 'local-hash') {
      return texts.map((text) => hashEmbedding(text));
    }
    const apiKey = this.options.apiKey.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY is empty. Set your OpenRouter/OpenAI key in .env and restart the API.');
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'AI Outreach CRM',
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: texts,
      }),
    });
    const payload = await response.json() as EmbeddingResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Embedding request failed with ${response.status}`);
    }
    return payload.data?.map((item) => item.embedding ?? []) ?? [];
  }
}

function hashEmbedding(text: string, dimensions = 1536) {
  const vector = new Array<number>(dimensions).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const word of words) {
    let hash = 2166136261;
    for (let index = 0; index < word.length; index += 1) {
      hash ^= word.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const position = Math.abs(hash) % dimensions;
    vector[position] = (vector[position] ?? 0) + (hash % 2 === 0 ? 1 : -1);
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}
