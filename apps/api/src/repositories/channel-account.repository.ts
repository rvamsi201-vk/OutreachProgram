import { and, eq } from 'drizzle-orm';
import { db, type Database } from '../db/connection.js';
import { channelAccounts } from '../db/schema/index.js';

export class ChannelAccountRepository {
  constructor(private readonly database: Database = db) {}

  async list(organizationId: string) {
    const rows = await this.database.query.channelAccounts.findMany({
      where: eq(channelAccounts.organizationId, organizationId),
    });
    return rows.map(({ encryptedCredentials: _encryptedCredentials, ...account }) => account);
  }

  async findById(organizationId: string, id: string) {
    return this.database.query.channelAccounts.findFirst({
      where: and(eq(channelAccounts.organizationId, organizationId), eq(channelAccounts.id, id)),
    });
  }

  async findRawById(id: string) {
    return this.database.query.channelAccounts.findFirst({
      where: eq(channelAccounts.id, id),
    });
  }

  async create(data: typeof channelAccounts.$inferInsert) {
    if (data.isDefault) {
      await this.database.update(channelAccounts).set({ isDefault: false })
        .where(and(eq(channelAccounts.organizationId, data.organizationId), eq(channelAccounts.channel, data.channel)));
    }
    const [account] = await this.database.insert(channelAccounts).values(data).returning();
    const { encryptedCredentials: _encryptedCredentials, ...safeAccount } = account!;
    return safeAccount;
  }
}
