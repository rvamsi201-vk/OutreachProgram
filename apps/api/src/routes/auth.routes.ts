import type { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth.service.js';
import { registerSchema, loginSchema, switchOrganizationSchema } from '@ai-crm/shared';
import { authenticate } from '../middleware/auth.js';
import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../errors/index.js';
import { LoginProtectionService } from '../services/security/login-protection.service.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService();
  const loginProtection = new LoginProtectionService();

  /**
   * POST /auth/register
   * Creates user + organization + ADMIN membership
   */
  app.post('/auth/register', async (req, reply) => {
    const input = registerSchema.parse(req.body);
    const meta = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    const { user, organization, membership } = await authService.register(input, meta);

    // Generate tokens
    const accessToken = authService.generateAccessToken(app, user.id, membership);
    const refreshToken = await authService.generateRefreshToken(user.id, meta);
    const csrfToken = randomBytes(32).toString('hex');

    // Set cookies
    reply.setCookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60, // 15 minutes
    });

    reply.setCookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    reply.setCookie('csrf_token', csrfToken, {
      ...COOKIE_OPTIONS,
      httpOnly: false, // Frontend needs to read this
      maxAge: 15 * 60,
    });

    return reply.code(201).send({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      organization: {
        id: organization.id,
        name: organization.name,
      },
    });
  });

  /**
   * POST /auth/login
   */
  app.post('/auth/login', async (req, reply) => {
    const input = loginSchema.parse(req.body);
    await loginProtection.assertCanAttempt(input.email, req.ip);
    const meta = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    let loginResult: Awaited<ReturnType<AuthService['login']>>;
    try {
      loginResult = await authService.login(input, meta);
      await loginProtection.recordSuccess(input.email, req.ip);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        await loginProtection.recordFailure(input.email, req.ip);
      }
      throw error;
    }

    const { user, membership } = loginResult;

    const accessToken = authService.generateAccessToken(app, user.id, membership);
    const refreshToken = await authService.generateRefreshToken(user.id, meta);
    const csrfToken = randomBytes(32).toString('hex');

    reply.setCookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60,
    });

    reply.setCookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    });

    reply.setCookie('csrf_token', csrfToken, {
      ...COOKIE_OPTIONS,
      httpOnly: false,
      maxAge: 15 * 60,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  });

  /**
   * POST /auth/refresh
   * Rotate refresh token and issue new access token
   */
  app.post('/auth/refresh', async (req, reply) => {
    const rawToken = req.cookies?.refresh_token;
    if (!rawToken) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Refresh token required' } });
    }

    const meta = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    const { user, membership, refreshToken } =
      await authService.rotateRefreshToken(rawToken, meta);

    const accessToken = authService.generateAccessToken(app, user.id, membership);
    const csrfToken = randomBytes(32).toString('hex');

    reply.setCookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60,
    });

    reply.setCookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    });

    reply.setCookie('csrf_token', csrfToken, {
      ...COOKIE_OPTIONS,
      httpOnly: false,
      maxAge: 15 * 60,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  });

  /**
   * POST /auth/logout
   */
  app.post(
    '/auth/logout',
    { preHandler: [authenticate] },
    async (req, reply) => {
      await authService.logout(req.ctx.userId);

      reply.clearCookie('access_token', COOKIE_OPTIONS);
      reply.clearCookie('refresh_token', { ...COOKIE_OPTIONS, path: '/auth/refresh' });
      reply.clearCookie('csrf_token', { ...COOKIE_OPTIONS, httpOnly: false });

      return { message: 'Logged out' };
    },
  );

  /**
   * GET /auth/me
   */
  app.get(
    '/auth/me',
    { preHandler: [authenticate] },
    async (req) => {
      return authService.getMe(req.ctx.userId, req.ctx.organizationId);
    },
  );

  /**
   * POST /auth/switch-organization
   */
  app.post(
    '/auth/switch-organization',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { organizationId } = switchOrganizationSchema.parse(req.body);
      const membership = await authService.switchOrganization(
        req.ctx.userId,
        organizationId,
      );

      const accessToken = authService.generateAccessToken(
        app,
        req.ctx.userId,
        membership,
      );
      const csrfToken = randomBytes(32).toString('hex');

      reply.setCookie('access_token', accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: 15 * 60,
      });

      reply.setCookie('csrf_token', csrfToken, {
        ...COOKIE_OPTIONS,
        httpOnly: false,
        maxAge: 15 * 60,
      });

      return { organizationId: membership.organizationId, role: membership.role };
    },
  );
}
