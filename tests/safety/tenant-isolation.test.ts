import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { loadSamples } from '@/services/samples';
import { listTickets, getTicketDetail, listAuditEvents } from '@/services/queries';
import { computeMetrics } from '@/services/metrics';
import { submitReview } from '@/services/review';
import { sendApproved } from '@/services/send';
import { retrieveEvidence } from '@/pipeline/retrieve';
import { processTicket } from '@/pipeline/process-ticket';
import { MockLlm } from '@/adapters/mock-llm';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer } from '@/adapters/mailer';
import { getTestDb, resetDb, insertTicket, TENANT, OTHER_TENANT } from '../helpers/db';
import { outboundMessages, reviews, tickets } from '@/db/schema';
import type { Deps } from '@/pipeline/deps';

const mailer = new MockMailer();
const deps = (tenantId: string): Deps => ({ db: getTestDb(), llm: new MockLlm(), embedder: new MockEmbedder(), mailer, tenantId, retrievalMinScore: 0.15 });
beforeEach(async () => { await resetDb(); mailer.sent.length = 0; });

describe('tenant isolation on every path', () => {
  it('another tenant sees nothing, gets 404s and has no effect on tenant data', async () => {
    await loadSamples(deps(TENANT));
    const [t] = await listTickets(deps(TENANT), {});
    const b = deps(OTHER_TENANT);

    expect(await listTickets(b, {})).toEqual([]);
    expect(await getTicketDetail(b, t.id)).toBeNull();
    expect(await listAuditEvents(b)).toEqual([]);
    expect((await computeMetrics(b)).ticketCount).toBe(0);
    expect((await retrieveEvidence(b, { subject: 'password', body: 'reset my password' }, 0)).chunks).toEqual([]);
    await expect(submitReview(b, { ticketId: t.id, reviewer: 'x', decision: 'approved' })).rejects.toMatchObject({ httpStatus: 404 });
    await expect(sendApproved(b, t.id)).rejects.toMatchObject({ httpStatus: 404 });

    // processTicket must be a no-op for a foreign ticket (including a still-unprocessed one).
    const fresh = await insertTicket(TENANT, { status: 'received' });
    await processTicket(b, fresh.id);
    const [after] = await getTestDb().select().from(tickets).where(eq(tickets.id, fresh.id));
    expect(after.status).toBe('received');
    expect(after.processingStartedAt).toBeNull();

    expect((await getTicketDetail(deps(TENANT), t.id))?.ticket.status).toBe('awaiting_review');
    expect(await getTestDb().select().from(reviews)).toHaveLength(0);
    expect(await getTestDb().select().from(outboundMessages)).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('even an approved ticket of tenant A cannot be sent by tenant B', async () => {
    await loadSamples(deps(TENANT));
    const a = deps(TENANT);
    const ok = (await listTickets(a, {})).find((x) => !x.needsHuman)!;
    await submitReview(a, { ticketId: ok.id, reviewer: 'r', decision: 'approved' });
    await expect(sendApproved(deps(OTHER_TENANT), ok.id)).rejects.toMatchObject({ httpStatus: 404 });
    expect(mailer.sent).toHaveLength(0);
    expect(await getTestDb().select().from(outboundMessages)).toHaveLength(0);
  });
});
