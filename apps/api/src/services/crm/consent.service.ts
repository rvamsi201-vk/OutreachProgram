import { and, count, eq, gte, isNull } from 'drizzle-orm';
import type { Database } from '../../db/connection.js';
import { contactAttempts, leads, suppressionEntries } from '../../db/schema/index.js';

export interface ConsentResult {
  allowed: boolean;
  reason: string;
}

interface ContactWindow {
  startHour: number;
  endHour: number;
}

interface ConsentOptions {
  now?: Date;
  timezone?: string;
  scheduleWindow?: ContactWindow;
}

function localHour(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).formatToParts(now);
  return Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
}

function todayInTimezone(now: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(now);
}

export class ConsentService {
  constructor(private readonly database: Database) {}

  async canContact(
    organizationId: string,
    leadId: string,
    channel: string,
    options: ConsentOptions | Date = {},
  ): Promise<ConsentResult> {
    const now = options instanceof Date ? options : options.now ?? new Date();
    const lead = await this.database.query.leads.findFirst({
      where: and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)),
    });

    if (!lead) return { allowed: false, reason: 'lead_not_found' };
    if (lead.doNotContact) return { allowed: false, reason: 'do_not_contact' };
    if (lead.optedOut) return { allowed: false, reason: 'opted_out' };
    if (lead.wrongNumber && channel !== 'EMAIL') return { allowed: false, reason: 'wrong_number' };
    if (lead.blocked) return { allowed: false, reason: 'blocked' };

    const suppression = await this.database.query.suppressionEntries.findFirst({
      where: and(
        eq(suppressionEntries.organizationId, organizationId),
        eq(suppressionEntries.leadId, leadId),
        eq(suppressionEntries.channel, channel),
      ),
    });
    if (suppression) return { allowed: false, reason: suppression.reason.toLowerCase() };

    const anyChannelSuppression = await this.database.query.suppressionEntries.findFirst({
      where: and(
        eq(suppressionEntries.organizationId, organizationId),
        eq(suppressionEntries.leadId, leadId),
        isNull(suppressionEntries.channel),
      ),
    });
    if (anyChannelSuppression) {
      return { allowed: false, reason: anyChannelSuppression.reason.toLowerCase() };
    }

    const timezone = options instanceof Date ? lead.timezone : options.timezone ?? lead.timezone;
    const scheduleWindow = options instanceof Date ? undefined : options.scheduleWindow;
    const startHour = scheduleWindow?.startHour ?? 9;
    const endHour = scheduleWindow?.endHour ?? 20;
    const hour = localHour(now, timezone);
    if (hour < startHour || hour >= endHour) return { allowed: false, reason: 'quiet_hours' };

    const attemptedOn = todayInTimezone(now, lead.timezone);
    const [daily] = await this.database
      .select({ value: count() })
      .from(contactAttempts)
      .where(
        and(
          eq(contactAttempts.organizationId, organizationId),
          eq(contactAttempts.leadId, leadId),
          eq(contactAttempts.attemptedOn, attemptedOn),
        ),
      );
    if ((daily?.value ?? 0) >= lead.dailyContactCap) {
      return { allowed: false, reason: 'daily_contact_cap' };
    }

    const [total] = await this.database
      .select({ value: count() })
      .from(contactAttempts)
      .where(
        and(
          eq(contactAttempts.organizationId, organizationId),
          eq(contactAttempts.leadId, leadId),
          gte(contactAttempts.createdAt, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
        ),
      );
    if ((total?.value ?? 0) >= lead.perLeadContactCap) {
      return { allowed: false, reason: 'per_lead_contact_cap' };
    }

    return { allowed: true, reason: 'allowed' };
  }
}
