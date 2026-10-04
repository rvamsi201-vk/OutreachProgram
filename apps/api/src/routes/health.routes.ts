import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { redis } from '../db/redis.js';
import { sql } from 'drizzle-orm';

async function checkDependencies() {
  const dbStatus: 'connected' | 'disconnected' = await db.execute(sql`SELECT 1`)
    .then(() => 'connected' as const)
    .catch(() => 'disconnected' as const);

  const redisStatus: 'connected' | 'disconnected' = await redis.ping()
    .then((pong) => (pong === 'PONG' ? 'connected' as const : 'disconnected' as const))
    .catch(() => 'disconnected' as const);

  return { dbStatus, redisStatus };
}

export async function healthRoutes(app: FastifyInstance) {
  /**
   * GET /health
   * Checks database and Redis connectivity.
   * Returns 200 if all services are connected, 503 if degraded.
   */
  app.get('/health', async (_req, reply) => {
    const { dbStatus, redisStatus } = await checkDependencies();

    const allHealthy = dbStatus === 'connected' && redisStatus === 'connected';
    const status = allHealthy ? 'ok' : 'degraded';

    const response = {
      status,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    };

    return reply.code(allHealthy ? 200 : 503).send(response);
  });

  app.get('/ready', async (_req, reply) => {
    const { dbStatus, redisStatus } = await checkDependencies();
    const ready = dbStatus === 'connected' && redisStatus === 'connected';

    return reply.code(ready ? 200 : 503).send({
      ready,
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    });
  });
}
