import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { submitReview } from '@/services/review';
import { processTicket } from '@/pipeline/process-ticket';
import { ingestEmail } from '@/pipeline/ingest';
import { ensureSeeded } from '@/seed/seed';
import { MockLlm } from '@/adapters/mock-llm';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer } from '@/adapters/mailer';
import { getTestDb, resetDb, TENANT, OTHER_TENANT } from '../helpers/db';
import { tickets, reviews } from '@/db/schema';
import type { Deps } from '@/pipeline/deps';

const deps = (tenantId = TENANT): Deps => ({ db: getTestDb(), llm: new MockLlm(), embedder: new MockEmbedder(), mailer: new MockMailer(), tenantId, retrievalMinScore: 0.15 });

async function awaitingReview(body = 'How do I reset my password? The reset email never arrives.') {
  const d = deps();
  const { ticketId } = await ingestEmail(d.db, TENANT, { messageId: crypto.randomUUID(), fromEmail: 'sam@acme.example', subject: 'Login', body });
  await processTicket(d, ticketId);
  return { d, ticketId };
}
beforeEach(async () => { await resetDb(); await ensureSeeded(deps()); });

describe('submitReview', () => {
  it('approves an awaiting ticket and records the review and reviewer', async () => {
    const { d, ticketId } = await awaitingReview();
    const r = await submitReview(d, { ticketId, reviewer: 'demo', decision: 'approved' });
    expect(r.finalBody.length).toBeGreaterThan(0);
    const [t] = await d.db.select().from(tickets).where(eq(tickets.id, ticketId));
    expect(t.status).toBe('approved');
    const rows = await d.db.select().from(reviews);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reviewer: 'demo', decision: 'approved', finalBody: r.finalBody });
  });
  it('stores the edited body for edited decisions', async () => {
    const { d, ticketId } = await awaitingReview();
    const r = await submitReview(d, { ticketId, reviewer: 'demo', decision: 'edited', finalBody: 'My own words.' });
    expect(r.finalBody).toBe('My own words.');
  });
  it('requires a reason to reject and moves the ticket to rejected', async () => {
    const { d, ticketId } = await awaitingReview();
    await expect(submitReview(d, { ticketId, reviewer: 'demo', decision: 'rejected' })).rejects.toThrow(/reason/i);
    await expect(submitReview(d, { ticketId, reviewer: 'demo', decision: 'rejected', rejectReason: '  ' })).rejects.toThrow(/reason/i);
    await submitReview(d, { ticketId, reviewer: 'demo', decision: 'rejected', rejectReason: 'Wrong topic' });
    const [t] = await d.db.select().from(tickets).where(eq(tickets.id, ticketId));
    expect(t.status).toBe('rejected');
  });
  it('refuses to approve a placeholder draft unchanged', async () => {
    const { d, ticketId } = await awaitingReview('zebra quantum helicopter');
    await expect(submitReview(d, { ticketId, reviewer: 'demo', decision: 'approved' })).rejects.toThrow(/placeholder|own reply/i);
    await expect(submitReview(d, { ticketId, reviewer: 'demo', decision: 'edited', finalBody: '   ' })).rejects.toThrow();
    expect(await d.db.select().from(reviews)).toHaveLength(0);
    await expect(submitReview(d, { ticketId, reviewer: 'demo', decision: 'edited', finalBody: 'Human-written reply.' })).resolves.toBeTruthy();
  });
  it('cannot review a ticket twice', async () => {
    const { d, ticketId } = await awaitingReview();
    await submitReview(d, { ticketId, reviewer: 'demo', decision: 'approved' });
    await expect(submitReview(d, { ticketId, reviewer: 'demo', decision: 'rejected', rejectReason: 'late' })).rejects.toThrow(/Invalid ticket transition/);
    expect(await d.db.select().from(reviews)).toHaveLength(1);
  });
  it('concurrent reviews on one ticket: exactly one wins, one review row', async () => {
    const { d, ticketId } = await awaitingReview();
    const results = await Promise.allSettled([
      submitReview(d, { ticketId, reviewer: 'a', decision: 'approved' }),
      submitReview(d, { ticketId, reviewer: 'b', decision: 'rejected', rejectReason: 'no' }),
      submitReview(d, { ticketId, reviewer: 'c', decision: 'edited', finalBody: 'x' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await d.db.select().from(reviews)).toHaveLength(1);
  });
  it('cannot review another tenant\'s ticket and has no effects', async () => {
    const { ticketId } = await awaitingReview();
    await expect(submitReview(deps(OTHER_TENANT), { ticketId, reviewer: 'demo', decision: 'approved' })).rejects.toMatchObject({ httpStatus: 404 });
    expect(await getTestDb().select().from(reviews)).toHaveLength(0);
    const [t] = await getTestDb().select().from(tickets).where(eq(tickets.id, ticketId));
    expect(t.status).toBe('awaiting_review');
  });
});
