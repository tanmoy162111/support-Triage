import type { TicketStatus } from './types';
import { InvalidTransitionError } from './errors';

const ALLOWED: Record<TicketStatus, readonly TicketStatus[]> = {
  received: ['classified', 'failed'],
  classified: ['drafted', 'failed'],
  drafted: ['awaiting_review', 'failed'],
  awaiting_review: ['approved', 'rejected'],
  approved: ['sent', 'failed'],
  rejected: [],
  sent: [],
  failed: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: TicketStatus, to: TicketStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
