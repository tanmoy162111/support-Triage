import type { EvidenceStatus, Topic, Urgency } from './types';

/** Below this self-reported confidence a ticket is flagged for human handling. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export interface RoutingInput {
  customerMatched: boolean;
  evidence: EvidenceStatus;
  topic: Topic;
  urgency: Urgency;
  classificationValid: boolean;
  /** The classifier's self-reported confidence (0 to 1). */
  confidence: number;
  citedChunkCount: number;
  injectionSuspected: boolean;
  draftIsPlaceholder: boolean;
}

export interface RoutingResult {
  needsHuman: boolean;
  reasons: string[];
}

export function routeForHuman(i: RoutingInput): RoutingResult {
  const reasons: string[] = [];
  if (!i.customerMatched) reasons.push('unmatched_customer');
  if (i.evidence === 'none') reasons.push('no_evidence');
  if (i.evidence === 'conflicting') reasons.push('conflicting_evidence');
  if (i.topic === 'cancellation_refund' && i.citedChunkCount === 0) reasons.push('refund_without_policy_citation');
  if (i.urgency === 'critical') reasons.push('critical_urgency');
  if (!i.classificationValid) reasons.push('classification_invalid');
  // Model confidence is not proof of correctness: this is a conservative extra flag only,
  // never a reason to skip review (every ticket still goes through review).
  if (i.classificationValid && i.confidence < LOW_CONFIDENCE_THRESHOLD) reasons.push('low_confidence');
  if (i.injectionSuspected) reasons.push('possible_prompt_injection');
  if (i.draftIsPlaceholder) reasons.push('draft_rejected');
  return { needsHuman: reasons.length > 0, reasons };
}
