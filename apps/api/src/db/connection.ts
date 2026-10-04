import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

// Connection for queries (pooled)
const queryClient = postgres(env.DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema, logger: env.DB_LOG_QUERIES });

// Connection for migrations (single, non-pooled)
export function createMigrationClient() {
  return postgres(env.DATABASE_URL, { max: 1 });
}

export type Database = typeof db;
