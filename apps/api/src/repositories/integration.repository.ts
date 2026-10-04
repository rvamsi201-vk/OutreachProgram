import { and, asc, desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db, type Database } from '../db/connection.js';
import { organizationIntegrations } from '../db/schema/index.js';

export function fingerprintCredentials(credentials: Record<string, string>): string {
  return createHash('sha256')
    .update(JSON.stringify(Object.keys(credentials).sort().map((key) => [key, credentials[key]])))
    .digest('hex');
}

export class IntegrationRepository {
  constructor(private readonly database: Database = db) {}

  async list(organizationId: string) {
    return this.database.query.organizationIntegrations.findMany({
      where: eq(organizationIntegrations.organizationId, organizationId),
      orderBy: [asc(organizationIntegrations.category), asc(organizationIntegrations.name)],
    });
  }

  async findById(organizationId: string, id: string) {
    return this.database.query.organizationIntegrations.findFirst({
      where: and(
        eq(organizationIntegrations.organizationId, organizationId),
        eq(organizationIntegrations.id, id),
      ),
    });
  }

  async findDefault(organizationId: string, category: string) {
    return this.database.query.organizationIntegrations.findFirst({
      where: and(
        eq(organizationIntegrations.organizationId, organizationId),
        eq(organizationIntegrations.category, category),
        eq(organizationIntegrations.enabled, true),
      ),
      orderBy: [
        desc(organizationIntegrations.isDefault),
        asc(organizationIntegrations.createdAt),
      ],
    });
  }

  async create(data: typeof organizationIntegrations.$inferInsert) {
    if (data.isDefault) {
      await this.clearDefault(data.organizationId, data.category);
    }
    const [row] = await this.database.insert(organizationIntegrations).values(data).returning();
    return row!;
  }

  async update(
    organizationId: string,
    id: string,
    data: Partial<typeof organizationIntegrations.$inferInsert>,
  ) {
    if (data.isDefault && data.category) {
      await this.clearDefault(organizationId, data.category);
    }
    const [row] = await this.database
      .update(organizationIntegrations)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(organizationIntegrations.organizationId, organizationId),
        eq(organizationIntegrations.id, id),
      ))
      .returning();
    return row;
  }

  private async clearDefault(organizationId: string, category: string) {
    await this.database
      .update(organizationIntegrations)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(
        eq(organizationIntegrations.organizationId, organizationId),
        eq(organizationIntegrations.category, category),
      ));
  }
}
