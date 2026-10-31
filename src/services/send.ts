import { and, desc, eq } from 'drizzle-orm';
import { outboundMessages, reviews, tickets } from '@/db/schema';
import { ApprovalRequiredError, DomainError, InvalidTransitionError } from '@/domain/errors';
import { assertTransition } from '@/domain/state-machine';
import type { Deps } from '@/pipeline/deps';
import { audit } from '@/pipeline/audit';

/**
 * The only code path that can send (mock). It refuses unless the ticket's LATEST review is approved or edited
 * and the ticket is `approved` (or already `sent`, for idempotent replays). The outbound row, keyed on the
 * review id, is claimed BEFORE the mailer is called, so a send happens at most once per review.
 *
 * Known limitation: a crash between the claim and the mailer leaves a `pending` row that is never re-sent
 * (at-most-once). An operator must inspect it.
 */
export async function sendApproved(deps: Deps, ticketId: string): Promise<{ outboundId: string; deliveryMode: 'mock' }> {
  const { db, tenantId } = deps;
  const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)));
  if (!ticket) throw new DomainError('Ticket not found', 404);

  // The latest review of ANY decision governs; an older approval never authorises a send.
  const [review] = await db.select().from(reviews)
    .where(and(eq(reviews.ticketId, ticketId), eq(reviews.tenantId, tenantId)))
    .orderBy(desc(reviews.createdAt), desc(reviews.id)).limit(1);
  if (!review || (review.decision !== 'approved' && review.decision !== 'edited') || !review.finalBody) throw new ApprovalRequiredError();

  const key = `send:${review.id}`;
  const existingOutbound = async () => {
    const [row] = await db.select().from(outboundMessages).where(and(eq(outboundMessages.idempotencyKey, key), eq(outboundMessages.tenantId, tenantId)));
    if (!row) return null;
    if (row.result === 'failed') throw new DomainError('A previous send failed; it is not retried automatically', 409);
    return { outboundId: row.id, deliveryMode: 'mock' as const };
  };
  const prior = await existingOutbound();
  if (prior) return prior;

  if (ticket.status !== 'approved') throw new ApprovalRequiredError(`Ticket is ${ticket.status}, not approved`);

  // Claim the idempotency key first. A concurrent caller loses the unique-index race and sends nothing.
  const [claimed] = await db.insert(outboundMessages).values({
    tenantId, ticketId, reviewId: review.id, idempotencyKey: key, deliveryMode: 'mock',
    toEmail: ticket.fromEmail, body: review.finalBody, result: 'pending',
  }).onConflictDoNothing({ target: outboundMessages.idempotencyKey }).returning({ id: outboundMessages.id });
  if (!claimed) {
    const raced = await existingOutbound();
    if (raced) return raced;
    throw new DomainError('Send could not be claimed', 409);
  }

  let res;
  try {
    res = await deps.mailer.send({ to: ticket.fromEmail, subject: `Re: ${ticket.subject}`, body: review.finalBody, idempotencyKey: key });
  } catch (err) {
    // Never retry a side effect blindly: the claimed row stays as `failed` for an operator to inspect.
    await db.update(outboundMessages).set({ result: 'failed' }).where(eq(outboundMessages.id, claimed.id));
    await db.update(tickets).set({ status: 'failed', failureReason: 'send failed' })
      .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId), eq(tickets.status, 'approved')));
    await audit(db, { tenantId, ticketId, runId: key, step: 'send', outcome: 'error', detail: { error: (err as Error).name, reviewId: review.id } });
    throw err;
  }

  assertTransition('approved', 'sent');
  await db.update(outboundMessages).set({ result: `${res.mode}:${res.id}`, sentAt: new Date() }).where(eq(outboundMessages.id, claimed.id));
  const updated = await db.update(tickets).set({ status: 'sent' })
    .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId), eq(tickets.status, 'approved'))).returning({ id: tickets.id });
  if (updated.length === 0) throw new InvalidTransitionError(ticket.status, 'sent');
  await audit(db, { tenantId, ticketId, runId: key, step: 'send', outcome: 'ok', detail: { mode: res.mode, reviewId: review.id, reviewer: review.reviewer, decision: review.decision } });
  return { outboundId: claimed.id, deliveryMode: 'mock' };
}
