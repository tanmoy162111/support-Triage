import type { EvidenceStatus, Topic, Urgency } from './types';

export interface RoutingInput {
  customerMatched: boolean;
  evidence: EvidenceStatus;
  topic: Topic;
  urgency: Urgency;
  classificationValid: boolean;
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
  if (i.injectionSuspected) reasons.push('possible_prompt_injection');
  if (i.draftIsPlaceholder) reasons.push('draft_rejected');
  return { needsHuman: reasons.length > 0, reasons };
}
