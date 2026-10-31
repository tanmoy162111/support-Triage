import { and, eq, isNull, sql } from 'drizzle-orm';
import { tickets, classifications, drafts } from '@/db/schema';
import { assertTransition } from '@/domain/state-machine';
import { InvalidTransitionError } from '@/domain/errors';
import { routeForHuman } from '@/domain/routing';
import { detectInjection } from '@/domain/injection';
import type { TicketStatus } from '@/domain/types';
import type { Deps } from './deps';
import { audit, timedStep } from './audit';
import { findCustomer } from './identify-customer';
import { classifyTicket } from './classify';
import { retrieveEvidence } from './retrieve';
import { draftReply } from './draft';

/** Carries only a safe summary of a failure. Never copies `cause.message`, which can echo request content. */
class StepError extends Error {
  constructor(readonly step: string, cause: unknown) {
    const e = cause as { name?: unknown; status?: unknown; statusCode?: unknown } | null;
    const name = typeof e?.name === 'string' && e.name ? e.name : 'Error';
    const code = [e?.status, e?.statusCode].find((n): n is number => typeof n === 'number' && Number.isFinite(n));
    super(`${step} failed (${name}${code === undefined ? '' : `, status ${code}`})`);
  }
}

/**
 * Runs the pipeline up to `awaiting_review`. It never sends. Safe to call concurrently: an atomic claim
 * (`processing_started_at`) lets exactly one caller run; the others return without touching the ticket.
 *
 * Known limitation: a crash after the claim leaves the ticket in `received` with `processing_started_at`
 * set, so it is not re-run automatically. Recovery (a stale-claim reaper) is future work.
 */
export async function processTicket(deps: Deps, ticketId: string): Promise<void> {
  const { db, tenantId } = deps;
  const runId = crypto.randomUUID();
  const [ticket] = await db.update(tickets).set({ processingStartedAt: sql`now()` })
    .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId), eq(tickets.status, 'received'), isNull(tickets.processingStartedAt)))
    .returning();
  if (!ticket) return;

  const setStatus = async (from: TicketStatus, to: TicketStatus, extra: Partial<typeof tickets.$inferInsert> = {}) => {
    assertTransition(from, to);
    const updated = await db.update(tickets).set({ status: to, ...extra })
      .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId), eq(tickets.status, from)))
      .returning({ id: tickets.id });
    if (updated.length === 0) throw new InvalidTransitionError(from, to);
  };
  const base = (step: string) => ({ tenantId, ticketId, runId, step });
  const step = async <T>(name: string, fn: () => Promise<{ value: T; detail?: Record<string, unknown> }>): Promise<T> => {
    try { return await timedStep(db, base(name), fn); } catch (err) { throw new StepError(name, err); }
  };

  try {
    const customer = await step('identify_customer', async () => {
      const c = await findCustomer(db, tenantId, ticket.fromEmail);
      return { value: c, detail: { matched: c !== null } };
    });

    const cls = await step('classify', async () => {
      const r = await classifyTicket(deps.llm, { subject: ticket.subject, body: ticket.body });
      await db.insert(classifications).values({ tenantId, ticketId, topic: r.topic, urgency: r.urgency, confidence: r.confidence, reasons: r.reasons, valid: r.valid, promptVersion: r.promptVersion, model: r.model });
      return { value: r, detail: { topic: r.topic, urgency: r.urgency, valid: r.valid, model: r.model } };
    });
    await setStatus('received', 'classified', { customerId: customer?.id ?? null });

    const evidence = await step('retrieve', async () => {
      const r = await retrieveEvidence(deps, { subject: ticket.subject, body: ticket.body }, deps.retrievalMinScore);
      return { value: r, detail: { status: r.status, chunkIds: r.chunks.map((c) => c.id) } };
    });

    const draft = await step('draft', async () => {
      const d = await draftReply(deps.llm, {
        ticket: { subject: ticket.subject, body: ticket.body },
        customer: customer ? { name: customer.name, plan: customer.plan } : null,
        chunks: evidence.chunks, retrievalStatus: evidence.status,
      });
      await db.insert(drafts).values({ tenantId, ticketId, body: d.body, citedChunkIds: d.citedChunkIds, evidenceStatus: d.evidenceStatus, unsupportedPoints: d.unsupportedPoints, isPlaceholder: d.isPlaceholder });
      return { value: d, detail: { evidence: d.evidenceStatus, placeholder: d.isPlaceholder, cited: d.citedChunkIds.length } };
    });
    await setStatus('classified', 'drafted');

    const injection = detectInjection(`${ticket.subject}\n${ticket.body}`);
    const route = routeForHuman({
      customerMatched: customer !== null, evidence: draft.evidenceStatus, topic: cls.topic, urgency: cls.urgency,
      classificationValid: cls.valid, confidence: cls.confidence, citedChunkCount: draft.citedChunkIds.length,
      injectionSuspected: injection.suspected, draftIsPlaceholder: draft.isPlaceholder,
    });
    await setStatus('drafted', 'awaiting_review', { needsHuman: route.needsHuman, needsHumanReasons: route.reasons, injectionSuspected: injection.suspected });
    await audit(db, { ...base('route'), outcome: 'ok', detail: { needsHuman: route.needsHuman, reasons: route.reasons } });
  } catch (err) {
    const reason = (err instanceof StepError ? err.message : `pipeline failed (${(err as Error)?.name || 'Error'})`).slice(0, 300);
    const [current] = await db.select({ status: tickets.status }).from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)));
    if (current && current.status !== 'failed') {
      await db.update(tickets).set({ status: 'failed', failureReason: reason }).where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)));
    }
  }
}
