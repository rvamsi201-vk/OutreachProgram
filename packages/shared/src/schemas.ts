import { z } from 'zod';

// ─── Auth Schemas ────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  organizationName: z.string().min(1).max(255).trim(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const switchOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
});
export type SwitchOrganizationInput = z.infer<typeof switchOrganizationSchema>;

// ─── User Schemas ────────────────────────────────────────────────

export const inviteUserSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
  role: z.enum(['ADMIN', 'MANAGER', 'SALESPERSON', 'VIEWER']),
  teamId: z.string().uuid().optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'SALESPERSON', 'VIEWER']),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

// ─── Organization Schemas ────────────────────────────────────────

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  defaultCountry: z
    .string()
    .length(2)
    .toUpperCase()
    .optional()
    .default('IN'),
  timezone: z.string().max(100).optional(),
  settings: z.record(z.unknown()).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

// ─── Team Schemas ────────────────────────────────────────────────

export const createTeamSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().max(500).optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const addTeamMemberSchema = z.object({
  memberId: z.string().uuid(),
});
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

// ─── Common Schemas ──────────────────────────────────────────────

export const paginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).optional(),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});
export type UuidParam = z.infer<typeof uuidParamSchema>;

// Lead CRM schemas
export const leadStatusSchema = z.enum([
  'NEW',
  'CONTACTED',
  'ENGAGED',
  'QUALIFIED',
  'NURTURE',
  'NOT_QUALIFIED',
  'CONVERTED',
  'LOST',
]);

export const contactChannelSchema = z.enum(['VOICE', 'WHATSAPP', 'SMS', 'EMAIL']);

export const leadContactInputSchema = z.object({
  channel: contactChannelSchema,
  value: z.string().min(1).max(255),
  isPrimary: z.boolean().optional().default(false),
});

export const createLeadSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  company: z.string().max(255).trim().optional().nullable(),
  pitch: z.string().max(5000).trim().optional().nullable(),
  info: z.string().max(10000).trim().optional().nullable(),
  comments: z.string().max(10000).trim().optional().nullable(),
  status: leadStatusSchema.optional().default('NEW'),
  source: z.string().max(100).trim().optional().nullable(),
  location: z.string().max(255).trim().optional().nullable(),
  businessSize: z.enum(['SOLO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE', 'UNKNOWN']).optional().nullable(),
  website: z.string().max(1000).trim().optional().nullable(),
  otherLinks: z.array(z.string().max(1000).trim()).optional().default([]),
  ratings: z.string().max(50).trim().optional().nullable(),
  score: z.coerce.number().int().min(0).max(100).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().nullable(),
  importId: z.string().uuid().optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  timezone: z.string().max(100).optional().default('Asia/Kolkata'),
  doNotContact: z.boolean().optional().default(false),
  optedOut: z.boolean().optional().default(false),
  wrongNumber: z.boolean().optional().default(false),
  blocked: z.boolean().optional().default(false),
  contacts: z.array(leadContactInputSchema).optional().default([]),
  tags: z.array(z.string().min(1).max(100).trim()).optional().default([]),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().default({}),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema.partial().extend({
  contacts: z.array(leadContactInputSchema).optional(),
  tags: z.array(z.string().min(1).max(100).trim()).optional(),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const leadListQuerySchema = paginationSchema.extend({
  status: leadStatusSchema.optional(),
  ownerId: z.string().uuid().optional(),
  tag: z.string().max(100).optional(),
  businessTag: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  businessSize: z.enum(['SOLO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE', 'UNKNOWN']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  channel: contactChannelSchema.optional(),
  hasWebsite: z.enum(['yes', 'no']).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  importId: z.string().uuid().optional(),
  search: z.string().max(255).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'status', 'source', 'priority', 'score', 'location', 'businessSize']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

const externalCrmLeadRequestBaseSchema = z.object({
  baseUrl: z.string().url(),
  loginUrl: z.string().url().optional().nullable(),
  email: z.string().email().optional().nullable(),
  password: z.string().min(1).max(10_000).optional().nullable(),
  bearerToken: z.string().min(10).max(10_000).optional().nullable(),
  domain: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  area: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(250),
});

export const externalCrmLeadFetchSchema = externalCrmLeadRequestBaseSchema.superRefine((input, ctx) => {
  if (input.bearerToken || (input.email && input.password)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Provide external CRM email and password, or a bearer token.',
    path: ['email'],
  });
});
export type ExternalCrmLeadFetchInput = z.infer<typeof externalCrmLeadFetchSchema>;

export const externalCrmLeadImportSchema = externalCrmLeadRequestBaseSchema.extend({
  rows: z.array(z.record(z.unknown())).max(1000).optional(),
}).superRefine((input, ctx) => {
  if (input.rows?.length || input.bearerToken || (input.email && input.password)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Fetch and select leads, or provide external CRM credentials.',
    path: ['rows'],
  });
});
export type ExternalCrmLeadImportInput = z.infer<typeof externalCrmLeadImportSchema>;

export const tagSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  color: z.string().max(32).optional().nullable(),
});
export type TagInput = z.infer<typeof tagSchema>;

export const customFieldSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().min(1).max(100).trim(),
  type: z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'DATE']),
  required: z.boolean().optional().default(false),
});
export type CustomFieldInput = z.infer<typeof customFieldSchema>;

export const suppressionSchema = z.object({
  leadId: z.string().uuid(),
  channel: contactChannelSchema.optional().nullable(),
  reason: z.enum(['DO_NOT_CONTACT', 'OPTED_OUT', 'WRONG_NUMBER', 'BLOCKED']),
  notes: z.string().max(1000).optional().nullable(),
});
export type SuppressionInput = z.infer<typeof suppressionSchema>;

export const createMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  metadata: z.record(z.unknown()).optional().default({}),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

// Campaign schemas
export const campaignStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
]);

export const enrollmentStatusSchema = z.enum([
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'QUALIFIED',
  'OPTED_OUT',
  'FAILED',
]);

export const campaignConditionSchema = z
  .object({
    if: z.string().min(1).max(100),
    in: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).min(1).max(25),
  })
  .strict();
export type CampaignCondition = z.infer<typeof campaignConditionSchema>;

export const campaignAudienceSchema = z
  .object({
    savedFilters: leadListQuerySchema.partial().optional().default({}),
    tags: z.array(z.string().min(1).max(100)).optional().default([]),
    leadIds: z.array(z.string().uuid()).optional().default([]),
  })
  .default({ savedFilters: {}, tags: [], leadIds: [] });

export const campaignRunStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
]);

export const campaignRunAudienceSchema = z.object({
  mode: z.enum(['ALL', 'BATCHES', 'FILTERS', 'SELECTED']),
  importIds: z.array(z.string().uuid()).max(100).optional().default([]),
  leadIds: z.array(z.string().uuid()).max(10_000).optional().default([]),
  filters: leadListQuerySchema.partial().optional().default({}),
  tags: z.array(z.string().min(1).max(100)).max(100).optional().default([]),
});
export type CampaignRunAudienceInput = z.infer<typeof campaignRunAudienceSchema>;

export const campaignRunInputSchema = z.object({
  title: z.string().min(1).max(255).trim(),
  audience: campaignRunAudienceSchema,
  selectedChannels: z.array(z.enum(['EMAIL', 'SMS', 'WHATSAPP'])).min(1).max(3),
  scheduledAt: z.coerce.date().optional().nullable(),
  timezone: z.string().min(1).max(100).default('Asia/Kolkata'),
  scheduleWindow: z.object({
    startHour: z.coerce.number().int().min(0).max(23),
    endHour: z.coerce.number().int().min(1).max(24),
  }).refine((window) => window.startHour < window.endHour, 'End hour must be after start hour'),
  sendingDays: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
  rateLimitPerHour: z.coerce.number().int().min(1).max(10_000).default(100),
});
export type CampaignRunInput = z.infer<typeof campaignRunInputSchema>;

export const campaignStepSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.coerce.number().int().min(1),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']),
  delayMinutes: z.coerce.number().int().min(0).default(0),
  subject: z.string().max(255).optional().nullable(),
  template: z.string().min(1).max(10000),
  configuration: z.record(z.unknown()).optional().default({}),
  retryPolicy: z
    .object({
      attempts: z.coerce.number().int().min(1).max(10).default(3),
      backoffMs: z.coerce.number().int().min(1000).max(86_400_000).default(60_000),
    })
    .optional()
    .default({ attempts: 3, backoffMs: 60_000 }),
  conditions: z.array(campaignConditionSchema).optional().default([]),
});
export type CampaignStepInput = z.infer<typeof campaignStepSchema>;

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().max(1000).optional().nullable(),
  audience: campaignAudienceSchema,
  scheduleWindow: z
    .object({
      startHour: z.coerce.number().int().min(0).max(23).default(9),
      endHour: z.coerce.number().int().min(1).max(24).default(20),
    })
    .optional()
    .default({ startHour: 9, endHour: 20 }),
  timezone: z.string().max(100).optional().default('Asia/Kolkata'),
  aiAgentId: z.string().uuid().optional().nullable(),
  qualificationProfileId: z.string().uuid().optional().nullable(),
  steps: z.array(campaignStepSchema).min(1).default([]),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: campaignStatusSchema.optional(),
  steps: z.array(campaignStepSchema).optional(),
});
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const campaignListQuerySchema = paginationSchema.extend({
  status: campaignStatusSchema.optional(),
  search: z.string().max(255).optional(),
});
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;

export const channelAccountSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']),
  provider: z.string().min(1).max(100).trim(),
  isDefault: z.boolean().optional().default(false),
  configuration: z.record(z.unknown()).optional().default({}),
  credentials: z.record(z.string()).optional().default({}),
});
export type ChannelAccountInput = z.infer<typeof channelAccountSchema>;

export const integrationCategorySchema = z.enum([
  'AI',
  'WHATSAPP',
  'SMS',
  'EMAIL',
  'VOICE',
  'STT',
  'TTS',
]);
export type IntegrationCategory = z.infer<typeof integrationCategorySchema>;

export const integrationSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  category: integrationCategorySchema,
  provider: z.string().min(1).max(100).trim(),
  isDefault: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
  configuration: z.record(z.unknown()).optional().default({}),
  credentials: z.record(z.string().min(1)).optional().default({}),
});
export type IntegrationInput = z.infer<typeof integrationSchema>;

export const updateIntegrationSchema = integrationSchema.partial().extend({
  credentials: z.record(z.string().min(1)).optional(),
});
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>;

// AI, knowledge, and qualification schemas
export const aiAgentSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  role: z.string().min(1).max(255).trim(),
  tone: z.string().min(1).max(255).trim(),
  languages: z.array(z.string().min(1).max(50)).min(1).default(['English']),
  objective: z.string().min(1).max(1000).trim(),
  mustCollectFields: z.array(z.string().min(1).max(100)).default([]),
  allowedClaims: z.array(z.string().min(1).max(300)).default([]),
  forbiddenClaims: z.array(z.string().min(1).max(300)).default([]),
  escalationRules: z.array(z.string().min(1).max(300)).default([]),
  supportedChannels: z.array(z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'VOICE'])).default(['EMAIL', 'SMS', 'WHATSAPP']),
  knowledgeBaseId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
});
export type AiAgentInput = z.infer<typeof aiAgentSchema>;

const yesNoUnknownSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized || ['unknown', 'not yet specified', 'not specified', 'n/a', 'na', 'none', 'unsure'].includes(normalized)) return 'unknown';
  if (['yes', 'y', 'true', 'likely', 'confirmed'].includes(normalized)) return 'yes';
  if (['no', 'n', 'false'].includes(normalized)) return 'no';
  return normalized;
}, z.enum(['yes', 'no', 'unknown']));

const interestSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized || ['unknown', 'not yet specified', 'not specified', 'n/a', 'na', 'unsure'].includes(normalized)) return 'none';
  if (normalized.includes('high')) return 'high';
  if (normalized.includes('medium')) return 'medium';
  if (normalized.includes('low')) return 'low';
  if (normalized.includes('none') || normalized.includes('not interested')) return 'none';
  return normalized;
}, z.enum(['high', 'medium', 'low', 'none']));

const nullableTextSchema = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}, z.string().nullable());

export const extractedFactsSchema = z.object({
  need: yesNoUnknownSchema,
  budget: nullableTextSchema,
  timeline: nullableTextSchema,
  location: nullableTextSchema,
  decision_maker: yesNoUnknownSchema,
  interest: interestSchema,
  summary: z.coerce.string().max(600),
});
export type ExtractedFacts = z.infer<typeof extractedFactsSchema>;

export const aiToolRequestSchema = z.object({
  name: z.enum([
    'update_lead_facts',
    'schedule_callback',
    'mark_not_interested',
    'mark_wrong_number',
    'request_human',
    'end_conversation',
  ]),
  arguments: z.record(z.unknown()).default({}),
});
export type AiToolRequest = z.infer<typeof aiToolRequestSchema>;

export const structuredAiOutputSchema = z.object({
  response: z.string().min(1).max(2000),
  facts: extractedFactsSchema,
  tools: z.preprocess((value) => value ?? [], z.array(aiToolRequestSchema)).default([]),
  unknownQuestion: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'string') return ['true', 'yes', '1'].includes(value.trim().toLowerCase());
    return value;
  }, z.boolean()).default(false),
});
export type StructuredAiOutput = z.infer<typeof structuredAiOutputSchema>;

export const knowledgeBaseSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().max(1000).optional().nullable(),
});
export type KnowledgeBaseInput = z.infer<typeof knowledgeBaseSchema>;

export const documentUrlSchema = z.object({
  knowledgeBaseId: z.string().uuid(),
  url: z.string().url(),
});
export type DocumentUrlInput = z.infer<typeof documentUrlSchema>;

export const knowledgeTextDocumentSchema = z.object({
  knowledgeBaseId: z.string().uuid(),
  title: z.string().min(1).max(255).trim(),
  content: z.string().min(20).max(100_000).trim(),
  sourceType: z.enum(['ORGANIZATION', 'PRODUCT', 'FAQ', 'POLICY', 'OTHER']).default('OTHER'),
});
export type KnowledgeTextDocumentInput = z.infer<typeof knowledgeTextDocumentSchema>;

export const qualificationProfileSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  threshold: z.coerce.number().int().min(1).max(100).default(70),
  requiredFields: z.array(z.enum(['need', 'budget', 'timeline', 'location', 'decision_maker', 'interest'])).default(['need', 'decision_maker']),
  weights: z.object({
    need: z.coerce.number().int().min(0).max(100).default(30),
    budget: z.coerce.number().int().min(0).max(100).default(20),
    timeline: z.coerce.number().int().min(0).max(100).default(20),
    location: z.coerce.number().int().min(0).max(100).default(10),
    decision_maker: z.coerce.number().int().min(0).max(100).default(10),
    interest: z.coerce.number().int().min(0).max(100).default(10),
  }).default({
    need: 30,
    budget: 20,
    timeline: 20,
    location: 10,
    decision_maker: 10,
    interest: 10,
  }),
});
export type QualificationProfileInput = z.infer<typeof qualificationProfileSchema>;

// Sales pipeline, tasks, notifications, analytics
export const pipelineSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().max(1000).optional().nullable(),
  isDefault: z.boolean().optional().default(false),
});
export type PipelineInput = z.infer<typeof pipelineSchema>;

export const pipelineStageSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  position: z.coerce.number().int().min(1),
  kind: z.enum(['OPEN', 'WON', 'LOST']).optional().default('OPEN'),
});
export type PipelineStageInput = z.infer<typeof pipelineStageSchema>;

export const opportunitySchema = z.object({
  title: z.string().min(1).max(255).trim(),
  leadId: z.string().uuid(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  ownerId: z.string().uuid().optional().nullable(),
  value: z.coerce.number().min(0).optional().nullable(),
  expectedCloseDate: z.coerce.date().optional().nullable(),
  status: z.enum(['OPEN', 'WON', 'LOST']).optional().default('OPEN'),
  source: z.string().max(100).optional().nullable(),
});
export type OpportunityInput = z.infer<typeof opportunitySchema>;

export const taskSchema = z.object({
  title: z.string().min(1).max(255).trim(),
  description: z.string().max(1000).optional().nullable(),
  ownerId: z.string().uuid(),
  leadId: z.string().uuid().optional().nullable(),
  opportunityId: z.string().uuid().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
  status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional().default('OPEN'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().default('MEDIUM'),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const analyticsQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  campaignId: z.string().uuid().optional(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'VOICE']).optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
