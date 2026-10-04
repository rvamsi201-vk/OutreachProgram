import { env } from '../../../config/env.js';
import type { LLMProvider } from './llm-provider.js';
import { MockLLMProvider } from './mock-llm.provider.js';
import { OpenAICompatibleLLMProvider } from './openai-compatible-llm.provider.js';

interface LLMProviderFactoryInput {
  provider?: string;
  configuration?: Record<string, unknown>;
  credentials?: Record<string, string>;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export class LLMProviderFactory {
  createFromEnv(): LLMProvider {
    if (env.LLM_PROVIDER === 'openai' || env.LLM_PROVIDER === 'openai-compatible') {
      if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER is openai');
      return new OpenAICompatibleLLMProvider({
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.LLM_BASE_URL,
        chatModel: env.LLM_CHAT_MODEL,
        embeddingModel: env.LLM_EMBEDDING_MODEL,
      });
    }
    return new MockLLMProvider();
  }

  create(input?: LLMProviderFactoryInput): LLMProvider {
    const provider = input?.provider?.toLowerCase();
    if (input && (provider === 'openai' || provider === 'openai-compatible')) {
      const configuration = input.configuration ?? {};
      const credentials = input.credentials ?? {};
      const apiKey = credentials.apiKey ?? credentials.OPENAI_API_KEY;
      if (!apiKey) throw new Error('AI integration is missing apiKey');
      return new OpenAICompatibleLLMProvider({
        apiKey,
        baseUrl: stringValue(configuration.baseUrl ?? credentials.baseUrl),
        chatModel: stringValue(configuration.model ?? configuration.chatModel ?? credentials.model),
        embeddingModel: stringValue(configuration.embeddingModel ?? credentials.embeddingModel),
      });
    }
    return new MockLLMProvider();
  }
}
