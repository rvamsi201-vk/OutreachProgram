/** Enums shared across frontend and backend */

export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  ENGAGED: 'ENGAGED',
  QUALIFIED: 'QUALIFIED',
  NURTURE: 'NURTURE',
  NOT_QUALIFIED: 'NOT_QUALIFIED',
  CONVERTED: 'CONVERTED',
  LOST: 'LOST',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const ContactChannel = {
  VOICE: 'VOICE',
  WHATSAPP: 'WHATSAPP',
  SMS: 'SMS',
  EMAIL: 'EMAIL',
} as const;
export type ContactChannel = (typeof ContactChannel)[keyof typeof ContactChannel];

export const ContactValidationStatus = {
  UNKNOWN: 'UNKNOWN',
  VALID: 'VALID',
  INVALID: 'INVALID',
  RISKY: 'RISKY',
} as const;
export type ContactValidationStatus = (typeof ContactValidationStatus)[keyof typeof ContactValidationStatus];

export const CampaignStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const EnrollmentStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  QUALIFIED: 'QUALIFIED',
  OPTED_OUT: 'OPTED_OUT',
  FAILED: 'FAILED',
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const MessageDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;
export type MessageDirection = (typeof MessageDirection)[keyof typeof MessageDirection];

export const SenderType = {
  AI: 'AI',
  HUMAN: 'HUMAN',
  LEAD: 'LEAD',
  SYSTEM: 'SYSTEM',
} as const;
export type SenderType = (typeof SenderType)[keyof typeof SenderType];

export const UserRole = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SALESPERSON: 'SALESPERSON',
  VIEWER: 'VIEWER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const MembershipStatus = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];
