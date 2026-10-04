export interface CampaignStep {
  id?: string;
  position: number;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  delayMinutes: number;
  subject?: string | null;
  template: string;
  configuration: Record<string, unknown>;
  retryPolicy: { attempts: number; backoffMs: number };
  conditions: Array<{ if: string; in: Array<string | number | boolean | null> }>;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  audience: { tags?: string[]; leadIds?: string[]; savedFilters?: Record<string, unknown> };
  status: string;
  timezone: string;
  scheduleWindow: { startHour: number; endHour: number };
  aiAgentId?: string | null;
  qualificationProfileId?: string | null;
  steps: CampaignStep[];
  createdAt: string;
}

export type CampaignRunStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface CampaignRun {
  id: string;
  campaignId: string;
  title: string;
  status: CampaignRunStatus;
  audience: Record<string, unknown>;
  selectedChannels: Array<CampaignStep['channel']>;
  scheduledAt: string | null;
  timezone: string;
  scheduleWindow: { startHour: number; endHour: number };
  sendingDays: number[];
  rateLimitPerHour: number;
  totalLeads: number;
  eligibleLeads: number;
  excludedLeads: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  stats?: Record<string, number>;
}
