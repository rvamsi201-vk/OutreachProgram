import type { CreateLeadInput, LeadListQuery, UpdateLeadInput } from '@ai-crm/shared';
import { LeadRepository } from '../../repositories/lead.repository.js';
import { ContactNormalizationService } from './normalization.service.js';
import { DeduplicationService } from './deduplication.service.js';

export class LeadService {
  constructor(
    private readonly repo = new LeadRepository(),
    private readonly normalizer = new ContactNormalizationService(),
    private readonly dedupe = new DeduplicationService(),
  ) {}

  list(organizationId: string, query: LeadListQuery) {
    return this.repo.list(organizationId, query);
  }

  get(organizationId: string, id: string) {
    return this.repo.findById(organizationId, id);
  }

  async create(organizationId: string, input: CreateLeadInput) {
    const normalizedContacts = input.contacts.map((contact) => ({
      ...contact,
      normalized: this.normalizer.normalize(contact.channel, contact.value),
    }));

    for (const contact of normalizedContacts) {
      const existing = await this.repo.findByContact(
        organizationId,
        contact.channel,
        contact.normalized.normalizedValue,
      );
      if (existing) {
        const merged = this.dedupe.mergeLead(existing, input);
        await this.repo.updateBase(organizationId, existing.id, merged);
        await this.addMissingContacts(organizationId, existing.id, normalizedContacts);
        await this.repo.assignTags(organizationId, existing.id, input.tags);
        await this.repo.upsertCustomValues(organizationId, existing.id, input.customFields);
        return this.repo.findById(organizationId, existing.id);
      }
    }

    const lead = await this.repo.createBase(organizationId, input);
    await this.addMissingContacts(organizationId, lead.id, normalizedContacts);
    await this.repo.assignTags(organizationId, lead.id, input.tags);
    await this.repo.upsertCustomValues(organizationId, lead.id, input.customFields);
    return this.repo.findById(organizationId, lead.id);
  }

  async update(organizationId: string, id: string, input: UpdateLeadInput) {
    const lead = await this.repo.updateBase(organizationId, id, input);
    if (!lead) return null;
    if (input.contacts) {
      const contacts = input.contacts.map((contact) => {
        const normalized = this.normalizer.normalize(contact.channel, contact.value);
        return {
          organizationId,
          leadId: id,
          channel: contact.channel,
          value: normalized.value,
          normalizedValue: normalized.normalizedValue,
          isPrimary: contact.isPrimary,
          validationStatus: normalized.validationStatus,
          lineType: normalized.lineType,
        };
      });
      await this.repo.replaceContacts(organizationId, id, contacts);
    }
    if (input.tags) await this.repo.replaceTags(organizationId, id, input.tags);
    if (input.customFields) await this.repo.upsertCustomValues(organizationId, id, input.customFields);
    return this.repo.findById(organizationId, id);
  }

  delete(organizationId: string, id: string) {
    return this.repo.delete(organizationId, id);
  }

  private async addMissingContacts(
    organizationId: string,
    leadId: string,
    contacts: Array<{
      channel: string;
      value: string;
      isPrimary?: boolean;
      normalized: ReturnType<ContactNormalizationService['normalize']>;
    }>,
  ) {
    for (const contact of contacts) {
      await this.repo.addContact({
        organizationId,
        leadId,
        channel: contact.channel,
        value: contact.normalized.value,
        normalizedValue: contact.normalized.normalizedValue,
        isPrimary: contact.isPrimary ?? false,
        validationStatus: contact.normalized.validationStatus,
        lineType: contact.normalized.lineType,
      });
    }
  }
}
