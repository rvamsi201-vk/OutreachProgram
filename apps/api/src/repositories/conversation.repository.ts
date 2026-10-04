import { and, desc, eq } from 'drizzle-orm';
import { db, type Database } from '../db/connection.js';
import { communicationEvents, conversations, leads, messages } from '../db/schema/index.js';

export class ConversationRepository {
  constructor(private readonly database: Database = db) {}

  async list(organizationId: string) {
    return this.database
      .select({
        id: conversations.id,
        leadId: conversations.leadId,
        channel: conversations.channel,
        unreadCount: conversations.unreadCount,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
        leadName: leads.name,
        leadCompany: leads.company,
      })
      .from(conversations)
      .innerJoin(leads, eq(leads.id, conversations.leadId))
      .where(eq(conversations.organizationId, organizationId))
      .orderBy(desc(conversations.lastMessageAt));
  }

  async findById(organizationId: string, id: string) {
    return this.database.query.conversations.findFirst({
      where: and(eq(conversations.organizationId, organizationId), eq(conversations.id, id)),
    });
  }

  async getOrCreate(organizationId: string, leadId: string, channel: string) {
    const existing = await this.database.query.conversations.findFirst({
      where: and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.leadId, leadId),
        eq(conversations.channel, channel),
      ),
    });
    if (existing) return existing;
    const [conversation] = await this.database.insert(conversations).values({
      organizationId,
      leadId,
      channel,
      lastMessageAt: new Date(),
    }).returning();
    return conversation!;
  }

  async messages(organizationId: string, conversationId: string) {
    return this.database.query.messages.findMany({
      where: and(eq(messages.organizationId, organizationId), eq(messages.conversationId, conversationId)),
      orderBy: [messages.createdAt],
    });
  }

  async createMessage(data: typeof messages.$inferInsert) {
    if (data.providerMessageId) {
      const existing = await this.database.query.messages.findFirst({
        where: and(
          eq(messages.organizationId, data.organizationId),
          eq(messages.conversationId, data.conversationId),
          eq(messages.providerMessageId, data.providerMessageId),
        ),
      });
      if (existing) return existing;
    }
    const [message] = await this.database.insert(messages).values(data).returning();
    await this.database.update(conversations).set({
      lastMessageAt: message!.createdAt,
      updatedAt: new Date(),
    }).where(and(eq(conversations.organizationId, data.organizationId), eq(conversations.id, data.conversationId)));
    await this.database.insert(communicationEvents).values({
      organizationId: data.organizationId,
      leadId: data.leadId,
      conversationId: data.conversationId,
      messageId: message!.id,
      eventType: data.direction === 'OUTBOUND' ? 'message.send_requested' : 'message.received',
      channel: undefined,
      metadata: { senderType: data.senderType },
    });
    return message!;
  }
}
