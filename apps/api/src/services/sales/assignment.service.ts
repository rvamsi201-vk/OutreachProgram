import { ConflictError } from '../../errors/index.js';

export interface AssignmentRepository {
  listSalespeople(organizationId: string): Promise<Array<{ id: string; userId?: string | null; role: string; status: string }>>;
  lastAssignedOwner(organizationId: string): Promise<string | null>;
}

export class AssignmentService {
  constructor(private readonly repo: AssignmentRepository) {}

  async assignOpportunity(organizationId: string) {
    const members = (await this.repo.listSalespeople(organizationId))
      .filter((member) => ['SALESPERSON', 'MANAGER', 'ADMIN'].includes(member.role));
    if (members.length === 0) {
      throw new ConflictError('No available salesperson');
    }
    const lastOwner = await this.repo.lastAssignedOwner(organizationId);
    const index = lastOwner ? members.findIndex((member) => member.id === lastOwner) : -1;
    return members[(index + 1) % members.length]!;
  }
}
