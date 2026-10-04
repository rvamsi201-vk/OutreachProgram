import 'dotenv/config';
import * as argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from '@ai-crm/shared';
import { db } from './connection.js';
import {
  aiAgentConfigs,
  aiAgents,
  aiRuns,
  auditLogs,
  campaignEnrollments,
  campaignRuns,
  campaigns,
  campaignStepExecutions,
  campaignSteps,
  channelAccounts,
  communicationEvents,
  contactAttempts,
  conversations,
  customFields,
  documents,
  events,
  knowledgeBases,
  leadContacts,
  leadCustomValues,
  leadMemories,
  leadQualifications,
  leadTags,
  leads,
  messages,
  notifications,
  opportunities,
  organizationMembers,
  organizations,
  permissions,
  pipelineStages,
  pipelines,
  qualificationProfiles,
  rolePermissions,
  roles,
  salesTasks,
  suppressionEntries,
  tags,
  unknownQuestions,
  users,
  voiceAgentTurns,
  voiceCalls,
  voiceTranscriptSegments,
} from './schema/index.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { EncryptionService } from '../services/security/encryption.service.js';

const DEMO_EMAIL = 'admin@demo.local';
const DEMO_PASSWORD = 'Demo@12345';
const DEMO_ORG_SLUG = 'demo-ai-outreach';

async function seed() {
  logger.info('Seeding database...');

  try {
    await seedPermissionsAndRoles();
    const demo = await seedDemoWorkspace();

    logger.info(
      {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        organizationId: demo.organizationId,
      },
      'Demo workspace ready',
    );
    logger.info('Database seeding completed');
  } catch (error) {
    logger.error({ error }, 'Seeding failed');
    process.exit(1);
  }

  process.exit(0);
}

async function seedPermissionsAndRoles() {
  logger.info('Seeding permissions...');

  for (const key of ALL_PERMISSIONS) {
    const existing = await db.query.permissions.findFirst({
      where: eq(permissions.key, key),
    });
    if (!existing) {
      await db.insert(permissions).values({
        key,
        description: key.replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      });
    }
  }

  const systemRoles = ['ADMIN', 'MANAGER', 'SALESPERSON', 'VIEWER'] as const;
  const allPerms = await db.query.permissions.findMany();
  const permMap = new Map(allPerms.map((p) => [p.key, p.id]));

  for (const roleName of systemRoles) {
    let role = await db.query.roles.findFirst({
      where: and(eq(roles.name, roleName), isNull(roles.organizationId)),
    });

    if (!role) {
      const [inserted] = await db
        .insert(roles)
        .values({
          name: roleName,
          description: `System ${roleName.toLowerCase()} role`,
          isSystem: new Date(),
        })
        .returning();
      role = inserted;
    }

    if (!role) continue;

    const rolePerms = ROLE_PERMISSIONS[roleName];
    if (!rolePerms) continue;

    for (const permKey of rolePerms) {
      const permId = permMap.get(permKey);
      if (!permId) continue;

      const existing = await db.query.rolePermissions.findFirst({
        where: and(eq(rolePermissions.roleId, role.id), eq(rolePermissions.permissionId, permId)),
      });

      if (!existing) {
        await db.insert(rolePermissions).values({
          roleId: role.id,
          permissionId: permId,
        });
      }
    }
  }
}

async function seedDemoWorkspace() {
  const encryption = new EncryptionService(env.ENCRYPTION_KEY);
  const now = new Date();

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  let user = await db.query.users.findFirst({ where: eq(users.email, DEMO_EMAIL) });
  if (!user) {
    [user] = await db.insert(users).values({
      email: DEMO_EMAIL,
      passwordHash,
      firstName: 'Demo',
      lastName: 'Admin',
      isActive: now,
    }).returning();
  } else {
    [user] = await db.update(users)
      .set({ passwordHash, firstName: 'Demo', lastName: 'Admin', isActive: now, updatedAt: now })
      .where(eq(users.id, user.id))
      .returning();
  }

  let organization = await db.query.organizations.findFirst({
    where: eq(organizations.slug, DEMO_ORG_SLUG),
  });
  if (!organization) {
    [organization] = await db.insert(organizations).values({
      name: 'Demo AI Outreach CRM',
      slug: DEMO_ORG_SLUG,
      defaultCountry: 'IN',
      timezone: 'Asia/Kolkata',
      settings: {
        seed: true,
        guide: 'Use the User Guide tab below Settings for the complete operating flow.',
      },
    }).returning();
  }

  if (!user || !organization) throw new Error('Demo user or organization could not be created');
  const demoUser = user;
  const demoOrganization = organization;

  let member = await db.query.organizationMembers.findFirst({
    where: and(eq(organizationMembers.organizationId, demoOrganization.id), eq(organizationMembers.userId, demoUser.id)),
  });
  if (!member) {
    [member] = await db.insert(organizationMembers).values({
      organizationId: demoOrganization.id,
      userId: demoUser.id,
      role: 'ADMIN',
      status: 'ACTIVE',
    }).returning();
  } else if (member.role !== 'ADMIN' || member.status !== 'ACTIVE') {
    [member] = await db.update(organizationMembers)
      .set({ role: 'ADMIN', status: 'ACTIVE', updatedAt: now })
      .where(eq(organizationMembers.id, member.id))
      .returning();
  }

  if (!member) throw new Error('Demo organization member could not be created');
  const demoMember = member;

  await ensureAuditLog(demoOrganization.id, demoUser.id, 'seed.demo_workspace_ready', 'organization', demoOrganization.id);

  const whatsappAccount = await ensureChannelAccount({
    organizationId: demoOrganization.id,
    name: 'Primary WhatsApp',
    channel: 'WHATSAPP',
    provider: 'baileys',
    isDefault: true,
    configuration: { provider: 'baileys', browserName: 'AI Outreach CRM' },
    encryptedCredentials: encryption.encryptJson({}),
  });

  await ensureChannelAccount({
    organizationId: demoOrganization.id,
    name: 'Demo Email Sandbox',
    channel: 'EMAIL',
    provider: 'sandbox',
    isDefault: true,
    configuration: { provider: 'sandbox', note: 'Connect Gmail OAuth in Settings for live Gmail sync.' },
    encryptedCredentials: encryption.encryptJson({}),
  });

  const businessTag = await ensureTag(demoOrganization.id, 'business-sector', '#27364a');
  const gymTag = await ensureTag(demoOrganization.id, 'gym', '#1f7a4d');
  const hospitalTag = await ensureTag(demoOrganization.id, 'hospital', '#7a2d2d');
  const textileTag = await ensureTag(demoOrganization.id, 'textile-garments', '#2f5f8f');
  const schoolTag = await ensureTag(demoOrganization.id, 'school-preschool', '#7a5a1f');
  const demoTag = await ensureTag(demoOrganization.id, 'demo-seed', '#222222');

  const sourceField = await ensureCustomField(demoOrganization.id, 'crm_source', 'CRM source', 'text');
  const gapsField = await ensureCustomField(demoOrganization.id, 'gaps_found', 'Gaps found', 'json');

  const demoLeads: Array<{
    name: string;
    company: string;
    phone: string;
    email: string;
    tagIds: string[];
    source: string;
    location: string;
    website: string;
    ratings: string;
    score: number;
    priority: string;
    businessSize: string;
    pitch: string;
    info: string;
    gaps: Record<string, boolean>;
  }> = [
    {
      name: 'Arjun Fitness Studio',
      company: 'Arjun Fitness Studio',
      phone: '+919000000001',
      email: 'arjun.fitness@example.com',
      tagIds: [businessTag.id, gymTag.id, demoTag.id],
      source: 'seed',
      location: 'Koramangala, Bengaluru',
      website: 'https://arjunfitness.example.com',
      ratings: '4.7',
      score: 88,
      priority: 'high',
      businessSize: 'small',
      pitch: 'Help gym teams track trial bookings, member follow-ups, renewal reminders, and walk-in enquiries from one CRM.',
      info: 'A Bengaluru fitness studio that receives WhatsApp enquiries and needs better follow-up after trial classes.',
      gaps: { crm: true, follow_up: true, whatsapp_automation: true },
    },
    {
      name: 'CarePlus Day Hospital',
      company: 'CarePlus Day Hospital',
      phone: '+919000000002',
      email: 'careplus@example.com',
      tagIds: [businessTag.id, hospitalTag.id, demoTag.id],
      source: 'seed',
      location: 'Indiranagar, Bengaluru',
      website: 'https://careplus.example.com',
      ratings: '4.5',
      score: 82,
      priority: 'high',
      businessSize: 'medium',
      pitch: 'Help front-desk teams capture patient enquiries, appointment follow-ups, and callback tasks without making medical claims.',
      info: 'A small hospital with appointment enquiries across phone, WhatsApp, and email.',
      gaps: { crm: true, reminders: true, appointment_tracking: true },
    },
    {
      name: 'Motherland Garments Pvt Ltd',
      company: 'Motherland Garments Pvt Ltd',
      phone: '+919000000003',
      email: 'operations@motherlandgarments.example.com',
      tagIds: [businessTag.id, textileTag.id, demoTag.id],
      source: 'seed',
      location: 'Peenya, Bengaluru',
      website: 'https://motherlandgarments.example.com',
      ratings: '4.3',
      score: 76,
      priority: 'medium',
      businessSize: 'medium',
      pitch: 'Show how Lumron can connect textile enquiries, production follow-up, customer communication, and sales pipeline in one place.',
      info: 'Garments manufacturer evaluating ERP/CRM workflows for textile operations.',
      gaps: { crm: true, erp_visibility: true, order_follow_up: true },
    },
    {
      name: 'BrightSteps Preschool',
      company: 'BrightSteps Preschool',
      phone: '+919000000004',
      email: 'admissions@brightsteps.example.com',
      tagIds: [businessTag.id, schoolTag.id, demoTag.id],
      source: 'seed',
      location: 'Whitefield, Bengaluru',
      website: 'https://brightsteps.example.com',
      ratings: '4.8',
      score: 91,
      priority: 'high',
      businessSize: 'small',
      pitch: 'Help schools manage admission enquiries, parent callbacks, and visit scheduling from one CRM inbox.',
      info: 'Preschool with parent enquiries from Google listings and WhatsApp.',
      gaps: { crm: true, admission_follow_up: true, chatbot: false },
    },
  ];

  const seededLeads = [];
  for (const leadInput of demoLeads) {
    const lead = await ensureLead(demoOrganization.id, demoMember.id, leadInput);
    seededLeads.push(lead);
    await ensureLeadContact(demoOrganization.id, lead.id, 'WHATSAPP', leadInput.phone, leadInput.phone);
    await ensureLeadContact(demoOrganization.id, lead.id, 'SMS', leadInput.phone, leadInput.phone);
    await ensureLeadContact(demoOrganization.id, lead.id, 'EMAIL', leadInput.email, leadInput.email.toLowerCase());
    for (const tagId of leadInput.tagIds) await ensureLeadTag(demoOrganization.id, lead.id, tagId);
    await ensureCustomValue(demoOrganization.id, lead.id, sourceField.id, leadInput.source);
    await ensureCustomValue(demoOrganization.id, lead.id, gapsField.id, leadInput.gaps);
  }

  const suppressedLead = seededLeads[1]!;
  const existingSuppression = await db.query.suppressionEntries.findFirst({
    where: and(eq(suppressionEntries.organizationId, demoOrganization.id), eq(suppressionEntries.leadId, suppressedLead.id), eq(suppressionEntries.reason, 'OPTED_OUT')),
  });
  if (!existingSuppression) {
    await db.insert(suppressionEntries).values({
      organizationId: demoOrganization.id,
      leadId: suppressedLead.id,
      channel: 'WHATSAPP',
      reason: 'OPTED_OUT',
      notes: 'Seed example showing why some leads are excluded from campaign runs.',
      createdBy: demoUser.id,
    });
  }

  const knowledgeBase = await ensureKnowledgeBase(demoOrganization.id);
  await ensureDocument(demoOrganization.id, knowledgeBase.id);

  const agent = await ensureAgent(demoOrganization.id, knowledgeBase.id);
  const profile = await ensureQualificationProfile(demoOrganization.id);
  const campaign = await ensureCampaign(demoOrganization.id, demoUser.id, agent.id, profile.id);
  const step = await ensureCampaignStep(demoOrganization.id, campaign.id);
  const run = await ensureCampaignRun(demoOrganization.id, demoUser.id, campaign.id, seededLeads);

  const firstLead = seededLeads[0]!;
  const enrollment = await ensureEnrollment(demoOrganization.id, campaign.id, run.id, firstLead.id, step.id);
  await ensureStepExecution(demoOrganization.id, campaign.id, run.id, enrollment.id, step.id, firstLead.id);
  await ensureConversationSet(demoOrganization.id, firstLead.id, demoUser.id);
  await ensureLeadMemory(demoOrganization.id, firstLead.id);
  await ensureQualification(demoOrganization.id, firstLead.id, profile.id);
  await ensureUnknownQuestion(demoOrganization.id, firstLead.id);
  await ensureContactAttempt(demoOrganization.id, firstLead.id);
  await ensureCommunicationEvent(demoOrganization.id, firstLead.id);
  await ensureAiRuns(demoOrganization.id, firstLead.id, agent.id);

  const pipeline = await ensurePipeline(demoOrganization.id);
  const stages = await ensurePipelineStages(demoOrganization.id, pipeline.id);
  const opportunity = await ensureOpportunity(demoOrganization.id, firstLead.id, pipeline.id, stages[2]!.id, demoMember.id);
  await ensureTask(demoOrganization.id, demoMember.id, firstLead.id, opportunity.id);
  await ensureNotification(demoOrganization.id, demoUser.id, demoMember.id);
  await ensureSalesEvent(demoOrganization.id, firstLead.id, opportunity.id, campaign.id);
  await ensureVoiceSample(demoOrganization.id, firstLead.id);

  return { organizationId: demoOrganization.id, userId: demoUser.id, whatsappAccountId: whatsappAccount.id };
}

async function ensureChannelAccount(data: typeof channelAccounts.$inferInsert) {
  let account = await db.query.channelAccounts.findFirst({
    where: and(
      eq(channelAccounts.organizationId, data.organizationId),
      eq(channelAccounts.channel, data.channel),
      eq(channelAccounts.provider, data.provider),
      eq(channelAccounts.name, data.name),
    ),
  });
  if (!account) {
    if (data.isDefault) {
      await db.update(channelAccounts).set({ isDefault: false })
        .where(and(eq(channelAccounts.organizationId, data.organizationId), eq(channelAccounts.channel, data.channel)));
    }
    [account] = await db.insert(channelAccounts).values(data).returning();
  }
  return account!;
}

async function ensureTag(organizationId: string, name: string, color: string) {
  let tag = await db.query.tags.findFirst({ where: and(eq(tags.organizationId, organizationId), eq(tags.name, name)) });
  if (!tag) [tag] = await db.insert(tags).values({ organizationId, name, color }).returning();
  return tag!;
}

async function ensureCustomField(organizationId: string, key: string, label: string, type: string) {
  let field = await db.query.customFields.findFirst({ where: and(eq(customFields.organizationId, organizationId), eq(customFields.key, key)) });
  if (!field) [field] = await db.insert(customFields).values({ organizationId, key, label, type }).returning();
  return field!;
}

async function ensureLead(
  organizationId: string,
  ownerId: string,
  input: {
    name: string;
    company: string;
    source: string;
    location: string;
    website: string;
    ratings: string;
    score: number;
    priority: string;
    businessSize: string;
    pitch: string;
    info: string;
    gaps: Record<string, boolean>;
  },
) {
  let lead = await db.query.leads.findFirst({
    where: and(eq(leads.organizationId, organizationId), eq(leads.name, input.name)),
  });
  const values = {
    organizationId,
    name: input.name,
    company: input.company,
    pitch: input.pitch,
    info: input.info,
    comments: 'Seeded demo lead. Use it for campaign preview, Inbox, and pipeline testing.',
    status: 'NEW',
    source: input.source,
    location: input.location,
    businessSize: input.businessSize,
    website: input.website,
    ratings: input.ratings,
    score: input.score,
    priority: input.priority,
    ownerId,
    timezone: 'Asia/Kolkata',
    dailyContactCap: 3,
    perLeadContactCap: 10,
    metadata: { gaps_found: input.gaps, seed: true },
  };
  if (!lead) {
    [lead] = await db.insert(leads).values(values).returning();
  } else {
    [lead] = await db.update(leads).set({ ...values, updatedAt: new Date() }).where(eq(leads.id, lead.id)).returning();
  }
  return lead!;
}

async function ensureLeadContact(organizationId: string, leadId: string, channel: string, value: string, normalizedValue: string) {
  const existing = await db.query.leadContacts.findFirst({
    where: and(eq(leadContacts.organizationId, organizationId), eq(leadContacts.channel, channel), eq(leadContacts.normalizedValue, normalizedValue)),
  });
  if (!existing) {
    await db.insert(leadContacts).values({
      organizationId,
      leadId,
      channel,
      value,
      normalizedValue,
      isPrimary: true,
      validationStatus: 'VALID',
      lineType: channel === 'EMAIL' ? null : 'mobile',
    });
  }
}

async function ensureLeadTag(organizationId: string, leadId: string, tagId: string) {
  const existing = await db.query.leadTags.findFirst({
    where: and(eq(leadTags.leadId, leadId), eq(leadTags.tagId, tagId)),
  });
  if (!existing) await db.insert(leadTags).values({ organizationId, leadId, tagId });
}

async function ensureCustomValue(organizationId: string, leadId: string, customFieldId: string, value: unknown) {
  await db.insert(leadCustomValues).values({ organizationId, leadId, customFieldId, value })
    .onConflictDoUpdate({ target: [leadCustomValues.leadId, leadCustomValues.customFieldId], set: { value, updatedAt: new Date() } });
}

async function ensureKnowledgeBase(organizationId: string) {
  let kb = await db.query.knowledgeBases.findFirst({
    where: and(eq(knowledgeBases.organizationId, organizationId), eq(knowledgeBases.name, 'Lumron Demo Knowledge')),
  });
  const description = [
    'Company: Lumron provides CRM and ERP software for lead management, follow-up automation, customer communication, and sales tracking.',
    'Product: AI Outreach CRM helps teams import leads, run WhatsApp/Gmail campaigns, use AI agents, and handle replies in one inbox.',
    'Best fit: gyms, hospitals, textile/garments businesses, schools, and preschools with missed enquiries or weak follow-up.',
    'Allowed claims: explain CRM/ERP workflows, collect requirements, offer a human demo, and describe automation benefits.',
    'Restrictions: do not guarantee discounts, medical outcomes, legal advice, delivery dates, or lowest pricing.',
    'FAQ: Pricing depends on users, channels, data volume, and implementation scope. A human should confirm final commercials.',
  ].join('\n');
  if (!kb) [kb] = await db.insert(knowledgeBases).values({ organizationId, name: 'Lumron Demo Knowledge', description }).returning();
  else [kb] = await db.update(knowledgeBases).set({ description, updatedAt: new Date() }).where(eq(knowledgeBases.id, kb.id)).returning();
  return kb!;
}

async function ensureDocument(organizationId: string, knowledgeBaseId: string) {
  const fileName = 'seed-lumron-product-summary.md';
  let doc = await db.query.documents.findFirst({
    where: and(eq(documents.organizationId, organizationId), eq(documents.knowledgeBaseId, knowledgeBaseId), eq(documents.fileName, fileName)),
  });
  if (!doc) {
    [doc] = await db.insert(documents).values({
      organizationId,
      knowledgeBaseId,
      fileName,
      sourceType: 'TEXT',
      content: 'Lumron demo knowledge seeded from text. Use this item to see how knowledge is attached to agents.',
      summary: 'Lumron CRM/ERP helps businesses capture leads, automate follow-ups, and centralize WhatsApp/Gmail conversations.',
      status: 'READY',
    }).returning();
  }
  return doc!;
}

async function ensureAgent(organizationId: string, knowledgeBaseId: string) {
  let agent = await db.query.aiAgents.findFirst({
    where: and(eq(aiAgents.organizationId, organizationId), eq(aiAgents.name, 'Demo WhatsApp Sales Agent')),
  });
  const data = {
    organizationId,
    name: 'Demo WhatsApp Sales Agent',
    role: 'Sales Assistant',
    tone: 'Professional, friendly, concise',
    languages: ['English', 'Hindi', 'Kannada'],
    objective: 'Start and continue outreach conversations, understand requirements, and qualify whether the lead is interested.',
    mustCollectFields: ['need', 'budget', 'timeline', 'location', 'decision_maker'],
    allowedClaims: ['We can explain CRM/ERP workflows', 'We can arrange a human follow-up demo'],
    forbiddenClaims: ['guaranteed discount', 'lowest price guaranteed', 'medical advice', 'legal advice', 'fake delivery dates'],
    escalationRules: ['Escalate pricing, legal, medical, refund, or commitment questions to a human.'],
    supportedChannels: ['WHATSAPP', 'EMAIL', 'SMS', 'VOICE'],
    knowledgeBaseId,
    isActive: true,
  };
  const systemPrompt = 'You are a concise B2B sales assistant. Use the attached knowledge base, ask one clear question at a time, and obey restrictions.';
  if (!agent) {
    [agent] = await db.insert(aiAgents).values(data).returning();
    await db.insert(aiAgentConfigs).values({ organizationId, agentId: agent!.id, systemPrompt, config: data });
  } else {
    [agent] = await db.update(aiAgents).set({ ...data, updatedAt: new Date() }).where(eq(aiAgents.id, agent.id)).returning();
  }
  return agent!;
}

async function ensureQualificationProfile(organizationId: string) {
  let profile = await db.query.qualificationProfiles.findFirst({
    where: and(eq(qualificationProfiles.organizationId, organizationId), eq(qualificationProfiles.name, 'Default B2B Qualification')),
  });
  if (!profile) {
    [profile] = await db.insert(qualificationProfiles).values({
      organizationId,
      name: 'Default B2B Qualification',
      threshold: 70,
      requiredFields: ['need', 'budget', 'timeline', 'decision_maker'],
      weights: { need: 30, budget: 20, timeline: 20, decision_maker: 30 },
    }).returning();
  }
  return profile!;
}

async function ensureCampaign(organizationId: string, userId: string, aiAgentId: string, qualificationProfileId: string) {
  let campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.organizationId, organizationId), eq(campaigns.name, 'Demo AI WhatsApp Outreach')),
  });
  const data = {
    organizationId,
    name: 'Demo AI WhatsApp Outreach',
    description: 'Reusable AI WhatsApp outreach template seeded for local testing.',
    audience: { mode: 'filters', tags: ['demo-seed'] },
    scheduleWindow: { startHour: 9, endHour: 23 },
    timezone: 'Asia/Kolkata',
    status: 'ACTIVE',
    aiAgentId,
    qualificationProfileId,
    createdBy: userId,
  };
  if (!campaign) [campaign] = await db.insert(campaigns).values(data).returning();
  else [campaign] = await db.update(campaigns).set({ ...data, updatedAt: new Date() }).where(eq(campaigns.id, campaign.id)).returning();
  return campaign!;
}

async function ensureCampaignStep(organizationId: string, campaignId: string) {
  let step = await db.query.campaignSteps.findFirst({
    where: and(eq(campaignSteps.organizationId, organizationId), eq(campaignSteps.campaignId, campaignId), eq(campaignSteps.position, 1)),
  });
  const data = {
    organizationId,
    campaignId,
    position: 1,
    channel: 'WHATSAPP',
    delayMinutes: 0,
    template: 'Hi {{lead.name}}, I noticed {{lead.company}} could improve enquiry follow-up. Would you like to see how a CRM/ERP can help?',
    configuration: {
      aiPersonalize: true,
      aiObjective: 'Write a fresh opener using the lead business summary and ask one simple question.',
    },
  };
  if (!step) [step] = await db.insert(campaignSteps).values(data).returning();
  else [step] = await db.update(campaignSteps).set({ ...data, updatedAt: new Date() }).where(eq(campaignSteps.id, step.id)).returning();
  return step!;
}

async function ensureCampaignRun(organizationId: string, userId: string, campaignId: string, seededLeads: Array<typeof leads.$inferSelect>) {
  let run = await db.query.campaignRuns.findFirst({
    where: and(eq(campaignRuns.organizationId, organizationId), eq(campaignRuns.campaignId, campaignId), eq(campaignRuns.title, 'Seed Demo Run')),
  });
  const audienceSnapshot = seededLeads.map((lead) => ({
    leadId: lead.id,
    name: lead.name,
    company: lead.company,
    eligible: lead.name !== 'CarePlus Day Hospital',
    reasons: lead.name === 'CarePlus Day Hospital' ? ['OPTED_OUT'] : [],
  }));
  const data = {
    organizationId,
    campaignId,
    title: 'Seed Demo Run',
    status: 'COMPLETED',
    audience: { mode: 'selected', leadIds: seededLeads.map((lead) => lead.id) },
    audienceSnapshot,
    selectedChannels: ['WHATSAPP'],
    scheduledAt: new Date(),
    timezone: 'Asia/Kolkata',
    scheduleWindow: { startHour: 9, endHour: 23 },
    sendingDays: [1, 2, 3, 4, 5, 6],
    rateLimitPerHour: 100,
    totalLeads: seededLeads.length,
    eligibleLeads: seededLeads.length - 1,
    excludedLeads: 1,
    createdBy: userId,
    startedAt: new Date(),
    completedAt: new Date(),
  };
  if (!run) [run] = await db.insert(campaignRuns).values(data).returning();
  else [run] = await db.update(campaignRuns).set({ ...data, updatedAt: new Date() }).where(eq(campaignRuns.id, run.id)).returning();
  return run!;
}

async function ensureEnrollment(organizationId: string, campaignId: string, campaignRunId: string, leadId: string, currentStepId: string) {
  let enrollment = await db.query.campaignEnrollments.findFirst({
    where: and(eq(campaignEnrollments.campaignRunId, campaignRunId), eq(campaignEnrollments.leadId, leadId)),
  });
  if (!enrollment) {
    [enrollment] = await db.insert(campaignEnrollments).values({
      organizationId,
      campaignId,
      campaignRunId,
      leadId,
      status: 'COMPLETED',
      currentStepId,
      lastOutcome: 'SENT',
      metadata: { seed: true },
      completedAt: new Date(),
    }).returning();
  }
  return enrollment!;
}

async function ensureStepExecution(organizationId: string, campaignId: string, campaignRunId: string, enrollmentId: string, stepId: string, leadId: string) {
  const existing = await db.query.campaignStepExecutions.findFirst({
    where: and(eq(campaignStepExecutions.enrollmentId, enrollmentId), eq(campaignStepExecutions.stepId, stepId)),
  });
  if (!existing) {
    await db.insert(campaignStepExecutions).values({
      organizationId,
      campaignId,
      campaignRunId,
      enrollmentId,
      stepId,
      leadId,
      status: 'SENT',
      attempt: 1,
      providerMessageId: 'seed-whatsapp-message',
      outcome: 'SENT',
      metadata: { provider: 'baileys', seed: true },
      startedAt: new Date(),
      completedAt: new Date(),
    });
  }
}

async function ensureConversationSet(organizationId: string, leadId: string, userId: string) {
  let conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.organizationId, organizationId), eq(conversations.leadId, leadId), eq(conversations.channel, 'WHATSAPP')),
  });
  if (!conversation) {
    [conversation] = await db.insert(conversations).values({
      organizationId,
      leadId,
      channel: 'WHATSAPP',
      unreadCount: 1,
      lastMessageAt: new Date(),
    }).returning();
  }

  const existing = await db.query.messages.findFirst({
    where: and(eq(messages.organizationId, organizationId), eq(messages.conversationId, conversation!.id), eq(messages.providerMessageId, 'seed-inbound-reply')),
  });
  if (!existing) {
    await db.insert(messages).values([
      {
        organizationId,
        conversationId: conversation!.id,
        leadId,
        direction: 'OUTBOUND',
        senderType: 'SYSTEM',
        senderId: userId,
        content: 'Hi Arjun Fitness Studio, I noticed you could improve trial follow-up and member reminders. Would you like to see how this works?',
        providerMessageId: 'seed-outbound-opener',
        metadata: { seed: true },
      },
      {
        organizationId,
        conversationId: conversation!.id,
        leadId,
        direction: 'INBOUND',
        senderType: 'LEAD',
        content: 'Sure, show me how.',
        providerMessageId: 'seed-inbound-reply',
        metadata: { seed: true },
      },
    ]);
  }
  return conversation!;
}

async function ensureLeadMemory(organizationId: string, leadId: string) {
  await db.insert(leadMemories).values({
    organizationId,
    leadId,
    facts: { need: 'yes', budget: 'unknown', timeline: 'unknown', decision_maker: 'unknown', interest: 'medium' },
    summary: 'Lead replied positively and asked to see how the CRM can help.',
  }).onConflictDoUpdate({
    target: [leadMemories.organizationId, leadMemories.leadId],
    set: {
      facts: { need: 'yes', budget: 'unknown', timeline: 'unknown', decision_maker: 'unknown', interest: 'medium' },
      summary: 'Lead replied positively and asked to see how the CRM can help.',
      updatedAt: new Date(),
    },
  });
}

async function ensureQualification(organizationId: string, leadId: string, profileId: string) {
  const existing = await db.query.leadQualifications.findFirst({
    where: and(eq(leadQualifications.organizationId, organizationId), eq(leadQualifications.leadId, leadId), eq(leadQualifications.profileId, profileId)),
  });
  if (!existing) {
    await db.insert(leadQualifications).values({
      organizationId,
      leadId,
      profileId,
      score: 74,
      result: 'QUALIFIED',
      reason: 'Lead has a clear follow-up need and responded positively.',
      facts: { need: 'yes', interest: 'medium' },
    });
  }
}

async function ensureUnknownQuestion(organizationId: string, leadId: string) {
  const question = 'Can you guarantee more walk-ins?';
  const existing = await db.query.unknownQuestions.findFirst({
    where: and(eq(unknownQuestions.organizationId, organizationId), eq(unknownQuestions.leadId, leadId), eq(unknownQuestions.question, question)),
  });
  if (!existing) await db.insert(unknownQuestions).values({ organizationId, leadId, question });
}

async function ensureContactAttempt(organizationId: string, leadId: string) {
  const attemptedOn = new Date().toISOString().slice(0, 10);
  const existing = await db.query.contactAttempts.findFirst({
    where: and(eq(contactAttempts.organizationId, organizationId), eq(contactAttempts.leadId, leadId), eq(contactAttempts.channel, 'WHATSAPP'), eq(contactAttempts.attemptedOn, attemptedOn)),
  });
  if (!existing) await db.insert(contactAttempts).values({ organizationId, leadId, channel: 'WHATSAPP', attemptedOn });
}

async function ensureCommunicationEvent(organizationId: string, leadId: string) {
  const existing = await db.query.communicationEvents.findFirst({
    where: and(eq(communicationEvents.organizationId, organizationId), eq(communicationEvents.leadId, leadId), eq(communicationEvents.eventType, 'seed.message_received')),
  });
  if (!existing) {
    await db.insert(communicationEvents).values({
      organizationId,
      leadId,
      eventType: 'seed.message_received',
      channel: 'WHATSAPP',
      metadata: { seed: true },
    });
  }
}

async function ensureAiRuns(organizationId: string, leadId: string, agentId: string) {
  const existing = await db.query.aiRuns.findFirst({
    where: and(eq(aiRuns.organizationId, organizationId), eq(aiRuns.model, 'qwen/qwen3.8-27b:free')),
  });
  if (!existing) {
    await db.insert(aiRuns).values([
      {
        organizationId,
        leadId,
        agentId,
        model: 'qwen/qwen3.8-27b:free',
        inputTokens: 820,
        outputTokens: 160,
        latencyMs: 1240,
        status: 'OK',
        metadata: { feature: 'campaign_outreach_message', seed: true },
      },
      {
        organizationId,
        leadId,
        agentId,
        model: 'qwen/qwen3.8-27b:free',
        inputTokens: 1120,
        outputTokens: 220,
        latencyMs: 1550,
        status: 'OK',
        metadata: { feature: 'conversation', seed: true },
      },
    ]);
  }
}

async function ensurePipeline(organizationId: string) {
  let pipeline = await db.query.pipelines.findFirst({
    where: and(eq(pipelines.organizationId, organizationId), eq(pipelines.name, 'Demo Sales Pipeline')),
  });
  if (!pipeline) [pipeline] = await db.insert(pipelines).values({ organizationId, name: 'Demo Sales Pipeline', description: 'Seeded local sales pipeline.', isDefault: true }).returning();
  return pipeline!;
}

async function ensurePipelineStages(organizationId: string, pipelineId: string) {
  const stageNames = ['New', 'Contacted', 'Interested', 'Demo Scheduled', 'Won', 'Lost'];
  const result = [];
  for (const [index, name] of stageNames.entries()) {
    let stage = await db.query.pipelineStages.findFirst({
      where: and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.pipelineId, pipelineId), eq(pipelineStages.position, index + 1)),
    });
    if (!stage) {
      [stage] = await db.insert(pipelineStages).values({
        organizationId,
        pipelineId,
        name,
        position: index + 1,
        kind: name === 'Won' ? 'WON' : name === 'Lost' ? 'LOST' : 'OPEN',
      }).returning();
    }
    result.push(stage!);
  }
  return result;
}

async function ensureOpportunity(organizationId: string, leadId: string, pipelineId: string, stageId: string, ownerId: string) {
  let opportunity = await db.query.opportunities.findFirst({
    where: and(eq(opportunities.organizationId, organizationId), eq(opportunities.leadId, leadId)),
  });
  if (!opportunity) {
    [opportunity] = await db.insert(opportunities).values({
      organizationId,
      leadId,
      pipelineId,
      stageId,
      ownerId,
      title: 'Arjun Fitness CRM rollout',
      value: 75000,
      expectedCloseDate: '2026-10-30',
      status: 'OPEN',
      source: 'seed',
    }).returning();
  }
  return opportunity!;
}

async function ensureTask(organizationId: string, ownerId: string, leadId: string, opportunityId: string) {
  const title = 'Send demo booking link to Arjun Fitness';
  const existing = await db.query.salesTasks.findFirst({
    where: and(eq(salesTasks.organizationId, organizationId), eq(salesTasks.title, title)),
  });
  if (!existing) {
    await db.insert(salesTasks).values({
      organizationId,
      ownerId,
      leadId,
      opportunityId,
      title,
      description: 'Follow up from seeded WhatsApp conversation.',
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'OPEN',
      priority: 'HIGH',
    });
  }
}

async function ensureNotification(organizationId: string, userId: string, memberId: string) {
  const title = 'Seed demo workspace ready';
  const existing = await db.query.notifications.findFirst({
    where: and(eq(notifications.organizationId, organizationId), eq(notifications.memberId, memberId), eq(notifications.title, title)),
  });
  if (!existing) {
    await db.insert(notifications).values({
      organizationId,
      userId,
      memberId,
      title,
      body: 'Open User Guide to follow the full CRM setup and campaign flow.',
      link: '/guide',
    });
  }
}

async function ensureSalesEvent(organizationId: string, leadId: string, opportunityId: string, campaignId: string) {
  await db.insert(events).values({
    organizationId,
    type: 'seed.demo_created',
    entityType: 'opportunity',
    entityId: opportunityId,
    leadId,
    opportunityId,
    campaignId,
    idempotencyKey: `seed-demo-created:${organizationId}`,
    metadata: { seed: true },
  }).onConflictDoNothing();
}

async function ensureVoiceSample(organizationId: string, leadId: string) {
  let call = await db.query.voiceCalls.findFirst({
    where: and(eq(voiceCalls.organizationId, organizationId), eq(voiceCalls.leadId, leadId), eq(voiceCalls.providerCallId, 'seed-voice-call')),
  });
  if (!call) {
    [call] = await db.insert(voiceCalls).values({
      organizationId,
      leadId,
      providerCallId: 'seed-voice-call',
      status: 'COMPLETED',
      transcript: 'Lead asked for a short product walkthrough.',
      disclosure: 'This is a demo voice call record.',
      startedAt: new Date(),
      endedAt: new Date(),
      metadata: { seed: true },
    }).returning();
    await db.insert(voiceTranscriptSegments).values({
      organizationId,
      voiceCallId: call!.id,
      speaker: 'lead',
      text: 'Can you explain how it helps my gym?',
      startedAtMs: 0,
      endedAtMs: 3000,
      confidence: 95,
      language: 'en',
      sttProvider: 'seed',
    });
    await db.insert(voiceAgentTurns).values({
      organizationId,
      voiceCallId: call!.id,
      inputTranscript: 'Can you explain how it helps my gym?',
      aiResponseText: 'It helps track enquiries, trials, renewals, and follow-up tasks in one CRM.',
      ttsProvider: 'seed',
      latencyMs: 700,
      toolsTriggered: [],
      escalationRequired: false,
    });
  }
}

async function ensureAuditLog(organizationId: string, userId: string, action: string, entityType: string, entityId: string) {
  const existing = await db.query.auditLogs.findFirst({
    where: and(eq(auditLogs.organizationId, organizationId), eq(auditLogs.action, action)),
  });
  if (!existing) {
    await db.insert(auditLogs).values({
      organizationId,
      userId,
      action,
      entityType,
      entityId,
      metadata: { seed: true },
    });
  }
}

seed();
