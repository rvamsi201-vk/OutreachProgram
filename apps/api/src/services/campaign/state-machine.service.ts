import { ConflictError } from '../../errors/index.js';

const allowedTransitions: Record<string, string[]> = {
  DRAFT: ['SCHEDULED', 'RUNNING', 'CANCELLED'],
  SCHEDULED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['RUNNING', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export class CampaignStateMachine {
  assertTransition(from: string, to: string) {
    if (!allowedTransitions[from]?.includes(to)) {
      throw new ConflictError(`Invalid campaign status transition: ${from} -> ${to}`);
    }
  }

  transition(from: string, to: string) {
    this.assertTransition(from, to);
    return to;
  }
}
