import { describe, expect, it } from 'vitest';
import { MockSTTProvider, MockTTSProvider } from './providers.js';

describe('voice provider mocks', () => {
  it('transcribes UTF-8 test audio chunks', async () => {
    await expect(new MockSTTProvider().transcribe(Buffer.from('hello'))).resolves.toBe('hello');
  });

  it('synthesizes text into a buffer', async () => {
    const audio = await new MockTTSProvider().synthesize('hello');
    expect(Buffer.isBuffer(audio)).toBe(true);
    expect(audio.toString('utf8')).toBe('hello');
  });
});
