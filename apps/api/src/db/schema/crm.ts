import {
  boolean,
  date,
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  customType,
} from 'drizzle-orm/pg-core';
import { organizations, organizationMembers, users } from './auth';

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
});

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  company: varchar('company', { length: 255 }),
  pitch: text('pitch'),
  info: text('info'),
  comments: text('comments'),
  status: varchar('status', { length: 50 }).notNull().default('NEW'),
  source: varchar('source', { length: 100 }),
  location: varchar('location', { length: 255 }),
  businessSize: varchar('business_size', { length: 30 }),
  website: text('website'),
  otherLinks: jsonb('other_links').notNull().default([]),
  ratings: varchar('ratings', { length: 50 }),
  score: integer('score'),
  priority: varchar('priority', { length: 30 }),
  importId: uuid('import_id'),
  ownerId: uuid('owner_id').references(() => organizationMembers.id, { onDelete: 'set null' }),
  timezone: varchar('timezone', { length: 100 }).notNull().default('Asia/Kolkata'),
  doNotContact: boolean('do_not_contact').notNull().default(false),
  optedOut: boolean('opted_out').notNull().default(false),
  wrongNumber: boolean('wrong_number').notNull().default(false),
  blocked: boolean('blocked').notNull().default(false),
  dailyContactCap: integer('daily_contact_cap').notNull().default(3),
  perLeadContactCap: integer('per_lead_contact_cap').notNull().default(10),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const leadContacts = pgTable(
  'lead_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 30 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    normalizedValue: varchar('normalized_value', { length: 255 }).notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    validationStatus: varchar('validation_status', { length: 30 }).notNull().default('UNKNOWN'),
    lineType: varchar('line_type', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgChannelValueUnique: uniqueIndex('lead_contacts_org_channel_value_uq').on(
      table.organizationId,
      table.channel,
      table.normalizedValue,
    ),
  }),
);

export const customFields = pgTable(
  'custom_fields',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 100 }).notNull(),
    label: varchar('label', { length: 100 }).notNull(),
    type: varchar('type', { length: 30 }).notNull(),
    required: boolean('required').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgKeyUnique: uniqueIndex('custom_fields_org_key_uq').on(table.organizationId, table.key),
  }),
);

export const leadCustomValues = pgTable(
  'lead_custom_values',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    customFieldId: uuid('custom_field_id').notNull().references(() => customFields.id, { onDelete: 'cascade' }),
    value: jsonb('value'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    leadFieldUnique: uniqueIndex('lead_custom_values_lead_field_uq').on(table.leadId, table.customFieldId),
  }),
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgNameUnique: uniqueIndex('tags_org_name_uq').on(table.organizationId, table.name),
  }),
);

export const leadTags = pgTable(
  'lead_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    leadTagUnique: uniqueIndex('lead_tags_lead_tag_uq').on(table.leadId, table.tagId),
  }),
);

export const suppressionEntries = pgTable('suppression_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  channel: varchar('channel', { length: 30 }),
  reason: varchar('reason', { length: 50 }).notNull(),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const leadImports = pgTable('lead_imports', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull().default('Imported leads'),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  filePath: text('file_path').notNull(),
  status: varchar('status', { length: 30 }).notNull().default('QUEUED'),
  summary: jsonb('summary').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 30 }).notNull(),
    unreadCount: integer('unread_count').notNull().default(0),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    customerServiceWindowExpiresAt: timestamp('customer_service_window_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgLeadChannelUnique: uniqueIndex('conversations_org_lead_channel_uq').on(
      table.organizationId,
      table.leadId,
      table.channel,
    ),
  }),
);

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  direction: varchar('direction', { length: 30 }).notNull(),
  senderType: varchar('sender_type', { length: 30 }).notNull(),
  senderId: uuid('sender_id'),
  content: text('content').notNull(),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const communicationEvents = pgTable('communication_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  channel: varchar('channel', { length: 30 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = pgTable('campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  audience: jsonb('audience').notNull().default({}),
  scheduleWindow: jsonb('schedule_window').notNull().default({ startHour: 9, endHour: 20 }),
  timezone: varchar('timezone', { length: 100 }).notNull().default('Asia/Kolkata'),
  status: varchar('status', { length: 30 }).notNull().default('DRAFT'),
  aiAgentId: uuid('ai_agent_id'),
  qualificationProfileId: uuid('qualification_profile_id'),
  launchedAt: timestamp('launched_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const campaignSteps = pgTable(
  'campaign_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    channel: varchar('channel', { length: 30 }).notNull(),
    delayMinutes: integer('delay_minutes').notNull().default(0),
    subject: varchar('subject', { length: 255 }),
    template: text('template').notNull(),
    configuration: jsonb('configuration').notNull().default({}),
    retryPolicy: jsonb('retry_policy').notNull().default({ attempts: 3, backoffMs: 60000 }),
    conditions: jsonb('conditions').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    campaignPositionUnique: uniqueIndex('campaign_steps_campaign_position_uq').on(table.campaignId, table.position),
  }),
);

export const campaignRuns = pgTable(
  'campaign_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    status: varchar('status', { length: 30 }).notNull().default('DRAFT'),
    audience: jsonb('audience').notNull().default({}),
    audienceSnapshot: jsonb('audience_snapshot').notNull().default([]),
    selectedChannels: jsonb('selected_channels').notNull().default([]),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    timezone: varchar('timezone', { length: 100 }).notNull().default('Asia/Kolkata'),
    scheduleWindow: jsonb('schedule_window').notNull().default({ startHour: 9, endHour: 20 }),
    sendingDays: jsonb('sending_days').notNull().default([1, 2, 3, 4, 5]),
    rateLimitPerHour: integer('rate_limit_per_hour').notNull().default(100),
    totalLeads: integer('total_leads').notNull().default(0),
    eligibleLeads: integer('eligible_leads').notNull().default(0),
    excludedLeads: integer('excluded_leads').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgCampaignCreatedIndex: index('campaign_runs_org_campaign_created_idx').on(table.organizationId, table.campaignId, table.createdAt),
  }),
);

export const campaignEnrollments = pgTable(
  'campaign_enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    campaignRunId: uuid('campaign_run_id').references(() => campaignRuns.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
    currentStepId: uuid('current_step_id').references(() => campaignSteps.id, { onDelete: 'set null' }),
    nextActionAt: timestamp('next_action_at', { withTimezone: true }),
    lastOutcome: varchar('last_outcome', { length: 100 }),
    exclusionReason: varchar('exclusion_reason', { length: 100 }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    runLeadUnique: uniqueIndex('campaign_enrollments_run_lead_uq').on(table.campaignRunId, table.leadId),
  }),
);

export const campaignStepExecutions = pgTable(
  'campaign_step_executions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    campaignRunId: uuid('campaign_run_id').references(() => campaignRuns.id, { onDelete: 'cascade' }),
    enrollmentId: uuid('enrollment_id').notNull().references(() => campaignEnrollments.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id').notNull().references(() => campaignSteps.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 30 }).notNull().default('QUEUED'),
    attempt: integer('attempt').notNull().default(0),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    outcome: varchar('outcome', { length: 100 }),
    error: text('error'),
    metadata: jsonb('metadata').notNull().default({}),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    enrollmentStepUnique: uniqueIndex('campaign_step_executions_enrollment_step_uq').on(table.enrollmentId, table.stepId),
  }),
);

export const channelAccounts = pgTable('channel_accounts', {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    channel: varchar('channel', { length: 30 }).notNull(),
    provider: varchar('provider', { length: 100 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    configuration: jsonb('configuration').notNull().default({}),
    encryptedCredentials: text('encrypted_credentials').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const whatsappSessions = pgTable(
  'whatsapp_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    channelAccountId: uuid('channel_account_id').notNull().references(() => channelAccounts.id, { onDelete: 'cascade' }),
    encryptedAuthState: text('encrypted_auth_state').notNull(),
    status: varchar('status', { length: 30 }).notNull().default('DISCONNECTED'),
    phoneNumber: varchar('phone_number', { length: 50 }),
    lastError: text('last_error'),
    lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountUnique: uniqueIndex('whatsapp_sessions_channel_account_uq').on(table.channelAccountId),
  }),
);

export const organizationIntegrations = pgTable('organization_integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 30 }).notNull(),
  provider: varchar('provider', { length: 100 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  configuration: jsonb('configuration').notNull().default({}),
  encryptedCredentials: text('encrypted_credentials').notNull(),
  credentialsFingerprint: varchar('credentials_fingerprint', { length: 64 }),
  lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
  lastTestStatus: varchar('last_test_status', { length: 30 }),
  lastTestMessage: text('last_test_message'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const providerWebhookEvents = pgTable(
  'provider_webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    channelAccountId: uuid('channel_account_id').notNull().references(() => channelAccounts.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 100 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 255 }).notNull(),
    channel: varchar('channel', { length: 30 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerEventUnique: uniqueIndex('provider_webhook_events_provider_event_uq').on(table.provider, table.providerEventId),
  }),
);

export const contactAttempts = pgTable('contact_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  channel: varchar('channel', { length: 30 }).notNull(),
  attemptedOn: date('attempted_on').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeBases = pgTable('knowledge_bases', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  knowledgeBaseId: uuid('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  sourceType: varchar('source_type', { length: 30 }).notNull(),
  sourceUrl: text('source_url'),
  filePath: text('file_path'),
  content: text('content'),
  summary: text('summary'),
  status: varchar('status', { length: 30 }).notNull().default('PENDING'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  knowledgeBaseId: uuid('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiAgents = pgTable('ai_agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 255 }).notNull(),
  tone: varchar('tone', { length: 255 }).notNull(),
  languages: jsonb('languages').notNull().default([]),
  objective: text('objective').notNull(),
  mustCollectFields: jsonb('must_collect_fields').notNull().default([]),
  allowedClaims: jsonb('allowed_claims').notNull().default([]),
  forbiddenClaims: jsonb('forbidden_claims').notNull().default([]),
  escalationRules: jsonb('escalation_rules').notNull().default([]),
  supportedChannels: jsonb('supported_channels').notNull().default([]),
  knowledgeBaseId: uuid('knowledge_base_id').references(() => knowledgeBases.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiAgentConfigs = pgTable('ai_agent_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => aiAgents.id, { onDelete: 'cascade' }),
  systemPrompt: text('system_prompt').notNull(),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const leadMemories = pgTable(
  'lead_memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    facts: jsonb('facts').notNull().default({}),
    summary: text('summary').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    leadMemoryUnique: uniqueIndex('lead_memories_org_lead_uq').on(table.organizationId, table.leadId),
  }),
);

export const aiRuns = pgTable('ai_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  agentId: uuid('agent_id').references(() => aiAgents.id, { onDelete: 'set null' }),
  model: varchar('model', { length: 100 }).notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  latencyMs: integer('latency_ms'),
  status: varchar('status', { length: 30 }).notNull(),
  error: text('error'),
  guardrailViolation: text('guardrail_violation'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const unknownQuestions = pgTable('unknown_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  question: text('question').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const qualificationProfiles = pgTable('qualification_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  threshold: integer('threshold').notNull().default(70),
  requiredFields: jsonb('required_fields').notNull().default([]),
  weights: jsonb('weights').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const leadQualifications = pgTable('lead_qualifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => qualificationProfiles.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
  result: varchar('result', { length: 30 }).notNull(),
  reason: text('reason').notNull(),
  facts: jsonb('facts').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const voiceCalls = pgTable('voice_calls', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  providerCallId: varchar('provider_call_id', { length: 255 }),
  status: varchar('status', { length: 50 }).notNull().default('QUEUED'),
  recordingUrl: text('recording_url'),
  transcript: text('transcript'),
  disclosure: text('disclosure'),
  metadata: jsonb('metadata').notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const voiceTranscriptSegments = pgTable('voice_transcript_segments', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  voiceCallId: uuid('voice_call_id').notNull().references(() => voiceCalls.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  speaker: varchar('speaker', { length: 30 }).notNull(),
  text: text('text').notNull(),
  startedAtMs: integer('started_at_ms'),
  endedAtMs: integer('ended_at_ms'),
  confidence: integer('confidence'),
  language: varchar('language', { length: 50 }),
  sttProvider: varchar('stt_provider', { length: 100 }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const voiceAgentTurns = pgTable('voice_agent_turns', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  voiceCallId: uuid('voice_call_id').notNull().references(() => voiceCalls.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  inputTranscript: text('input_transcript').notNull(),
  aiResponseText: text('ai_response_text').notNull(),
  ttsProvider: varchar('tts_provider', { length: 100 }),
  ttsVoiceId: varchar('tts_voice_id', { length: 255 }),
  latencyMs: integer('latency_ms'),
  toolsTriggered: jsonb('tools_triggered').notNull().default([]),
  escalationRequired: boolean('escalation_required').notNull().default(false),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pipelines = pgTable('pipelines', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    position: integer('position').notNull(),
    kind: varchar('kind', { length: 30 }).notNull().default('OPEN'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pipelinePositionUnique: uniqueIndex('pipeline_stages_pipeline_position_uq').on(table.pipelineId, table.position),
  }),
);

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id').notNull().references(() => pipelineStages.id, { onDelete: 'restrict' }),
    ownerId: uuid('owner_id').references(() => organizationMembers.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    value: integer('value'),
    expectedCloseDate: date('expected_close_date'),
    status: varchar('status', { length: 30 }).notNull().default('OPEN'),
    source: varchar('source', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => ({
    orgLeadUnique: uniqueIndex('opportunities_org_lead_uq').on(table.organizationId, table.leadId),
  }),
);

export const salesTasks = pgTable('sales_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => organizationMembers.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  status: varchar('status', { length: 30 }).notNull().default('OPEN'),
  priority: varchar('priority', { length: 30 }).notNull().default('MEDIUM'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').references(() => organizationMembers.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body'),
  link: text('link'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }),
    entityId: uuid('entity_id'),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    idempotencyKey: varchar('idempotency_key', { length: 255 }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdempotencyUnique: uniqueIndex('events_org_idempotency_uq').on(table.organizationId, table.idempotencyKey),
  }),
);
