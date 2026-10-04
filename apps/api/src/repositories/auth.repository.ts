import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  users,
  organizations,
  organizationMembers,
  refreshTokens,
  auditLogs,
} from '../db/schema/index.js';
import type { Database } from '../db/connection.js';

export class UserRepository {
  constructor(private readonly database: Database = db) {}

  async findByEmail(email: string) {
    return this.database.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });
  }

  async findById(id: string) {
    return this.database.query.users.findFirst({
      where: eq(users.id, id),
    });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }) {
    const [user] = await this.database
      .insert(users)
      .values({
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
      })
      .returning();
    return user!;
  }

  async updateLastLogin(userId: string) {
    await this.database
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId));
  }
}

export class OrganizationRepository {
  constructor(private readonly database: Database = db) {}

  async findById(id: string) {
    return this.database.query.organizations.findFirst({
      where: eq(organizations.id, id),
    });
  }

  async create(data: { name: string; defaultCountry?: string; timezone?: string }) {
    const [org] = await this.database
      .insert(organizations)
      .values({
        name: data.name,
        defaultCountry: data.defaultCountry ?? 'IN',
        timezone: data.timezone ?? 'Asia/Kolkata',
      })
      .returning();
    return org!;
  }
}

export class MembershipRepository {
  constructor(private readonly database: Database = db) {}

  async findByUserAndOrg(userId: string, organizationId: string) {
    return this.database.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, 'ACTIVE'),
      ),
    });
  }

  async findAllByUser(userId: string) {
    return this.database.query.organizationMembers.findMany({
      where: and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, 'ACTIVE'),
      ),
    });
  }

  async findAllByOrganization(organizationId: string) {
    return this.database.query.organizationMembers.findMany({
      where: and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, 'ACTIVE'),
      ),
    });
  }

  async create(data: {
    organizationId: string;
    userId: string;
    role: string;
    status?: string;
    inviteToken?: string;
    inviteExpiresAt?: Date;
  }) {
    const [member] = await this.database
      .insert(organizationMembers)
      .values({
        organizationId: data.organizationId,
        userId: data.userId,
        role: data.role,
        status: data.status ?? 'ACTIVE',
        inviteToken: data.inviteToken,
        inviteExpiresAt: data.inviteExpiresAt,
      })
      .returning();
    return member!;
  }

  async updateRole(organizationId: string, memberId: string, role: string) {
    const [updated] = await this.database
      .update(organizationMembers)
      .set({ role, updatedAt: new Date() })
      .where(
        and(
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.organizationId, organizationId),
        ),
      )
      .returning();
    return updated;
  }

  async remove(organizationId: string, memberId: string) {
    const [removed] = await this.database
      .update(organizationMembers)
      .set({ status: 'SUSPENDED', updatedAt: new Date() })
      .where(
        and(
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.organizationId, organizationId),
        ),
      )
      .returning();
    return removed;
  }
}

export class RefreshTokenRepository {
  constructor(private readonly database: Database = db) {}

  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }) {
    const [token] = await this.database
      .insert(refreshTokens)
      .values(data)
      .returning();
    return token!;
  }

  async findByHash(tokenHash: string) {
    return this.database.query.refreshTokens.findFirst({
      where: and(
        eq(refreshTokens.tokenHash, tokenHash),
      ),
    });
  }

  async revoke(tokenId: string, replacedByTokenId?: string) {
    await this.database
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
        replacedByTokenId,
      })
      .where(eq(refreshTokens.id, tokenId));
  }

  async revokeAllForUser(userId: string) {
    await this.database
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, userId),
        ),
      );
  }
}

export class AuditLogRepository {
  constructor(private readonly database: Database = db) {}

  async create(data: {
    organizationId?: string;
    userId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const [log] = await this.database
      .insert(auditLogs)
      .values(data)
      .returning();
    return log!;
  }
}
