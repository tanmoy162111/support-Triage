import type { TicketStatus } from './types';

export class DomainError extends Error {
  constructor(message: string, readonly httpStatus: number = 400) {
    super(message);
    this.name = 'DomainError';
  }
}
export class InvalidTransitionError extends DomainError {
  constructor(from: TicketStatus, to: TicketStatus) {
    super(`Invalid ticket transition ${from} -> ${to}`, 409);
    this.name = 'InvalidTransitionError';
  }
}
export class ApprovalRequiredError extends DomainError {
  constructor(message = 'An approved review is required before sending') {
    super(message, 409);
    this.name = 'ApprovalRequiredError';
  }
}
