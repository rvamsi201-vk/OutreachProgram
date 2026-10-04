import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const path of [
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '.env'),
]) {
  if (existsSync(path)) {
    loadDotenv({ path, override: true });
  }
}

const booleanEnv = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const optionalStringEnv = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().min(1).optional(),
);

const optionalUrlEnv = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
);

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  API_PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REFRESH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  APP_URL: z.string().url().default('http://localhost:5173'),
  LLM_PROVIDER: z.enum(['mock', 'openai', 'openai-compatible']).default('mock'),
  OPENAI_API_KEY: optionalStringEnv,
  LLM_BASE_URL: optionalUrlEnv,
  LLM_CHAT_MODEL: z.string().min(1).default('gpt-4o-mini'),
  LLM_EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),
  BAILEYS_WEBSOCKET_URL: z.string().url().optional(),
  BAILEYS_BROWSER_NAME: z.string().min(1).default('AI Outreach CRM'),
  BAILEYS_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('warn'),
  GOOGLE_CLIENT_ID: optionalStringEnv,
  GOOGLE_CLIENT_SECRET: optionalStringEnv,
  GOOGLE_OAUTH_REDIRECT_URL: optionalUrlEnv,
  API_REQUEST_LOGGING: booleanEnv.default('false'),
  DB_LOG_QUERIES: booleanEnv.default('false'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      '❌ Invalid environment variables:',
      result.error.flatten().fieldErrors,
    );
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
