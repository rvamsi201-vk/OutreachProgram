import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
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
  serializers: {
    ...pino.stdSerializers,
    // Redact sensitive fields from logs
    req: (req) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
  },
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
});

export type Logger = typeof logger;
