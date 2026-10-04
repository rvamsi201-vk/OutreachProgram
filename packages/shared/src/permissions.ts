/** Permission keys used across frontend and backend */

export const PERMISSIONS = {
  // Leads
  LEADS_READ: 'leads.read',
  LEADS_CREATE: 'leads.create',
  LEADS_UPDATE: 'leads.update',
  LEADS_DELETE: 'leads.delete',
  LEADS_IMPORT: 'leads.import',

  // Campaigns
  CAMPAIGNS_READ: 'campaigns.read',
  CAMPAIGNS_CREATE: 'campaigns.create',
  CAMPAIGNS_LAUNCH: 'campaigns.launch',
  CAMPAIGNS_PAUSE: 'campaigns.pause',

  // Conversations
  CONVERSATIONS_READ: 'conversations.read',
  CONVERSATIONS_REPLY: 'conversations.reply',

  // Analytics
  ANALYTICS_READ: 'analytics.read',

  // Users
  USERS_INVITE: 'users.invite',
  USERS_REMOVE: 'users.remove',

  // Settings
  SETTINGS_UPDATE: 'settings.update',
  BILLING_MANAGE: 'billing.manage',
  CHANNELS_MANAGE: 'channels.manage',
  AI_MANAGE: 'ai.manage',
  KNOWLEDGE_MANAGE: 'knowledge.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** All permissions as an array for seeding */
export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Role → permissions mapping. ADMIN gets all. */
export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: ALL_PERMISSIONS.filter(
    (p) =>
      p !== PERMISSIONS.BILLING_MANAGE &&
      p !== PERMISSIONS.USERS_REMOVE &&
      p !== PERMISSIONS.CHANNELS_MANAGE
  ),
  SALESPERSON: [
    PERMISSIONS.LEADS_READ,
    PERMISSIONS.LEADS_UPDATE,
    PERMISSIONS.CONVERSATIONS_READ,
    PERMISSIONS.CONVERSATIONS_REPLY,
  ],
  VIEWER: ALL_PERMISSIONS.filter((p) => p.endsWith('.read')),
} as const;
