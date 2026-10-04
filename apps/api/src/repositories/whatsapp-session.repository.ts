import { and, eq } from 'drizzle-orm';
import { db, type Database } from '../db/connection.js';
import { whatsappSessions } from '../db/schema/index.js';

export class WhatsAppSessionRepository {
  constructor(private readonly database: Database = db) {}

  find(organizationId: string, channelAccountId: string) {
    return this.database.query.whatsappSessions.findFirst({
      where: and(eq(whatsappSessions.organizationId, organizationId), eq(whatsappSessions.channelAccountId, channelAccountId)),
    });
  }

  async save(data: typeof whatsappSessions.$inferInsert) {
    const [row] = await this.database.insert(whatsappSessions).values(data)
      .onConflictDoUpdate({
        target: whatsappSessions.channelAccountId,
        set: {
          encryptedAuthState: data.encryptedAuthState,
          status: data.status,
          phoneNumber: data.phoneNumber,
          lastError: data.lastError,
          lastConnectedAt: data.lastConnectedAt,
          updatedAt: new Date(),
        },
      }).returning();
    return row!;
  }

  async updateStatus(organizationId: string, channelAccountId: string, data: Partial<typeof whatsappSessions.$inferInsert>) {
    const [row] = await this.database.update(whatsappSessions).set({ ...data, updatedAt: new Date() })
      .where(and(eq(whatsappSessions.organizationId, organizationId), eq(whatsappSessions.channelAccountId, channelAccountId))).returning();
    return row;
  }

  async clear(organizationId: string, channelAccountId: string) {
    await this.database.delete(whatsappSessions).where(and(eq(whatsappSessions.organizationId, organizationId), eq(whatsappSessions.channelAccountId, channelAccountId)));
  }
}
