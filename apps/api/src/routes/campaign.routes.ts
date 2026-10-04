import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  campaignListQuerySchema,
  campaignRunInputSchema,
  channelAccountSchema,
  createCampaignSchema,
  PERMISSIONS,
  updateCampaignSchema,
  uuidParamSchema,
} from '@ai-crm/shared';
import { and, eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/connection.js';
import { campaignEnrollments } from '../db/schema/index.js';
import { NotFoundError, UnauthorizedError } from '../errors/index.js';
import { ProviderFactory } from '../providers/provider.factory.js';
import { CampaignRepository } from '../repositories/campaign.repository.js';
import { ChannelAccountRepository } from '../repositories/channel-account.repository.js';
import { ConversationRepository } from '../repositories/conversation.repository.js';
import { LeadRepository } from '../repositories/lead.repository.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { CampaignService } from '../services/campaign/campaign.service.js';
import { AiAutoReplyService } from '../services/ai/ai-auto-reply.service.js';
import { ContactNormalizationService } from '../services/crm/normalization.service.js';
import { EncryptionService } from '../services/security/encryption.service.js';
import { baileysManager } from '../services/whatsapp/baileys-manager.service.js';

export async function campaignRoutes(app: FastifyInstance) {
  const service = new CampaignService();
  app.addHook('preHandler', authenticate);

  app.get('/campaigns', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_READ)] }, async (req) => {
    const query = campaignListQuerySchema.parse(req.query);
    const result = await service.list(req.ctx.organizationId, query);
    return { data: result.data, pagination: { nextCursor: result.nextCursor, hasMore: result.hasMore } };
  });

  app.post('/campaigns', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_CREATE)] }, async (req, reply) => {
    const input = createCampaignSchema.parse(req.body);
    return reply.code(201).send(await service.create(req.ctx.organizationId, req.ctx.userId, input));
  });

  app.get('/campaigns/:id', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_READ)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const campaign = await service.get(req.ctx.organizationId, id);
    if (!campaign) throw new NotFoundError('Campaign', id);
    return campaign;
  });

  app.patch('/campaigns/:id', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_CREATE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const campaign = await service.update(req.ctx.organizationId, id, updateCampaignSchema.parse(req.body));
    if (!campaign) throw new NotFoundError('Campaign', id);
    return campaign;
  });

  app.delete('/campaigns/:id', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_CREATE)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    await service.delete(req.ctx.organizationId, id);
    return reply.code(204).send();
  });

  app.post('/campaigns/:id/audience-preview', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_READ)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return service.previewAudience(req.ctx.organizationId, id);
  });

  app.get('/campaigns/:id/runs', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_READ)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const campaign = await service.get(req.ctx.organizationId, id);
    if (!campaign) throw new NotFoundError('Campaign', id);
    return { data: await service.listRuns(req.ctx.organizationId, id) };
  });

  app.post('/campaigns/:id/runs/preview', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_READ)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return service.previewRun(req.ctx.organizationId, id, campaignRunInputSchema.parse(req.body));
  });

  app.post('/campaigns/:id/runs', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_LAUNCH)] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const run = await service.createRun(req.ctx.organizationId, id, req.ctx.userId, campaignRunInputSchema.parse(req.body));
    return reply.code(201).send(run);
  });

  app.get('/campaign-runs/:id', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_READ)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const run = await service.getRun(req.ctx.organizationId, id);
    if (!run) throw new NotFoundError('Campaign run', id);
    return run;
  });

  app.post('/campaign-runs/:id/pause', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_PAUSE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return service.controlRun(req.ctx.organizationId, id, 'pause');
  });

  app.post('/campaign-runs/:id/resume', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_LAUNCH)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return service.controlRun(req.ctx.organizationId, id, 'resume');
  });

  app.post('/campaign-runs/:id/cancel', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_PAUSE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return service.controlRun(req.ctx.organizationId, id, 'cancel');
  });

  app.post('/campaigns/:id/launch', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_LAUNCH)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return service.launch(req.ctx.organizationId, id);
  });

  app.post('/campaigns/:id/pause', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_PAUSE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return service.control(req.ctx.organizationId, id, 'pause');
  });

  app.post('/campaigns/:id/resume', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_LAUNCH)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return service.control(req.ctx.organizationId, id, 'resume');
  });

  app.post('/campaigns/:id/cancel', { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_PAUSE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return service.control(req.ctx.organizationId, id, 'cancel');
  });
}

export async function channelAccountRoutes(app: FastifyInstance) {
  const repo = new ChannelAccountRepository();
  const leadRepo = new LeadRepository();
  const conversations = new ConversationRepository();
  const encryption = new EncryptionService(env.ENCRYPTION_KEY);
  app.addHook('preHandler', authenticate);

  app.get('/channel-accounts', { preHandler: [requirePermission(PERMISSIONS.CHANNELS_MANAGE)] }, async (req) => {
    return { data: await repo.list(req.ctx.organizationId) };
  });

  app.post('/channel-accounts', { preHandler: [requirePermission(PERMISSIONS.CHANNELS_MANAGE)] }, async (req, reply) => {
    const input = channelAccountSchema.parse(req.body);
    const account = await repo.create({
      organizationId: req.ctx.organizationId,
      name: input.name,
      channel: input.channel,
      provider: input.provider,
      isDefault: input.isDefault,
      configuration: input.configuration,
      encryptedCredentials: encryption.encryptJson(input.credentials),
    });
    return reply.code(201).send(account);
  });

  app.get('/channel-accounts/gmail/oauth/url', { preHandler: [requirePermission(PERMISSIONS.CHANNELS_MANAGE)] }, async (req) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_OAUTH_REDIRECT_URL) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_OAUTH_REDIRECT_URL are required for Gmail OAuth');
    }
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.GOOGLE_OAUTH_REDIRECT_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('scope', [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ].join(' '));
    url.searchParams.set('state', Buffer.from(JSON.stringify({ organizationId: req.ctx.organizationId })).toString('base64url'));
    return { url: url.toString() };
  });

  app.get('/channel-accounts/gmail/oauth/callback', { preHandler: [requirePermission(PERMISSIONS.CHANNELS_MANAGE)] }, async (req, reply) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URL) {
      throw new Error('Google OAuth environment variables are required');
    }
    const { code } = req.query as { code?: string };
    if (!code) throw new Error('Missing Google OAuth code');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URL,
        grant_type: 'authorization_code',
      }),
    });
    const tokenPayload = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new Error(tokenPayload.error_description ?? `Google OAuth failed with ${tokenResponse.status}`);
    }
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { authorization: `Bearer ${tokenPayload.access_token}` },
    });
    const profile = await profileResponse.json() as { email?: string; name?: string };
    const account = await repo.create({
      organizationId: req.ctx.organizationId,
      name: profile.email ? `Gmail - ${profile.email}` : 'Gmail account',
      channel: 'EMAIL',
      provider: 'gmail_oauth',
      isDefault: true,
      configuration: { email: profile.email, sync: 'manual' },
      encryptedCredentials: encryption.encryptJson({
        accessToken: tokenPayload.access_token,
        refreshToken: tokenPayload.refresh_token,
        expiresIn: tokenPayload.expires_in,
        scope: tokenPayload.scope,
        email: profile.email,
      }),
    });
    return reply.type('text/html').send(`<html><body><h2>Gmail connected</h2><p>${account.name} is connected. You can close this tab and return to Settings.</p></body></html>`);
  });

  app.post('/channel-accounts/:id/gmail/sync', { preHandler: [requirePermission(PERMISSIONS.CHANNELS_MANAGE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const account = await repo.findById(req.ctx.organizationId, id);
    if (!account || account.channel !== 'EMAIL' || account.provider !== 'gmail_oauth') throw new NotFoundError('Gmail account', id);
    const credentials = encryption.decryptJson<{ accessToken?: string; refreshToken?: string }>(account.encryptedCredentials);
    const accessToken = await gmailAccessToken(credentials);
    const listResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=newer_than:14d -from:me', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const listPayload = await listResponse.json() as { messages?: Array<{ id: string }> };
    if (!listResponse.ok) throw new Error(`Gmail sync failed with ${listResponse.status}`);
    let imported = 0;
    let unmatched = 0;
    for (const item of listPayload.messages ?? []) {
      const messageResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const gmailMessage = await messageResponse.json() as GmailMessage;
      if (!messageResponse.ok) continue;
      const from = parseEmail(headerValue(gmailMessage, 'From'));
      if (!from) {
        unmatched += 1;
        continue;
      }
      const lead = await leadRepo.findByContact(req.ctx.organizationId, 'EMAIL', from.toLowerCase());
      if (!lead) {
        unmatched += 1;
        continue;
      }
      const conversation = await conversations.getOrCreate(req.ctx.organizationId, lead.id, 'EMAIL');
      await conversations.createMessage({
        organizationId: req.ctx.organizationId,
        leadId: lead.id,
        conversationId: conversation.id,
        direction: 'INBOUND',
        senderType: 'LEAD',
        content: gmailText(gmailMessage) || gmailMessage.snippet || '(No email body)',
        providerMessageId: item.id,
        metadata: {
          provider: 'gmail',
          from,
          subject: headerValue(gmailMessage, 'Subject'),
          receivedAt: headerValue(gmailMessage, 'Date'),
        },
      });
      imported += 1;
    }
    return { imported, unmatched, scanned: listPayload.messages?.length ?? 0 };
  });

  app.get('/channel-accounts/:id/baileys/status', { preHandler: [requirePermission(PERMISSIONS.CHANNELS_MANAGE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return baileysManager.status(req.ctx.organizationId, id);
  });

  app.post('/channel-accounts/:id/baileys/connect', { preHandler: [requirePermission(PERMISSIONS.CHANNELS_MANAGE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return baileysManager.connect(req.ctx.organizationId, id);
  });

  app.post('/channel-accounts/:id/baileys/disconnect', { preHandler: [requirePermission(PERMISSIONS.CHANNELS_MANAGE)] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return baileysManager.disconnect(req.ctx.organizationId, id);
  });
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: GmailPart[];
  };
}

async function gmailAccessToken(credentials: { accessToken?: string; refreshToken?: string }) {
  if (!credentials.refreshToken) {
    if (credentials.accessToken) return credentials.accessToken;
    throw new Error('Gmail account is missing OAuth tokens');
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Google OAuth client is not configured');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description ?? `Gmail token refresh failed with ${response.status}`);
  return payload.access_token;
}

function headerValue(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseEmail(value: string) {
  const match = value.match(/<([^>]+)>/) ?? value.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return (match?.[1] ?? '').trim().toLowerCase();
}

function gmailText(message: GmailMessage) {
  const payload = message.payload;
  const part = findTextPart(payload?.parts);
  const encoded = part?.body?.data ?? payload?.body?.data;
  if (!encoded) return '';
  return Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8').trim();
}

function findTextPart(parts?: GmailPart[]): GmailPart | null {
  for (const part of parts ?? []) {
    if (part.mimeType === 'text/plain' && part.body?.data) return part;
    const nested = findTextPart(part.parts);
    if (nested) return nested;
  }
  return null;
}

export async function webhookRoutes(app: FastifyInstance) {
  const accountRepo = new ChannelAccountRepository();
  const encryption = new EncryptionService(env.ENCRYPTION_KEY);
  const providerFactory = new ProviderFactory();
  const campaignRepo = new CampaignRepository();
  const leadRepo = new LeadRepository();
  const conversations = new ConversationRepository();
  const normalizer = new ContactNormalizationService();
  const autoReply = new AiAutoReplyService();

  app.post('/webhooks/email/:accountId', async (req, reply) => handleWebhook('EMAIL', req, reply));
  app.post('/webhooks/sms/:accountId', async (req, reply) => handleWebhook('SMS', req, reply));
  app.post('/webhooks/whatsapp/:accountId', async (req, reply) => handleWebhook('WHATSAPP', req, reply));

  async function handleWebhook(channel: 'EMAIL' | 'SMS' | 'WHATSAPP', req: FastifyRequest, reply: FastifyReply) {
    const { accountId } = req.params as { accountId: string };
    const account = await accountRepo.findRawById(accountId);
    if (!account) throw new NotFoundError('Channel account', accountId);
    if (account.channel !== channel) throw new NotFoundError('Channel account', accountId);
    const credentials = encryption.decryptJson(account.encryptedCredentials);
    const provider = providerFactory.create({
      channel,
      provider: account.provider,
      configuration: account.configuration as Record<string, unknown>,
      credentials,
      accountId: account.id,
    });
    if (!provider.verifyWebhook(req, req.body)) {
      throw new UnauthorizedError('Invalid webhook signature');
    }

    for (const event of provider.normalize(req.body)) {
      const inserted = await campaignRepo.createWebhookEvent({
        organizationId: account.organizationId,
        channelAccountId: account.id,
        provider: account.provider,
        providerEventId: event.providerEventId,
        channel: event.channel,
        eventType: event.eventType,
        payload: req.body as Record<string, unknown>,
      });
      if (!inserted || event.direction !== 'INBOUND' || !event.from || !event.content) continue;

      const normalized = normalizer.normalize(channel, event.from);
      const lead = await leadRepo.findByContact(account.organizationId, channel, normalized.normalizedValue);
      if (!lead) continue;
      const conversation = await conversations.getOrCreate(account.organizationId, lead.id, channel);
      await conversations.createMessage({
        organizationId: account.organizationId,
        conversationId: conversation.id,
        leadId: lead.id,
        direction: 'INBOUND',
        senderType: 'LEAD',
        content: event.content,
        providerMessageId: event.providerMessageId,
        metadata: { providerEventId: event.providerEventId },
      });
      await db.update(campaignEnrollments).set({
        lastOutcome: 'REPLIED',
        updatedAt: new Date(),
      }).where(and(
        eq(campaignEnrollments.organizationId, account.organizationId),
        eq(campaignEnrollments.leadId, lead.id),
        eq(campaignEnrollments.status, 'ACTIVE'),
      ));
      if (channel === 'WHATSAPP' || channel === 'SMS') {
        void autoReply.maybeReply({
          organizationId: account.organizationId,
          leadId: lead.id,
          conversationId: conversation.id,
          channel,
          to: normalized.normalizedValue,
          message: event.content,
        }).catch((error: unknown) => app.log.warn({ error }, 'AI auto-reply failed'));
      }
    }

    return reply.code(200).send({ received: true });
  }
}
