import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../errors/index.js';
import type { Permission } from '@ai-crm/shared';

/**
 * Request context injected by auth middleware.
 * Available on all authenticated routes.
 */
export interface RequestContext {
  userId: string;
  organizationId: string;
  memberId: string;
  role: string;
  permissions: string[];
}

// Extend Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext;
  }
}

/**
 * Verify the access JWT from httpOnly cookie.
 * Sets req.ctx.userId.
 */
export async function authenticate(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = req.cookies?.access_token;

  if (!token) {
    throw new UnauthorizedError('Access token required');
  }

  try {
    const payload = await req.jwtVerify<{
      sub: string;
      organizationId: string;
      memberId: string;
      role: string;
      permissions: string[];
    }>({ onlyCookie: false });

    req.ctx = {
      userId: payload.sub,
      organizationId: payload.organizationId,
      memberId: payload.memberId,
      role: payload.role,
      permissions: payload.permissions,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

/**
 * CSRF protection for state-changing requests.
 * Checks for X-CSRF-Token header matching a known value.
 * Since we're same-origin (Nginx proxies both SPA and API),
 * we use the double-submit cookie pattern.
 */
export async function csrfProtection(
  req: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  // Only enforce on state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return;
  }

  const csrfHeader = req.headers['x-csrf-token'];
  const csrfCookie = req.cookies?.csrf_token;

  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    throw new ForbiddenError('CSRF validation failed');
  }
}

/**
 * Returns a preHandler that checks for a specific permission.
 */
export function requirePermission(permission: Permission) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!req.ctx) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!req.ctx.permissions.includes(permission)) {
      throw new ForbiddenError(`Missing permission: ${permission}`);
    }
  };
}
