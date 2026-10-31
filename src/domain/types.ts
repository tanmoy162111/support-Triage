export const TOPICS = ['billing', 'login_access', 'bug', 'how_to', 'shipping', 'cancellation_refund', 'other'] as const;
export type Topic = (typeof TOPICS)[number];

export const URGENCIES = ['low', 'normal', 'high', 'critical'] as const;
export type Urgency = (typeof URGENCIES)[number];

export const TICKET_STATUSES = ['received', 'classified', 'drafted', 'awaiting_review', 'approved', 'rejected', 'sent', 'failed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const EVIDENCE_STATUSES = ['supported', 'partial', 'none', 'conflicting'] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const REVIEW_DECISIONS = ['approved', 'edited', 'rejected'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface RetrievedChunk {
  id: string;
  docId: string;
  title: string;
  section: string;
  version: string;
  text: string;
  score: number;
}
