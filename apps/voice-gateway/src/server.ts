import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { MockSTTProvider, MockTTSProvider } from './providers.js';

const app = Fastify({ logger: true });
const stt = new MockSTTProvider();
const tts = new MockTTSProvider();

await app.register(websocket);

app.get('/health', async () => ({ status: 'ok', service: 'voice-gateway' }));

app.get('/voice/ws', { websocket: true }, (socket, req) => {
  const startedAt = Date.now();
  let lastSpeechAt = Date.now();
  let speaking = false;
  const callId = (req.query as { callId?: string }).callId ?? 'unknown';

  const silenceTimer = setInterval(async () => {
    const silenceMs = Date.now() - lastSpeechAt;
    if (Date.now() - startedAt > config.MAX_CALL_MS || silenceMs > config.SILENCE_END_MS) {
      socket.send(JSON.stringify({ type: 'end', callId, reason: 'silence_or_max_length' }));
      socket.close();
      return;
    }
    if (silenceMs > config.SILENCE_PROMPT_MS && !speaking) {
      speaking = true;
      socket.send(await tts.synthesize('Are you still there?'));
      speaking = false;
      lastSpeechAt = Date.now();
    }
  }, 1000);

  socket.send(JSON.stringify({ type: 'disclosure', text: config.DISCLOSURE_TEXT }));

  socket.on('message', async (data: Buffer | ArrayBuffer | Buffer[]) => {
    if (speaking) {
      socket.send(JSON.stringify({ type: 'barge_in', action: 'stop_tts' }));
      speaking = false;
    }
    const audio = Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(new Uint8Array(data));
    const transcript = await stt.transcribe(audio);
    if (!transcript) return;
    lastSpeechAt = Date.now();
    const response = await fetch(`${config.API_URL}/internal/voice/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, transcript }),
    }).catch(() => null);
    const json = response?.ok ? await response.json() as { response?: string } : { response: 'Thanks. A team member can follow up.' };
    speaking = true;
    socket.send(await tts.synthesize(json.response ?? 'Thanks.'));
    speaking = false;
  });

  socket.on('close', () => clearInterval(silenceTimer));
});

app.listen({ port: config.VOICE_GATEWAY_PORT, host: '0.0.0.0' });
