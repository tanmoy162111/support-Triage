import { and, desc, eq } from 'drizzle-orm';
import { drafts, reviews, tickets } from '@/db/schema';
import { DomainError } from '@/domain/errors';
import { assertTransition } from '@/domain/state-machine';
import type { ReviewDecision } from '@/domain/types';
import type { Deps } from '@/pipeline/deps';

export interface ReviewInput {
  ticketId: string;
  reviewer: string;
  decision: ReviewDecision;
  finalBody?: string;
  rejectReason?: string;
}

/** Records a human decision. Runs in one transaction with the ticket row locked, so only one review can win. */
export async function submitReview(deps: Deps, input: ReviewInput): Promise<{ reviewId: string; finalBody: string }> {
  const { db, tenantId } = deps;
  const reviewer = input.reviewer?.trim();
  if (!reviewer) throw new DomainError('A reviewer is required', 400);
  return db.transaction(async (tx) => {
    // Lock the ticket row so two concurrent reviews cannot both pass the status check.
    const [ticket] = await tx.select().from(tickets)
      .where(and(eq(tickets.id, input.ticketId), eq(tickets.tenantId, tenantId))).for('update');
    if (!ticket) throw new DomainError('Ticket not found', 404);
    const to = input.decision === 'rejected' ? 'rejected' : 'approved';
    assertTransition(ticket.status, to);

    const [draft] = await tx.select().from(drafts)
      .where(and(eq(drafts.ticketId, ticket.id), eq(drafts.tenantId, tenantId))).orderBy(desc(drafts.createdAt)).limit(1);
    if (!draft) throw new DomainError('Ticket has no draft to review', 409);

    let finalBody = '';
    if (input.decision === 'rejected') {
      if (!input.rejectReason?.trim()) throw new DomainError('A reason is required to reject', 400);
    } else if (input.decision === 'approved') {
      if (draft.isPlaceholder) throw new DomainError('There is no grounded draft: write your own reply instead', 400);
      finalBody = draft.body;
    } else {
      finalBody = (input.finalBody ?? '').trim();
      if (!finalBody) throw new DomainError('An edited reply cannot be empty', 400);
    }

    const [review] = await tx.insert(reviews).values({
      tenantId, draftId: draft.id, ticketId: ticket.id, reviewer, decision: input.decision,
      finalBody: input.decision === 'rejected' ? null : finalBody, rejectReason: input.rejectReason?.trim() ?? null,
    }).returning({ id: reviews.id });
    await tx.update(tickets).set({ status: to }).where(and(eq(tickets.id, ticket.id), eq(tickets.tenantId, tenantId)));
    return { reviewId: review.id, finalBody };
  });
}
