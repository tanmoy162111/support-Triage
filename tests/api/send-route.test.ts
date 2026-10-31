import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { MockLlm } from '@/adapters/mock-llm';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer } from '@/adapters/mailer';
import { outboundMessages, tickets } from '@/db/schema';
import { getTestDb, resetDb, insertTicket, TENANT, OTHER_TENANT } from '../helpers/db';
import type { Deps } from '@/pipeline/deps';

const mailer = new MockMailer();
const testDeps = (): Deps => ({ db: getTestDb(), llm: new MockLlm(), embedder: new MockEmbedder(), mailer, tenantId: TENANT, retrievalMinScore: 0.15 });
vi.mock('@/server/deps', () => ({ getDeps: () => testDeps() }));

const { POST } = await import('@/app/api/tickets/[id]/send/route');
const { loadSamples } = await import('@/services/samples');
const { listTickets } = await import('@/services/queries');
const { submitReview } = await import('@/services/review');

const send = (id: string, body?: string) =>
  POST(new Request('http://x', { method: 'POST', body }), { params: Promise.resolve({ id }) });

beforeEach(async () => { await resetDb(); mailer.sent.length = 0; await loadSamples(testDeps()); });

describe('POST /api/tickets/[id]/send', () => {
  it('sends an approved ticket that has no outbound row, then is idempotent', async () => {
    const t = (await listTickets(testDeps(), {})).find((x) => !x.needsHuman)!;
    // Simulates a send that threw before claiming the outbound row: review recorded, ticket approved, nothing sent.
    await submitReview(testDeps(), { ticketId: t.id, reviewer: 'demo-reviewer', decision: 'approved' });
    const db = getTestDb();
    expect((await db.select().from(tickets).where(eq(tickets.id, t.id)))[0].status).toBe('approved');
    expect(await db.select().from(outboundMessages).where(eq(outboundMessages.ticketId, t.id))).toHaveLength(0);

    const res = await send(t.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'sent', deliveryMode: 'mock' });
    expect(mailer.sent).toHaveLength(1);

    const again = await send(t.id);
    expect(again.status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(await db.select().from(outboundMessages).where(eq(outboundMessages.ticketId, t.id))).toHaveLength(1);
  });
  it('an awaiting_review ticket is 409 and sends nothing', async () => {
    const [t] = await listTickets(testDeps(), {});
    expect((await send(t.id)).status).toBe(409);
    expect(mailer.sent).toHaveLength(0);
  });
  it('another tenant\'s ticket is 404', async () => {
    const other = await insertTicket(OTHER_TENANT, { status: 'approved' });
    expect((await send(other.id)).status).toBe(404);
    expect(mailer.sent).toHaveLength(0);
  });
  it('unknown and non-uuid ids are 404', async () => {
    expect((await send(crypto.randomUUID())).status).toBe(404);
    expect((await send('not-a-uuid')).status).toBe(404);
  });
  it('accepts no body fields', async () => {
    const t = (await listTickets(testDeps(), {})).find((x) => !x.needsHuman)!;
    await submitReview(testDeps(), { ticketId: t.id, reviewer: 'demo-reviewer', decision: 'approved' });
    expect((await send(t.id, JSON.stringify({ finalBody: 'x' }))).status).toBe(400);
    expect(mailer.sent).toHaveLength(0);
  });
});
