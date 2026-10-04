import type { FastifyInstance } from 'fastify';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { TeamRepository } from '../repositories/team.repository.js';
import { MembershipRepository, AuditLogRepository } from '../repositories/auth.repository.js';
import { createTeamSchema, addTeamMemberSchema, updateMemberRoleSchema } from '@ai-crm/shared';
import { NotFoundError } from '../errors/index.js';
import { PERMISSIONS } from '@ai-crm/shared';

export async function teamRoutes(app: FastifyInstance) {
  const teamRepo = new TeamRepository();
  const memberRepo = new MembershipRepository();
  const auditRepo = new AuditLogRepository();

  // All team routes require authentication
  app.addHook('preHandler', authenticate);

  /**
   * GET /teams
   */
  app.get('/teams', async (req) => {
    const teams = await teamRepo.findAllByOrganization(req.ctx.organizationId);
    return { data: teams };
  });

  /**
   * POST /teams
   */
  app.post(
    '/teams',
    { preHandler: [requirePermission(PERMISSIONS.USERS_INVITE)] },
    async (req, reply) => {
      const input = createTeamSchema.parse(req.body);
      const team = await teamRepo.create(req.ctx.organizationId, input);

      await auditRepo.create({
        organizationId: req.ctx.organizationId,
        userId: req.ctx.userId,
        action: 'team.created',
        entityType: 'team',
        entityId: team.id,
        metadata: { name: team.name },
      });

      return reply.code(201).send(team);
    },
  );

  /**
   * GET /teams/:id
   */
  app.get('/teams/:id', async (req) => {
    const { id } = req.params as { id: string };
    const team = await teamRepo.findById(req.ctx.organizationId, id);
    if (!team) throw new NotFoundError('Team', id);

    const members = await teamRepo.getMembers(id);
    return { ...team, members };
  });

  /**
   * DELETE /teams/:id
   */
  app.delete(
    '/teams/:id',
    { preHandler: [requirePermission(PERMISSIONS.USERS_REMOVE)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const team = await teamRepo.findById(req.ctx.organizationId, id);
      if (!team) throw new NotFoundError('Team', id);

      await teamRepo.delete(req.ctx.organizationId, id);

      await auditRepo.create({
        organizationId: req.ctx.organizationId,
        userId: req.ctx.userId,
        action: 'team.deleted',
        entityType: 'team',
        entityId: id,
      });

      return reply.code(204).send();
    },
  );

  /**
   * POST /teams/:id/members
   */
  app.post(
    '/teams/:id/members',
    { preHandler: [requirePermission(PERMISSIONS.USERS_INVITE)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { memberId } = addTeamMemberSchema.parse(req.body);

      const team = await teamRepo.findById(req.ctx.organizationId, id);
      if (!team) throw new NotFoundError('Team', id);

      const member = await teamRepo.addMember(id, memberId);
      return reply.code(201).send(member);
    },
  );

  /**
   * DELETE /teams/:id/members/:memberId
   */
  app.delete(
    '/teams/:id/members/:memberId',
    { preHandler: [requirePermission(PERMISSIONS.USERS_REMOVE)] },
    async (req, reply) => {
      const { id, memberId } = req.params as { id: string; memberId: string };
      await teamRepo.removeMember(id, memberId);
      return reply.code(204).send();
    },
  );
}

export async function memberRoutes(app: FastifyInstance) {
  const memberRepo = new MembershipRepository();
  const auditRepo = new AuditLogRepository();

  app.addHook('preHandler', authenticate);

  /**
   * GET /members
   */
  app.get('/members', async (req) => {
    const members = await memberRepo.findAllByOrganization(req.ctx.organizationId);
    return { data: members };
  });

  /**
   * PATCH /members/:id/role
   */
  app.patch(
    '/members/:id/role',
    { preHandler: [requirePermission(PERMISSIONS.USERS_INVITE)] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { role } = updateMemberRoleSchema.parse(req.body);

      const updated = await memberRepo.updateRole(
        req.ctx.organizationId,
        id,
        role,
      );
      if (!updated) throw new NotFoundError('Member', id);

      await auditRepo.create({
        organizationId: req.ctx.organizationId,
        userId: req.ctx.userId,
        action: 'member.role_changed',
        entityType: 'organization_member',
        entityId: id,
        metadata: { newRole: role },
      });

      return updated;
    },
  );

  /**
   * DELETE /members/:id
   */
  app.delete(
    '/members/:id',
    { preHandler: [requirePermission(PERMISSIONS.USERS_REMOVE)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      const removed = await memberRepo.remove(req.ctx.organizationId, id);
      if (!removed) throw new NotFoundError('Member', id);

      await auditRepo.create({
        organizationId: req.ctx.organizationId,
        userId: req.ctx.userId,
        action: 'member.removed',
        entityType: 'organization_member',
        entityId: id,
      });

      return reply.code(204).send();
    },
  );
}
