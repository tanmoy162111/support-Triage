import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { MockLlm } from '@/adapters/mock-llm';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer } from '@/adapters/mailer';
import { reviews } from '@/db/schema';
import { getTestDb, resetDb, insertTicket, TENANT, OTHER_TENANT } from '../helpers/db';
import type { Deps } from '@/pipeline/deps';

const mailer = new MockMailer();
const testDeps = (): Deps => ({ db: getTestDb(), llm: new MockLlm(), embedder: new MockEmbedder(), mailer, tenantId: TENANT, retrievalMinScore: 0.15 });
vi.mock('@/server/deps', () => ({ getDeps: () => testDeps() }));

const { POST } = await import('@/app/api/tickets/[id]/review/route');
const { loadSamples } = await import('@/services/samples');
const { listTickets } = await import('@/services/queries');

const raw = (id: string, body: string, headers: Record<string, string> = {}) =>
  POST(new Request('http://x', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } }), { params: Promise.resolve({ id }) });
const call = (id: string, body: unknown) => raw(id, JSON.stringify(body));

beforeEach(async () => { await resetDb(); mailer.sent.length = 0; await loadSamples(testDeps()); });

describe('POST /api/tickets/[id]/review', () => {
  it('approve sends once (mock)', async () => {
    const t = (await listTickets(testDeps(), {})).find((x) => !x.needsHuman)!;
    const res = await call(t.id, { decision: 'approved' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'sent', deliveryMode: 'mock' });
    expect(mailer.sent).toHaveLength(1);
  });
  it('rejects invalid bodies with 400 and sends nothing', async () => {
    const [t] = await listTickets(testDeps(), {});
    expect((await call(t.id, { decision: 'bogus' })).status).toBe(400);
    expect(mailer.sent).toHaveLength(0);
  });
  it('reject without a reason is 400', async () => {
    const [t] = await listTickets(testDeps(), {});
    expect((await call(t.id, { decision: 'rejected' })).status).toBe(400);
  });
  it('a second approve is 409 and does not send again', async () => {
    const t = (await listTickets(testDeps(), {})).find((x) => !x.needsHuman)!;
    await call(t.id, { decision: 'approved' });
    expect((await call(t.id, { decision: 'approved' })).status).toBe(409);
    expect(mailer.sent).toHaveLength(1);
  });
  it('unknown ticket is 404', async () => {
    expect((await call(crypto.randomUUID(), { decision: 'approved' })).status).toBe(404);
  });

  it('a non-uuid ticket id is 404, not 500', async () => {
    expect((await call('not-a-uuid', { decision: 'approved' })).status).toBe(404);
  });

  it('malformed JSON is 400, not 500', async () => {
    const [t] = await listTickets(testDeps(), {});
    const res = await raw(t.id, '{not json');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid request' });
    expect((await raw(t.id, '')).status).toBe(400);
  });
  it('an oversized body is 413', async () => {
    const [t] = await listTickets(testDeps(), {});
    const res = await raw(t.id, JSON.stringify({ decision: 'edited', finalBody: 'x'.repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(mailer.sent).toHaveLength(0);
  });
  it('rejects a client-supplied reviewer or tenantId and does nothing', async () => {
    const t = (await listTickets(testDeps(), {})).find((x) => !x.needsHuman)!;
    expect((await call(t.id, { decision: 'approved', reviewer: 'attacker' })).status).toBe(400);
    expect((await call(t.id, { decision: 'approved', tenantId: OTHER_TENANT })).status).toBe(400);
    expect(mailer.sent).toHaveLength(0);
    expect(await getTestDb().select().from(reviews).where(eq(reviews.ticketId, t.id))).toHaveLength(0);
  });
  it('records the fixed demo reviewer', async () => {
    const t = (await listTickets(testDeps(), {})).find((x) => !x.needsHuman)!;
    await call(t.id, { decision: 'approved' });
    const [r] = await getTestDb().select().from(reviews).where(eq(reviews.ticketId, t.id));
    expect(r.reviewer).toBe('demo-reviewer');
  });
  it('reject never sends', async () => {
    const t = (await listTickets(testDeps(), {})).find((x) => !x.needsHuman)!;
    const res = await call(t.id, { decision: 'rejected', rejectReason: 'wrong tone' });
    expect(await res.json()).toEqual({ status: 'rejected' });
    expect(mailer.sent).toHaveLength(0);
  });
  it('cannot review another tenant\'s ticket (404)', async () => {
    const other = await insertTicket(OTHER_TENANT, { status: 'awaiting_review' });
    expect((await call(other.id, { decision: 'approved' })).status).toBe(404);
    expect(mailer.sent).toHaveLength(0);
  });

  it('a non-JSON content type is 415 and does nothing', async () => {
    const t = (await listTickets(testDeps(), {})).find((x) => !x.needsHuman)!;
    const res = await raw(t.id, JSON.stringify({ decision: 'approved' }), { 'content-type': 'text/plain' });
    expect(res.status).toBe(415);
    expect(mailer.sent).toHaveLength(0);
    expect(await getTestDb().select().from(reviews).where(eq(reviews.ticketId, t.id))).toHaveLength(0);
  });
  it('a cross-origin browser request is 403 and does nothing', async () => {
    const t = (await listTickets(testDeps(), {})).find((x) => !x.needsHuman)!;
    const res = await raw(t.id, JSON.stringify({ decision: 'approved' }), { origin: 'https://evil.example', host: 'localhost:3000' });
    expect(res.status).toBe(403);
    expect(mailer.sent).toHaveLength(0);
  });
  it('a same-origin browser request is allowed', async () => {
    const t = (await listTickets(testDeps(), {})).find((x) => !x.needsHuman)!;
    const res = await raw(t.id, JSON.stringify({ decision: 'approved' }), { origin: 'http://localhost:3000', host: 'localhost:3000' });
    expect(res.status).toBe(200);
  });
});
