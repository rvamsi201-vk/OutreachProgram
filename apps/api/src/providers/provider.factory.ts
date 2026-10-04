import type { MessagingProvider } from './messaging-provider.js';
import { SandboxMessagingProvider } from './sandbox.provider.js';
import { BaileysMessagingProvider } from './baileys.provider.js';

export class ProviderFactory {
  create(input: {
    channel: string;
    provider: string;
    credentials: Record<string, string>;
    configuration: Record<string, unknown>;
    accountId?: string;
  }): MessagingProvider {
    const channel = input.channel as 'EMAIL' | 'SMS' | 'WHATSAPP';
    if (channel === 'WHATSAPP' && input.provider.toLowerCase() === 'baileys') {
      if (!input.accountId) throw new Error('Baileys channel account ID is required');
      return new BaileysMessagingProvider(input.accountId);
    }
    return new SandboxMessagingProvider(channel, input.credentials);
  }
}
