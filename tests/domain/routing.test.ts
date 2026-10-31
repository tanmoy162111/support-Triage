import { describe, it, expect } from 'vitest';
import { routeForHuman, LOW_CONFIDENCE_THRESHOLD, type RoutingInput } from '@/domain/routing';

const ok: RoutingInput = {
  customerMatched: true, evidence: 'supported', topic: 'how_to', urgency: 'normal',
  classificationValid: true, confidence: 0.9, citedChunkCount: 1, injectionSuspected: false, draftIsPlaceholder: false,
};

describe('routeForHuman', () => {
  it('does not flag a clean ticket', () => {
    expect(routeForHuman(ok)).toEqual({ needsHuman: false, reasons: [] });
  });
  it.each([
    [{ customerMatched: false }, 'unmatched_customer'],
    [{ evidence: 'none' as const }, 'no_evidence'],
    [{ evidence: 'conflicting' as const }, 'conflicting_evidence'],
    [{ topic: 'cancellation_refund' as const, citedChunkCount: 0 }, 'refund_without_policy_citation'],
    [{ urgency: 'critical' as const }, 'critical_urgency'],
    [{ classificationValid: false, confidence: 0 }, 'classification_invalid'],
    [{ confidence: 0.49 }, 'low_confidence'],
    [{ injectionSuspected: true }, 'possible_prompt_injection'],
    [{ draftIsPlaceholder: true }, 'draft_rejected'],
  ])('flags %j as %s', (patch, reason) => {
    const r = routeForHuman({ ...ok, ...patch });
    expect(r.needsHuman).toBe(true);
    expect(r.reasons).toContain(reason);
  });
  it('does not flag confidence at the threshold', () => {
    expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.5);
    expect(routeForHuman({ ...ok, confidence: 0.5 })).toEqual({ needsHuman: false, reasons: [] });
  });
  it('reports only classification_invalid for an invalid classification (confidence 0)', () => {
    expect(routeForHuman({ ...ok, classificationValid: false, confidence: 0 }).reasons).toEqual(['classification_invalid']);
  });
  it('collects multiple reasons', () => {
    const r = routeForHuman({ ...ok, customerMatched: false, urgency: 'critical' });
    expect(r.reasons).toEqual(['unmatched_customer', 'critical_urgency']);
  });
  it('allows refund topic when a policy chunk is cited', () => {
    expect(routeForHuman({ ...ok, topic: 'cancellation_refund', citedChunkCount: 1 }).needsHuman).toBe(false);
  });
});
