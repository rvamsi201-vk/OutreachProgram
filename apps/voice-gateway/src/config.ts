import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

for (const path of [
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '.env'),
]) {
  if (existsSync(path)) {
    loadDotenv({ path, override: false });
  }
}

export const config = z.object({
  VOICE_GATEWAY_PORT: z.coerce.number().default(3100),
  API_URL: z.string().url().default('http://localhost:3000'),
  SILENCE_PROMPT_MS: z.coerce.number().default(6000),
  SILENCE_END_MS: z.coerce.number().default(15000),
  MAX_CALL_MS: z.coerce.number().default(15 * 60 * 1000),
  DISCLOSURE_TEXT: z.string().default('This call may be recorded for quality and follow-up.'),
}).parse(process.env);
