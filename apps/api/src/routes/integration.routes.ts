import type { FastifyInstance } from 'fastify';
import {
  integrationSchema,
  PERMISSIONS,
  updateIntegrationSchema,
  uuidParamSchema,
} from '@ai-crm/shared';
import { env } from '../config/env.js';
import { NotFoundError } from '../errors/index.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  fingerprintCredentials,
  IntegrationRepository,
} from '../repositories/integration.repository.js';
import { EncryptionService } from '../services/security/encryption.service.js';
import { summarizeCredentials } from '../services/security/credential-presenter.service.js';

export async function integrationRoutes(app: FastifyInstance) {
  const repo = new IntegrationRepository();
  const encryption = new EncryptionService(env.ENCRYPTION_KEY);

  app.addHook('preHandler', authenticate);

  app.get(
    '/integrations',
    { preHandler: [requirePermission(PERMISSIONS.SETTINGS_UPDATE)] },
    async (req) => {
      const rows = await repo.list(req.ctx.organizationId);
      return { data: rows.map((row) => toSafeIntegration(row, encryption)) };
    },
  );

  app.post(
    '/integrations',
    { preHandler: [requirePermission(PERMISSIONS.SETTINGS_UPDATE)] },
    async (req, reply) => {
      const input = integrationSchema.parse(req.body);
      const integration = await repo.create({
        organizationId: req.ctx.organizationId,
        name: input.name,
        category: input.category,
        provider: input.provider,
        isDefault: input.isDefault,
        enabled: input.enabled,
        configuration: input.configuration,
        encryptedCredentials: encryption.encryptJson(input.credentials),
        credentialsFingerprint: fingerprintCredentials(input.credentials),
        createdBy: req.ctx.userId,
      });
      return reply.code(201).send(toSafeIntegration(integration, encryption));
    },
  );

  app.patch(
    '/integrations/:id',
    { preHandler: [requirePermission(PERMISSIONS.SETTINGS_UPDATE)] },
    async (req) => {
      const { id } = uuidParamSchema.parse(req.params);
      const existing = await repo.findById(req.ctx.organizationId, id);
      if (!existing) throw new NotFoundError('Integration', id);

      const input = updateIntegrationSchema.parse(req.body);
      const nextCredentials = input.credentials
        ? input.credentials
        : encryption.decryptJson(existing.encryptedCredentials);

      const integration = await repo.update(req.ctx.organizationId, id, {
        name: input.name,
        category: input.isDefault ? (input.category ?? existing.category) : input.category,
        provider: input.provider,
        isDefault: input.isDefault,
        enabled: input.enabled,
        configuration: input.configuration,
        encryptedCredentials: input.credentials
          ? encryption.encryptJson(input.credentials)
          : existing.encryptedCredentials,
        credentialsFingerprint: fingerprintCredentials(nextCredentials),
      });
      if (!integration) throw new NotFoundError('Integration', id);
      return toSafeIntegration(integration, encryption);
    },
  );
}

function toSafeIntegration(
  row: {
    id: string;
    organizationId: string;
    name: string;
    category: string;
    provider: string;
    isDefault: boolean;
    enabled: boolean;
    configuration: unknown;
    encryptedCredentials: string;
    credentialsFingerprint: string | null;
    lastTestedAt: Date | null;
    lastTestStatus: string | null;
    lastTestMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  encryption: EncryptionService,
) {
  const credentials = encryption.decryptJson(row.encryptedCredentials);
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    category: row.category,
    provider: row.provider,
    isDefault: row.isDefault,
    enabled: row.enabled,
    configuration: row.configuration,
    credentials: summarizeCredentials(credentials),
    credentialKeys: Object.keys(credentials),
    credentialsFingerprint: row.credentialsFingerprint,
    lastTestedAt: row.lastTestedAt,
    lastTestStatus: row.lastTestStatus,
    lastTestMessage: row.lastTestMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
