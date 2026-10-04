import { describe, it, expect } from 'vitest';
import {
  ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
  PERMISSIONS,
  registerSchema,
  loginSchema,
  campaignRunInputSchema,
} from '../src/index.js';

describe('Permissions', () => {
  it('ADMIN has all permissions', () => {
    expect(ROLE_PERMISSIONS.ADMIN).toEqual(ALL_PERMISSIONS);
  });

  it('MANAGER does not have billing.manage, users.remove, channels.manage', () => {
    const managerPerms = ROLE_PERMISSIONS.MANAGER;
    expect(managerPerms).not.toContain(PERMISSIONS.BILLING_MANAGE);
    expect(managerPerms).not.toContain(PERMISSIONS.USERS_REMOVE);
    expect(managerPerms).not.toContain(PERMISSIONS.CHANNELS_MANAGE);
  });

  it('SALESPERSON has only assigned permissions', () => {
    const salesPerms = ROLE_PERMISSIONS.SALESPERSON;
    expect(salesPerms).toContain(PERMISSIONS.LEADS_READ);
    expect(salesPerms).toContain(PERMISSIONS.LEADS_UPDATE);
    expect(salesPerms).toContain(PERMISSIONS.CONVERSATIONS_READ);
    expect(salesPerms).toContain(PERMISSIONS.CONVERSATIONS_REPLY);
    expect(salesPerms).not.toContain(PERMISSIONS.LEADS_DELETE);
    expect(salesPerms).not.toContain(PERMISSIONS.CAMPAIGNS_CREATE);
  });

  it('VIEWER only has read permissions', () => {
    const viewerPerms = ROLE_PERMISSIONS.VIEWER;
    for (const perm of viewerPerms) {
      expect(perm).toMatch(/\.read$/);
    }
  });
});

describe('Schemas', () => {
  it('registerSchema validates correct input', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      firstName: 'John',
      lastName: 'Doe',
      organizationName: 'Test Org',
    });
    expect(result.success).toBe(true);
  });

  it('registerSchema rejects short password', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'short',
      firstName: 'John',
      lastName: 'Doe',
      organizationName: 'Test Org',
    });
    expect(result.success).toBe(false);
  });

  it('registerSchema rejects invalid email', () => {
    const result = registerSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
      firstName: 'John',
      lastName: 'Doe',
      organizationName: 'Test Org',
    });
    expect(result.success).toBe(false);
  });

  it('loginSchema validates correct input', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('loginSchema lowercases email', () => {
    const result = loginSchema.parse({
      email: 'Test@Example.COM',
      password: 'password123',
    });
    expect(result.email).toBe('test@example.com');
  });

  it('validates a reusable campaign run with multiple channels and scheduling controls', () => {
    const result = campaignRunInputSchema.safeParse({
      title: 'October follow-up',
      audience: { mode: 'BATCHES', importIds: ['4f7759fd-3de8-45cc-aa3e-c4696bd0515c'] },
      selectedChannels: ['EMAIL', 'WHATSAPP'],
      timezone: 'Asia/Kolkata',
      scheduleWindow: { startHour: 9, endHour: 18 },
      sendingDays: [1, 2, 3, 4, 5],
      rateLimitPerHour: 80,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a campaign run without channels or valid sending hours', () => {
    const result = campaignRunInputSchema.safeParse({
      title: 'Invalid run',
      audience: { mode: 'ALL' },
      selectedChannels: [],
      timezone: 'Asia/Kolkata',
      scheduleWindow: { startHour: 20, endHour: 9 },
      sendingDays: [1],
      rateLimitPerHour: 100,
    });
    expect(result.success).toBe(false);
  });
});
