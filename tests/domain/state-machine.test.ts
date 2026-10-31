import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition } from '@/domain/state-machine';
import { InvalidTransitionError } from '@/domain/errors';

describe('ticket state machine', () => {
  it('allows the happy path', () => {
    const path = ['received', 'classified', 'drafted', 'awaiting_review', 'approved', 'sent'] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it('allows rejection from awaiting_review', () => {
    expect(canTransition('awaiting_review', 'rejected')).toBe(true);
  });
  it('never allows skipping review', () => {
    expect(canTransition('drafted', 'approved')).toBe(false);
    expect(canTransition('drafted', 'sent')).toBe(false);
    expect(canTransition('awaiting_review', 'sent')).toBe(false);
    expect(canTransition('received', 'sent')).toBe(false);
  });
  it('treats rejected, sent and failed as terminal', () => {
    for (const s of ['rejected', 'sent', 'failed'] as const) {
      expect(canTransition(s, 'awaiting_review')).toBe(false);
      expect(canTransition(s, 'sent')).toBe(false);
    }
  });
  it('assertTransition throws InvalidTransitionError', () => {
    expect(() => assertTransition('drafted', 'sent')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('received', 'classified')).not.toThrow();
  });
});
