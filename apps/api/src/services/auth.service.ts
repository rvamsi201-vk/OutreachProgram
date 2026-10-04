import { randomBytes, createHash } from 'node:crypto';
import * as argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import {
  UserRepository,
  OrganizationRepository,
  MembershipRepository,
  RefreshTokenRepository,
  AuditLogRepository,
} from '../repositories/index.js';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from '../errors/index.js';
import { ROLE_PERMISSIONS } from '@ai-crm/shared';
import { logger } from '../config/logger.js';
import type { RegisterInput, LoginInput } from '@ai-crm/shared';

// Refresh token lifetime: 7 days
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
// Access token lifetime: 15 minutes
const ACCESS_TOKEN_EXPIRY = '15m';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  private userRepo = new UserRepository();
  private orgRepo = new OrganizationRepository();
  private memberRepo = new MembershipRepository();
  private refreshTokenRepo = new RefreshTokenRepository();
  private auditRepo = new AuditLogRepository();

  /**
   * Register a new user with a new organization.
   * Creates user + org + ADMIN membership in one logical transaction.
   */
  async register(
    input: RegisterInput,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    // Check for existing user
    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    // Hash password with argon2
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // Create user
    const user = await this.userRepo.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
    });

    // Create organization
    const org = await this.orgRepo.create({
      name: input.organizationName,
    });

    // Create ADMIN membership
    const member = await this.memberRepo.create({
      organizationId: org.id,
      userId: user.id,
      role: 'ADMIN',
    });

    // Audit log
    await this.auditRepo.create({
      organizationId: org.id,
      userId: user.id,
      action: 'user.registered',
      entityType: 'user',
      entityId: user.id,
      metadata: { organizationName: org.name },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    logger.info(
      { userId: user.id, orgId: org.id },
      'User registered with new organization',
    );

    return { user, organization: org, membership: member };
  }

  /**
   * Login: verify credentials and return tokens.
   */
  async login(
    input: LoginInput,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await this.userRepo.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Get user's memberships to find the default org
    const memberships = await this.memberRepo.findAllByUser(user.id);
    if (memberships.length === 0) {
      throw new UnauthorizedError('No active organization membership');
    }

    // Use first active membership as default
    const activeMembership = memberships[0]!;

    await this.userRepo.updateLastLogin(user.id);

    await this.auditRepo.create({
      organizationId: activeMembership.organizationId,
      userId: user.id,
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      user,
      membership: activeMembership,
      allMemberships: memberships,
    };
  }

  /**
   * Generate access JWT containing user context.
   */
  generateAccessToken(
    app: FastifyInstance,
    userId: string,
    membership: { id: string; organizationId: string; role: string },
  ): string {
    const permissions = ROLE_PERMISSIONS[membership.role] ?? [];

    return app.jwt.sign(
      {
        sub: userId,
        organizationId: membership.organizationId,
        memberId: membership.id,
        role: membership.role,
        permissions: [...permissions],
      },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
  }

  /**
   * Generate a refresh token, hash it, and store in DB.
   * Returns the raw token (to set in cookie).
   */
  async generateRefreshToken(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<string> {
    const rawToken = randomBytes(64).toString('hex');
    const tokenHash = hashToken(rawToken);

    await this.refreshTokenRepo.create({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    return rawToken;
  }

  /**
   * Rotate refresh token: revoke old, issue new.
   */
  async rotateRefreshToken(
    rawToken: string,
    meta: { userAgent?: string; ipAddress?: string },
  ) {
    const tokenHash = hashToken(rawToken);
    const stored = await this.refreshTokenRepo.findByHash(tokenHash);

    if (!stored) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (stored.revokedAt) {
      // Token reuse detected — revoke all tokens for this user
      logger.warn(
        { userId: stored.userId },
        'Refresh token reuse detected, revoking all tokens',
      );
      await this.refreshTokenRepo.revokeAllForUser(stored.userId);
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    if (new Date() > stored.expiresAt) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    // Issue new token
    const newRawToken = randomBytes(64).toString('hex');
    const newTokenHash = hashToken(newRawToken);

    const newStored = await this.refreshTokenRepo.create({
      userId: stored.userId,
      tokenHash: newTokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    // Revoke old token
    await this.refreshTokenRepo.revoke(stored.id, newStored.id);

    // Get user and membership
    const user = await this.userRepo.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const memberships = await this.memberRepo.findAllByUser(user.id);
    const activeMembership = memberships[0];
    if (!activeMembership) {
      throw new UnauthorizedError('No active membership');
    }

    return {
      user,
      membership: activeMembership,
      allMemberships: memberships,
      refreshToken: newRawToken,
    };
  }

  /**
   * Logout: revoke all refresh tokens for the user.
   */
  async logout(userId: string) {
    await this.refreshTokenRepo.revokeAllForUser(userId);
  }

  /**
   * Get current user profile with organization info.
   */
  async getMe(userId: string, organizationId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    const memberships = await this.memberRepo.findAllByUser(userId);
    const activeMembership = memberships.find(
      (m) => m.organizationId === organizationId,
    );

    // Fetch org names
    const orgs = await Promise.all(
      memberships.map(async (m) => {
        const org = await this.orgRepo.findById(m.organizationId);
        return {
          id: m.organizationId,
          name: org?.name ?? 'Unknown',
          role: m.role,
        };
      }),
    );

    const activeOrg = orgs.find((o) => o.id === organizationId);
    const permissions = activeMembership
      ? (ROLE_PERMISSIONS[activeMembership.role] ?? [])
      : [];

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      activeOrganization: activeOrg
        ? {
            id: activeOrg.id,
            name: activeOrg.name,
            role: activeOrg.role,
            permissions: [...permissions],
          }
        : null,
      organizations: orgs,
    };
  }

  /**
   * Switch active organization.
   */
  async switchOrganization(userId: string, organizationId: string) {
    const membership = await this.memberRepo.findByUserAndOrg(
      userId,
      organizationId,
    );
    if (!membership) {
      throw new NotFoundError('Organization membership');
    }

    return membership;
  }
}
