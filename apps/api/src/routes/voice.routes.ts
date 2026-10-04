import type { FastifyInstance } from 'fastify';

export async function voiceInternalRoutes(app: FastifyInstance) {
  app.post('/internal/voice/respond', async (req) => {
    const body = req.body as { callId?: string; transcript?: string };
    return {
      callId: body.callId,
      response: body.transcript
        ? 'I heard you. Let me note that and continue.'
        : 'Thanks. Please go ahead.',
    };
  });
}
