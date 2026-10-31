import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { sendApproved } from '@/services/send';
import { submitReview } from '@/services/review';
import { processTicket } from '@/pipeline/process-ticket';
import { ingestEmail } from '@/pipeline/ingest';
import { ensureSeeded } from '@/seed/seed';
import { MockLlm } from '@/adapters/mock-llm';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer, type Mailer } from '@/adapters/mailer';
import { getTestDb, resetDb, TENANT, OTHER_TENANT } from '../helpers/db';
import { tickets, outboundMessages, reviews, drafts, auditEvents } from '@/db/schema';
import { ApprovalRequiredError } from '@/domain/errors';
import type { Deps } from '@/pipeline/deps';

const mailer = new MockMailer();
const mk = (over: Partial<Deps> = {}): Deps => ({ db: getTestDb(), llm: new MockLlm(), embedder: new MockEmbedder(), mailer, tenantId: TENANT, retrievalMinScore: 0.15, ...over });

async function ready() {
  const d = mk();
  const { ticketId } = await ingestEmail(d.db, TENANT, { messageId: crypto.randomUUID(), fromEmail: 'sam@acme.example', subject: 'Login', body: 'How do I reset my password? The reset email never arrives.' });
  await processTicket(d, ticketId);
  return { d, ticketId };
}
const outbound = () => getTestDb().select().from(outboundMessages);
beforeEach(async () => { await resetDb(); mailer.sent.length = 0; await ensureSeeded(mk()); });

describe('sendApproved (approval gate)', () => {
  it('refuses to send a ticket that is awaiting review', async () => {
    const { d, ticketId } = await ready();
    await expect(sendApproved(d, ticketId)).rejects.toThrow(ApprovalRequiredError);
    expect(mailer.sent).toHaveLength(0);
    expect(await outbound()).toHaveLength(0);
  });
  it('refuses to send a rejected ticket', async () => {
    const { d, ticketId } = await ready();
    await submitReview(d, { ticketId, reviewer: 'demo', decision: 'rejected', rejectReason: 'no' });
    await expect(sendApproved(d, ticketId)).rejects.toThrow(ApprovalRequiredError);
    expect(mailer.sent).toHaveLength(0);
    expect(await outbound()).toHaveLength(0);
  });
  it('refuses a ticket that has no review at all', async () => {
    const { d, ticketId } = await ready();
    await d.db.update(tickets).set({ status: 'approved' }).where(eq(tickets.id, ticketId));
    await expect(sendApproved(d, ticketId)).rejects.toThrow(ApprovalRequiredError);
    expect(mailer.sent).toHaveLength(0);
    expect(await outbound()).toHaveLength(0);
  });
  it('does not send when the latest review is rejected even if an older one was approved', async () => {
    const { d, ticketId } = await ready();
    await submitReview(d, { ticketId, reviewer: 'demo', decision: 'approved' });
    const [old] = await d.db.select().from(reviews);
    await d.db.insert(reviews).values({
      tenantId: TENANT, draftId: old.draftId, ticketId, reviewer: 'later', decision: 'rejected', rejectReason: 'changed mind',
      createdAt: new Date(old.createdAt.getTime() + 1000),
    });
    await expect(sendApproved(d, ticketId)).rejects.toThrow(ApprovalRequiredError);
    expect(mailer.sent).toHaveLength(0);
    expect(await outbound()).toHaveLength(0);
  });
  it('sends the approved text once (mock) and marks the ticket sent', async () => {
    const { d, ticketId } = await ready();
    const r = await submitReview(d, { ticketId, reviewer: 'demo', decision: 'edited', finalBody: 'Final approved text.' });
    const out = await sendApproved(d, ticketId);
    expect(out).toMatchObject({ deliveryMode: 'mock' });
    expect(mailer.sent).toEqual([expect.objectContaining({ to: 'sam@acme.example', body: 'Final approved text.', idempotencyKey: `send:${r.reviewId}` })]);
    const [t] = await d.db.select().from(tickets).where(eq(tickets.id, ticketId));
    expect(t.status).toBe('sent');
    const [o] = await outbound();
    expect(o).toMatchObject({ reviewId: r.reviewId, result: expect.stringMatching(/^mock:/), body: 'Final approved text.' });
  });
  it('sends the edited text, never the original draft; and the draft text when approved unchanged', async () => {
    const { d, ticketId } = await ready();
    const [draft] = await d.db.select().from(drafts).where(eq(drafts.ticketId, ticketId));
    await submitReview(d, { ticketId, reviewer: 'demo', decision: 'edited', finalBody: '  Edited reply.  ' });
    await sendApproved(d, ticketId);
    expect(mailer.sent[0].body).toBe('Edited reply.');
    expect(mailer.sent[0].body).not.toBe(draft.body);

    mailer.sent.length = 0;
    const second = await ready();
    const [draft2] = await d.db.select().from(drafts).where(eq(drafts.ticketId, second.ticketId));
    await submitReview(second.d, { ticketId: second.ticketId, reviewer: 'demo', decision: 'approved' });
    await sendApproved(second.d, second.ticketId);
    expect(mailer.sent[0].body).toBe(draft2.body);
  });
  it('is idempotent: a second call does not send again', async () => {
    const { d, ticketId } = await ready();
    await submitReview(d, { ticketId, reviewer: 'demo', decision: 'approved' });
    const a = await sendApproved(d, ticketId);
    const b = await sendApproved(d, ticketId);
    expect(b.outboundId).toBe(a.outboundId);
    expect(mailer.sent).toHaveLength(1);
    expect(await outbound()).toHaveLength(1);
  });
  it('concurrent double-submit sends once', async () => {
    const { d, ticketId } = await ready();
    await submitReview(d, { ticketId, reviewer: 'demo', decision: 'approved' });
    await Promise.allSettled([sendApproved(d, ticketId), sendApproved(d, ticketId), sendApproved(d, ticketId)]);
    expect(mailer.sent).toHaveLength(1);
    expect(await outbound()).toHaveLength(1);
  });
  it('claims the idempotency key before calling the mailer', async () => {
    const { d, ticketId } = await ready();
    const r = await submitReview(d, { ticketId, reviewer: 'demo', decision: 'approved' });
    let seen: unknown[] = [];
    const spy: Mailer = { send: async (e) => { seen = await outbound(); return { mode: 'mock', id: e.idempotencyKey }; } };
    await sendApproved(mk({ mailer: spy }), ticketId);
    expect(seen).toEqual([expect.objectContaining({ idempotencyKey: `send:${r.reviewId}`, result: 'pending' })]);
  });
  it('on mailer failure marks outbound and ticket failed, propagates, and never re-sends', async () => {
    const { d, ticketId } = await ready();
    await submitReview(d, { ticketId, reviewer: 'demo', decision: 'approved' });
    let calls = 0;
    const boom: Mailer = { send: async () => { calls++; throw new Error('SECRET smtp body text'); } };
    await expect(sendApproved(mk({ mailer: boom }), ticketId)).rejects.toThrow(/SECRET/);
    const [t] = await d.db.select().from(tickets).where(eq(tickets.id, ticketId));
    expect(t).toMatchObject({ status: 'failed', failureReason: 'send failed' });
    const [o] = await outbound();
    expect(o.result).toBe('failed');
    const [ev] = await d.db.select().from(auditEvents).where(eq(auditEvents.step, 'send'));
    expect(JSON.stringify(ev.detail)).not.toContain('SECRET');

    await expect(sendApproved(mk({ mailer: boom }), ticketId)).rejects.toThrow();
    await expect(sendApproved(d, ticketId)).rejects.toThrow();
    expect(calls).toBe(1);
    expect(mailer.sent).toHaveLength(0);
    expect(await outbound()).toHaveLength(1);
  });
  it('writes an audit event on send without body text, with the reviewer', async () => {
    const { d, ticketId } = await ready();
    await submitReview(d, { ticketId, reviewer: 'alice', decision: 'edited', finalBody: 'Totally unique body 12345.' });
    await sendApproved(d, ticketId);
    const evs = await d.db.select().from(auditEvents).where(eq(auditEvents.step, 'send'));
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ outcome: 'ok', ticketId });
    expect(JSON.stringify(evs[0].detail)).not.toContain('Totally unique');
    expect(evs[0].detail).toMatchObject({ reviewer: 'alice' });
  });
  it('rejects a different tenant with 404 and no effects', async () => {
    const { d, ticketId } = await ready();
    await submitReview(d, { ticketId, reviewer: 'demo', decision: 'approved' });
    await expect(sendApproved(mk({ tenantId: OTHER_TENANT }), ticketId)).rejects.toMatchObject({ httpStatus: 404 });
    expect(mailer.sent).toHaveLength(0);
    expect(await outbound()).toHaveLength(0);
    const [t] = await d.db.select().from(tickets).where(eq(tickets.id, ticketId));
    expect(t.status).toBe('approved');
  });
});
