export interface Lead {
  id: string;
  name: string;
  company: string | null;
  pitch: string | null;
  info: string | null;
  comments: string | null;
  status: string;
  source: string | null;
  location: string | null;
  businessSize: string | null;
  website: string | null;
  otherLinks: string[];
  ratings: string | null;
  score: number | null;
  priority: string | null;
  importId: string | null;
  ownerId: string | null;
  timezone: string;
  doNotContact: boolean;
  optedOut: boolean;
  wrongNumber: boolean;
  blocked: boolean;
  createdAt: string;
  updatedAt: string;
  contacts?: Array<{
    id: string;
    channel: string;
    value: string;
    normalizedValue: string;
    validationStatus: string;
    isPrimary: boolean;
  }>;
  tags?: Array<{ id: string; name: string; color: string | null }>;
  customFields?: Array<{ id: string; key: string; label: string; type: string; value: unknown }>;
  suppressions?: Array<{ id: string; channel: string | null; reason: string; notes: string | null }>;
}

export interface Conversation {
  id: string;
  leadId: string;
  leadName: string;
  leadCompany: string | null;
  channel: string;
  unreadCount: number;
  lastMessageAt: string | null;
}

export interface Message {
  id: string;
  direction: string;
  senderType: string;
  content: string;
  createdAt: string;
}
