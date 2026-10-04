import { sql } from 'drizzle-orm';
import { db, type Database } from './connection.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export async function withTenant<T>(
  organizationId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`);
    return work(tx);
  });
}
