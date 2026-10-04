import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env, logger } from './config/index.js';
import { AppError, ValidationError } from './errors/index.js';
import {
  authRoutes,
  healthRoutes,
  teamRoutes,
  memberRoutes,
  leadRoutes,
  conversationRoutes,
  campaignRoutes,
  channelAccountRoutes,
  webhookRoutes,
  aiRoutes,
  voiceInternalRoutes,
  salesRoutes,
  realtimeRoutes,
  integrationRoutes,
} from './routes/index.js';
import { connectRedis } from './db/redis.js';
import { startLeadImportWorker } from './queues/import.queue.js';
import { startCampaignWorkers } from './queues/campaign.queue.js';
import { startAiWorkers } from './queues/ai.queue.js';
import { ZodError } from 'zod';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.headers["x-api-key"]',
          'req.body.password',
          'req.body.token',
          'req.body.refreshToken',
          'req.body.accessToken',
          'req.body.credentials',
          'req.body.encryptedCredentials',
          '*.password',
          '*.passwordHash',
          '*.token',
          '*.tokenHash',
          '*.refreshToken',
          '*.accessToken',
          '*.apiKey',
          '*.secret',
          '*.credentials',
          '*.encryptedCredentials',
          '*.authorization',
          '*.cookie',
        ],
        censor: '[REDACTED]',
      },
    },
    disableRequestLogging: !env.API_REQUEST_LOGGING,
    trustProxy: true,
  });

  // ─── Plugins ─────────────────────────────────────────────────

  await app.register(cookie, {
    secret: env.JWT_SECRET,
    parseOptions: {},
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024,
    },
  });

  // CORS only needed in development when Vite runs on a different port
  if (env.NODE_ENV === 'development') {
    await app.register(cors, {
      origin: env.APP_URL,
      credentials: true,
    });
  }

  // ─── Global Error Handler ────────────────────────────────────

  app.setErrorHandler((error, req, reply) => {
    // Zod validation errors
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.flatten(),
        },
      });
    }

    // App-level errors
    if (error instanceof AppError) {
      const response: Record<string, unknown> = {
        error: {
          code: error.code,
          message: error.message,
        },
      };
      if (error instanceof ValidationError && error.details) {
        (response.error as Record<string, unknown>).details = error.details;
      }
      return reply.code(error.statusCode).send(response);
    }

    // Fastify rate limit
    if ((error as any).statusCode === 429) {
      return reply.code(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
        },
      });
    }

    // Unexpected errors
    const err = error instanceof Error ? error : new Error(String(error));
    req.log.error({ err }, 'Unhandled error');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : err.message,
      },
    });
  });

  // ─── Connect Redis ───────────────────────────────────────────

  try {
    await connectRedis();
    startLeadImportWorker();
    await startCampaignWorkers();
    startAiWorkers();
  } catch (err) {
    logger.warn({ err }, 'Redis connection failed on startup, continuing...');
  }

  // ─── Routes ──────────────────────────────────────────────────

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(teamRoutes);
  await app.register(memberRoutes);
  await app.register(leadRoutes);
  await app.register(conversationRoutes);
  await app.register(campaignRoutes);
  await app.register(channelAccountRoutes);
  await app.register(webhookRoutes);
  await app.register(aiRoutes);
  await app.register(voiceInternalRoutes);
  await app.register(salesRoutes);
  await app.register(realtimeRoutes);
  await app.register(integrationRoutes);

  return app;
}
