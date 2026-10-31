import { describe, it, expect, beforeEach } from 'vitest';
import { listTickets, getTicketDetail } from '@/services/queries';
import { loadSamples } from '@/services/samples';
import { MockLlm } from '@/adapters/mock-llm';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer } from '@/adapters/mailer';
import { getTestDb, resetDb, insertTicket, TENANT, OTHER_TENANT } from '../helpers/db';
import { classifications, tickets } from '@/db/schema';
import type { Deps } from '@/pipeline/deps';

const deps = (tenantId = TENANT): Deps => ({ db: getTestDb(), llm: new MockLlm(), embedder: new MockEmbedder(), mailer: new MockMailer(), tenantId, retrievalMinScore: 0.15 });
beforeEach(resetDb);

describe('queries', () => {
  it('lists tickets sorted by urgency then age, filtered by status, tenant scoped', async () => {
    await loadSamples(deps());
    const all = await listTickets(deps(), {});
    expect(all).toHaveLength(8);
    const order = ['critical', 'high', 'normal', 'low'];
    const ranks = all.map((t) => order.indexOf(t.urgency ?? 'normal'));
    expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
    expect(await listTickets(deps(), { status: 'sent' })).toHaveLength(0);
    expect(await listTickets(deps(OTHER_TENANT), {})).toHaveLength(0);
  });
  it('returns full detail including citations resolved to passages', async () => {
    await loadSamples(deps());
    const [first] = await listTickets(deps(), {});
    const d = await getTicketDetail(deps(), first.id);
    expect(d?.ticket.id).toBe(first.id);
    expect(d?.classification).toBeTruthy();
    expect(d?.draft).toBeTruthy();
    expect(Array.isArray(d?.citations)).toBe(true);
  });
  it('returns null for another tenant\'s ticket', async () => {
    await loadSamples(deps());
    const [first] = await listTickets(deps(), {});
    expect(await getTicketDetail(deps(OTHER_TENANT), first.id)).toBeNull();
  });
});

describe('listTickets pagination and ordering', () => {
  it('pages 25 at a time, oldest first within equal urgency, unclassified treated as normal', async () => {
    for (let i = 0; i < 30; i++) {
      await insertTicket(TENANT, { subject: `t${i}`, receivedAt: new Date(Date.UTC(2026, 0, 1, 0, i)) });
    }
    await insertTicket(OTHER_TENANT, { subject: 'other' });
    const p0 = await listTickets(deps(), { page: 0 });
    const p1 = await listTickets(deps(), { page: 1 });
    expect(p0).toHaveLength(25);
    expect(p1).toHaveLength(5);
    expect(p0[0].subject).toBe('t0');
    expect(p1[0].subject).toBe('t25');
    expect(p0.every((t) => t.urgency === null)).toBe(true);
    expect(await listTickets(deps(), { page: 2 })).toHaveLength(0);
    expect(await listTickets(deps(), {})).toHaveLength(30);
  });
  it('sorts critical before unclassified-normal regardless of age and caps results at 200', async () => {
    const old = await insertTicket(TENANT, { subject: 'old-normal', receivedAt: new Date(Date.UTC(2020, 0, 1)) });
    const crit = await insertTicket(TENANT, { subject: 'new-critical', receivedAt: new Date(Date.UTC(2026, 0, 1)) });
    await getTestDb().insert(classifications).values({ tenantId: TENANT, ticketId: crit.id, topic: 'other', urgency: 'critical', confidence: 0.9, valid: true, promptVersion: 'v', model: 'm' });
    const list = await listTickets(deps(), {});
    expect(list.map((t) => t.subject)).toEqual(['new-critical', 'old-normal']);
    expect(old.id).toBeTruthy();
    await getTestDb().insert(tickets).values(Array.from({ length: 210 }, (_, i) => ({ tenantId: TENANT, messageId: `bulk-${i}`, fromEmail: 'x@y.test', subject: 'bulk', body: 'b' })));
    expect(await listTickets(deps(), {})).toHaveLength(200);
  });
});
