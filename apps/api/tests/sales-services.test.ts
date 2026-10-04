import { describe, expect, it } from 'vitest';

describe('AssignmentService', () => {
  it('assigns salespeople in round-robin order', async () => {
    const { AssignmentService } = await import('../src/services/sales/assignment.service.js');
    const repo = {
      listSalespeople: async () => [
        { id: 'a', role: 'SALESPERSON', status: 'ACTIVE' },
        { id: 'b', role: 'SALESPERSON', status: 'ACTIVE' },
        { id: 'c', role: 'SALESPERSON', status: 'ACTIVE' },
      ],
      lastAssignedOwner: async () => 'b',
    };
    const service = new AssignmentService(repo as never);
    await expect(service.assignOpportunity('org')).resolves.toMatchObject({ id: 'c' });
  });

  it('rejects when no salesperson is available', async () => {
    const { AssignmentService } = await import('../src/services/sales/assignment.service.js');
    const repo = { listSalespeople: async () => [], lastAssignedOwner: async () => null };
    const service = new AssignmentService(repo as never);
    await expect(service.assignOpportunity('org')).rejects.toThrow('No available salesperson');
  });
});

describe('HandoffService', () => {
  it('does not duplicate handoff when idempotency event already exists', async () => {
    process.env.DATABASE_URL ??= 'postgres://user:password@localhost:5432/test';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.JWT_SECRET ??= 'x'.repeat(32);
    process.env.REFRESH_SECRET ??= 'x'.repeat(32);
    process.env.ENCRYPTION_KEY ??= 'x'.repeat(32);
    const { HandoffService } = await import('../src/services/sales/handoff.service.js');
    let opportunityCount = 0;
    const repo = {
      createEvent: async () => null,
      pauseActiveEnrollments: async () => undefined,
      defaultPipeline: async () => ({ id: 'p', stages: [{ id: 's' }] }),
      createOpportunity: async () => { opportunityCount += 1; return { id: 'o' }; },
    };
    const service = new HandoffService(repo as never, {} as never);
    const result = await service.handoffQualifiedLead({ organizationId: 'org', leadId: 'lead', leadName: 'Rahul' });
    expect(result).toEqual({ idempotent: true });
    expect(opportunityCount).toBe(0);
  });
});
