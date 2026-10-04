import makeWASocket, {
  Browsers,
  BufferJSON,
  DEFAULT_CONNECTION_CONFIG,
  DisconnectReason,
  initAuthCreds,
  proto,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
  type WASocket,
} from '@whiskeysockets/baileys';
import postgres from 'postgres';
import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ChannelAccountRepository } from '../../repositories/channel-account.repository.js';
import { ConversationRepository } from '../../repositories/conversation.repository.js';
import { LeadRepository } from '../../repositories/lead.repository.js';
import { AiAutoReplyService } from '../ai/ai-auto-reply.service.js';
import { WhatsAppSessionRepository } from '../../repositories/whatsapp-session.repository.js';
import { ContactNormalizationService } from '../crm/normalization.service.js';
import { EncryptionService } from '../security/encryption.service.js';

type SessionStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED' | 'ERROR';
type StoredKeys = Record<string, Record<string, unknown>>;
interface StoredAuthState { creds: AuthenticationState['creds']; keys: StoredKeys }
interface RuntimeState { organizationId: string; socket?: WASocket; status: SessionStatus; qrDataUrl?: string; phoneNumber?: string; lastError?: string }

export class BaileysManager {
  private readonly sessions = new Map<string, RuntimeState>();
  private readonly accountLocks = new Set<string>();
  private readonly lockClient = postgres(env.DATABASE_URL, { max: 1, idle_timeout: 0 });
  private readonly encryption = new EncryptionService(env.ENCRYPTION_KEY);
  private readonly sessionRepo = new WhatsAppSessionRepository();
  private readonly accountRepo = new ChannelAccountRepository();
  private readonly leadRepo = new LeadRepository();
  private readonly conversations = new ConversationRepository();
  private readonly normalizer = new ContactNormalizationService();
  private readonly autoReply = new AiAutoReplyService();

  async connect(organizationId: string, accountId: string) {
    const account = await this.accountRepo.findById(organizationId, accountId);
    if (!account || account.channel !== 'WHATSAPP' || account.provider.toLowerCase() !== 'baileys') {
      throw new Error('A Baileys WhatsApp channel account is required');
    }
    const current = this.sessions.get(accountId);
    if (current?.socket && ['CONNECTING', 'QR_READY', 'CONNECTED'].includes(current.status)) return this.publicState(current);
    await this.acquireAccountLock(accountId);

    const { state, persist } = await this.loadAuthState(organizationId, accountId);
    const runtime: RuntimeState = { organizationId, status: 'CONNECTING' };
    this.sessions.set(accountId, runtime);
    await this.persistRuntime(accountId, runtime, state, persist);

    const baileysLogger = logger.child({ component: 'baileys', accountId });
    baileysLogger.level = env.BAILEYS_LOG_LEVEL;

    const socket = makeWASocket({
      auth: state,
      browser: Browsers.ubuntu(env.BAILEYS_BROWSER_NAME),
      waWebSocketUrl: env.BAILEYS_WEBSOCKET_URL ?? DEFAULT_CONNECTION_CONFIG.waWebSocketUrl,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      logger: baileysLogger,
    });
    runtime.socket = socket;

    socket.ev.on('creds.update', async (update) => {
      Object.assign(state.creds, update);
      await persist();
    });
    socket.ev.on('connection.update', async (update) => {
      if (update.qr) {
        runtime.status = 'QR_READY';
        runtime.qrDataUrl = await QRCode.toDataURL(update.qr, { width: 320, margin: 1 });
        await this.persistRuntime(accountId, runtime, state, persist);
      }
      if (update.connection === 'open') {
        runtime.status = 'CONNECTED';
        runtime.qrDataUrl = undefined;
        runtime.lastError = undefined;
        runtime.phoneNumber = socket.user?.id?.split(':')[0]?.split('@')[0];
        await this.persistRuntime(accountId, runtime, state, persist, true);
      }
      if (update.connection === 'close') {
        const statusCode = disconnectStatusCode(update.lastDisconnect?.error);
        runtime.status = statusCode === DisconnectReason.loggedOut ? 'DISCONNECTED' : 'ERROR';
        runtime.lastError = statusCode === DisconnectReason.loggedOut ? 'WhatsApp account logged out' : 'WhatsApp connection closed';
        runtime.socket = undefined;
        await this.persistRuntime(accountId, runtime, state, persist);
        if (statusCode === DisconnectReason.loggedOut) {
          await this.releaseAccountLock(accountId);
        }
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => void this.connect(organizationId, accountId).catch((error: unknown) => logger.warn({ error, accountId }, 'Baileys reconnect failed')), 3_000);
        }
      }
    });
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      logger.debug({
        accountId,
        type,
        count: messages.length,
        messageIds: messages.map((message) => message.key.id).filter(Boolean).slice(0, 5),
      }, 'Baileys messages.upsert received');
      for (const message of messages) await this.handleInbound(organizationId, accountId, message);
    });

    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return this.publicState(runtime);
  }

  async status(organizationId: string, accountId: string) {
    const account = await this.accountRepo.findById(organizationId, accountId);
    if (!account) throw new Error('Channel account not found');
    const runtime = this.sessions.get(accountId);
    if (runtime) return this.publicState(runtime);
    const stored = await this.sessionRepo.find(organizationId, accountId);
    return { status: stored?.status ?? 'DISCONNECTED', phoneNumber: stored?.phoneNumber, lastError: stored?.lastError, qrDataUrl: undefined };
  }

  async disconnect(organizationId: string, accountId: string) {
    const runtime = this.sessions.get(accountId);
    if (runtime?.socket) await runtime.socket.logout();
    this.sessions.delete(accountId);
    await this.sessionRepo.clear(organizationId, accountId);
    await this.releaseAccountLock(accountId);
    return { status: 'DISCONNECTED' as const };
  }

  async sendText(organizationId: string, accountId: string, phone: string, text: string) {
    let runtime = this.sessions.get(accountId);
    if (!runtime?.socket || runtime.status !== 'CONNECTED') {
      await this.connect(organizationId, accountId);
      runtime = this.sessions.get(accountId);
    }
    if (!runtime?.socket || runtime.status !== 'CONNECTED') throw new Error('WhatsApp is not connected. Scan the QR code in Settings first.');
    const digits = phone.replace(/\D/g, '');
    if (!digits) throw new Error('Invalid WhatsApp phone number');
    const response = await runtime.socket.sendMessage(`${digits}@s.whatsapp.net`, { text });
    return response?.key.id ?? `baileys_${Date.now()}`;
  }

  private async loadAuthState(organizationId: string, accountId: string) {
    const row = await this.sessionRepo.find(organizationId, accountId);
    const stored = row
      ? JSON.parse(this.encryption.decryptJson<{ payload: string }>(row.encryptedAuthState).payload, BufferJSON.reviver) as StoredAuthState
      : { creds: initAuthCreds(), keys: {} };
    const keys = stored.keys;
    const state: AuthenticationState = {
      creds: stored.creds,
      keys: {
        get: <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const values: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const id of ids) {
            let value = keys[type]?.[id] as SignalDataTypeMap[T] | undefined;
            if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value) as unknown as SignalDataTypeMap[T];
            if (value) values[id] = value;
          }
          return values;
        },
        set: async (data: SignalDataSet) => {
          for (const [type, entries] of Object.entries(data)) {
            keys[type] ??= {};
            for (const [id, value] of Object.entries(entries ?? {})) {
              if (value === null) delete keys[type]![id];
              else keys[type]![id] = value;
            }
          }
          await persist();
        },
      },
    };
    const persist = async () => {
      const payload = JSON.stringify({ creds: state.creds, keys }, BufferJSON.replacer);
      await this.sessionRepo.save({
        organizationId,
        channelAccountId: accountId,
        encryptedAuthState: this.encryption.encryptJson({ payload }),
        status: this.sessions.get(accountId)?.status ?? row?.status ?? 'DISCONNECTED',
      });
    };
    return { state, persist };
  }

  private async persistRuntime(accountId: string, runtime: RuntimeState, state: AuthenticationState, persist: () => Promise<void>, connected = false) {
    await persist();
    await this.sessionRepo.updateStatus(runtime.organizationId, accountId, {
      status: runtime.status,
      phoneNumber: runtime.phoneNumber,
      lastError: runtime.lastError,
      lastConnectedAt: connected ? new Date() : undefined,
    });
  }

  private publicState(runtime: RuntimeState) {
    return { status: runtime.status, qrDataUrl: runtime.qrDataUrl, phoneNumber: runtime.phoneNumber, lastError: runtime.lastError };
  }

  private async acquireAccountLock(accountId: string) {
    if (this.accountLocks.has(accountId)) return;
    const [row] = await this.lockClient<{ locked: boolean }[]>`
      select pg_try_advisory_lock(hashtext(${`baileys:${accountId}`})) as locked
    `;
    if (!row?.locked) {
      throw new Error('This WhatsApp account is already connected by another API process. Stop the duplicate API server and reconnect Baileys.');
    }
    this.accountLocks.add(accountId);
  }

  private async releaseAccountLock(accountId: string) {
    if (!this.accountLocks.has(accountId)) return;
    await this.lockClient`
      select pg_advisory_unlock(hashtext(${`baileys:${accountId}`}))
    `;
    this.accountLocks.delete(accountId);
  }

  private async handleInbound(organizationId: string, accountId: string, message: proto.IWebMessageInfo) {
    if (message.key.fromMe || !message.key.remoteJid || message.key.remoteJid.endsWith('@g.us') || message.key.remoteJid === 'status@broadcast') return;
    const content = extractTextMessage(message.message);
    if (!content) {
      logger.debug({ accountId, remoteJid: message.key.remoteJid, providerMessageId: message.key.id }, 'Ignored inbound WhatsApp message without text content');
      return;
    }
    const phoneKey = message.key as proto.IMessageKey & { senderPn?: string | null; participantPn?: string | null };
    const phone = resolveMessagePhone(message);
    if (!phone) {
      logger.warn({
        accountId,
        remoteJid: message.key.remoteJid,
        senderPn: phoneKey.senderPn,
        participantPn: phoneKey.participantPn,
        providerMessageId: message.key.id,
      }, 'Inbound WhatsApp message did not contain a usable phone number');
      return;
    }
    const normalized = this.normalizer.normalize('WHATSAPP', phone);
    const lead = await this.leadRepo.findByContact(organizationId, 'WHATSAPP', normalized.normalizedValue);
    if (!lead) {
      logger.warn({
        accountId,
        remoteJid: message.key.remoteJid,
        senderPn: phoneKey.senderPn,
        participantPn: phoneKey.participantPn,
        normalizedValue: normalized.normalizedValue,
        validationStatus: normalized.validationStatus,
        providerMessageId: message.key.id,
      }, 'Inbound WhatsApp message had no matching lead contact');
      return;
    }
    logger.info({ accountId, leadId: lead.id, conversationChannel: 'WHATSAPP', providerMessageId: message.key.id }, 'Inbound WhatsApp message matched lead');
    const conversation = await this.conversations.getOrCreate(organizationId, lead.id, 'WHATSAPP');
    await this.conversations.createMessage({
      organizationId,
      conversationId: conversation.id,
      leadId: lead.id,
      direction: 'INBOUND',
      senderType: 'LEAD',
      content,
      providerMessageId: message.key.id ?? undefined,
      metadata: { provider: 'baileys' },
      createdAt: messageTimestampToDate(message.messageTimestamp),
    });
    void this.autoReply.maybeReply({
      organizationId,
      leadId: lead.id,
      conversationId: conversation.id,
      channel: 'WHATSAPP',
      to: normalized.normalizedValue,
      message: content,
      sendReply: async (body, metadata) => {
        const providerMessageId = await this.sendText(organizationId, accountId, normalized.normalizedValue, body);
        return { providerMessageId, status: 'SENT', metadata };
      },
    }).catch((error: unknown) => logger.warn({ error }, 'AI WhatsApp auto-reply failed'));
  }
}

function resolveMessagePhone(message: proto.IWebMessageInfo) {
  const key = message.key as proto.IMessageKey & { senderPn?: string | null; participantPn?: string | null };
  const candidates = [
    key.senderPn,
    key.participantPn,
    key.remoteJid?.endsWith('@s.whatsapp.net') ? key.remoteJid : null,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const user = candidate.split('@')[0]?.split(':')[0] ?? '';
    const digits = user.replace(/\D/g, '');
    if (digits) return digits;
  }
  return null;
}

function messageTimestampToDate(timestamp: proto.IWebMessageInfo['messageTimestamp']) {
  if (!timestamp) return undefined;
  const seconds = typeof timestamp === 'number'
    ? timestamp
    : typeof timestamp === 'object' && 'toNumber' in timestamp && typeof timestamp.toNumber === 'function'
      ? timestamp.toNumber()
      : Number(timestamp);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : undefined;
}

function extractTextMessage(message: proto.IMessage | null | undefined): string | null {
  const unwrapped = unwrapMessage(message);
  const content = unwrapped?.conversation
    ?? unwrapped?.extendedTextMessage?.text
    ?? unwrapped?.imageMessage?.caption
    ?? unwrapped?.videoMessage?.caption
    ?? unwrapped?.documentMessage?.caption
    ?? unwrapped?.buttonsResponseMessage?.selectedDisplayText
    ?? unwrapped?.buttonsResponseMessage?.selectedButtonId
    ?? unwrapped?.templateButtonReplyMessage?.selectedDisplayText
    ?? unwrapped?.templateButtonReplyMessage?.selectedId
    ?? unwrapped?.listResponseMessage?.title
    ?? unwrapped?.listResponseMessage?.singleSelectReply?.selectedRowId;
  return typeof content === 'string' && content.trim() ? content.trim() : null;
}

function unwrapMessage(message: proto.IMessage | null | undefined): proto.IMessage | null | undefined {
  let current = message;
  for (let index = 0; index < 5; index += 1) {
    if (current?.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current?.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current?.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current?.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    else return current;
  }
  return current;
}

function disconnectStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const output = 'output' in error ? error.output : undefined;
  if (!output || typeof output !== 'object') return undefined;
  const statusCode = 'statusCode' in output ? output.statusCode : undefined;
  return typeof statusCode === 'number' ? statusCode : undefined;
}

export const baileysManager = new BaileysManager();
