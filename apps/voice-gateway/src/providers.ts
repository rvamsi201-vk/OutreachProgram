export interface STTProvider {
  transcribe(chunk: Buffer): Promise<string | null>;
}

export interface TTSProvider {
  synthesize(text: string): Promise<Buffer>;
}

export class MockSTTProvider implements STTProvider {
  async transcribe(chunk: Buffer): Promise<string | null> {
    const text = chunk.toString('utf8').trim();
    return text.length ? text : null;
  }
}

export class MockTTSProvider implements TTSProvider {
  async synthesize(text: string): Promise<Buffer> {
    return Buffer.from(text, 'utf8');
  }
}
