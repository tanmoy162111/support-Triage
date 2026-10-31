import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockLlm } from '@/adapters/mock-llm';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer } from '@/adapters/mailer';
import { tickets } from '@/db/schema';
import { getTestDb, resetDb, TENANT } from '../helpers/db';
import type { Deps } from '@/pipeline/deps';

const mailer = new MockMailer();
const testDeps = (): Deps => ({ db: getTestDb(), llm: new MockLlm(), embedder: new MockEmbedder(), mailer, tenantId: TENANT, retrievalMinScore: 0.15 });
vi.mock('@/server/deps', () => ({ getDeps: () => testDeps() }));

const sample = await import('@/app/api/ingest/sample/route');
const paste = await import('@/app/api/ingest/paste/route');

const pasteCall = (body: string, headers: Record<string, string> = {}) =>
  paste.POST(new Request('http://x', { method: 'POST', body, headers }));
const good = { fromEmail: 'sam@acme.test', subject: 'Need help', body: 'How do I reset my password?' };

beforeEach(async () => { await resetDb(); mailer.sent.length = 0; });

describe('POST /api/ingest/sample', () => {
  it('creates 8 tickets, then 0 on repeat, and sends nothing', async () => {
    expect(sample.maxDuration).toBe(120);
    expect(await (await sample.POST()).json()).toEqual({ created: 8 });
    expect(await (await sample.POST()).json()).toEqual({ created: 0 });
    expect(mailer.sent).toHaveLength(0);
  });
});

describe('POST /api/ingest/paste', () => {
  it('creates an awaiting_review ticket with a paste- message id', async () => {
    await sample.POST(); // seeds help docs and customers
    const res = await pasteCall(JSON.stringify(good));
    expect(res.status).toBe(200);
    const { ticketId } = await res.json();
    const rows = (await getTestDb().select().from(tickets)).filter((t) => t.id === ticketId);
    expect(rows[0].status).toBe('awaiting_review');
    expect(rows[0].messageId).toMatch(/^paste-[0-9a-f-]{36}$/);
    expect(mailer.sent).toHaveLength(0);
  });
  it('rejects a bad email with 400', async () => {
    expect((await pasteCall(JSON.stringify({ ...good, fromEmail: 'nope' }))).status).toBe(400);
  });
  it('rejects oversized fields with 400', async () => {
    expect((await pasteCall(JSON.stringify({ ...good, body: 'x'.repeat(20001) }))).status).toBe(400);
    expect((await pasteCall(JSON.stringify({ ...good, subject: 'x'.repeat(301) }))).status).toBe(400);
  });
  it('rejects a huge request with 413', async () => {
    expect((await pasteCall(JSON.stringify({ ...good, body: 'x'.repeat(300_000) }))).status).toBe(413);
  });
  it('rejects non-JSON and unknown fields with 400', async () => {
    expect((await pasteCall('not json')).status).toBe(400);
    expect((await pasteCall(JSON.stringify({ ...good, tenantId: 'x' }))).status).toBe(400);
    expect((await pasteCall(JSON.stringify([]))).status).toBe(400);
  });
  it('no tickets are created for invalid input', async () => {
    await pasteCall(JSON.stringify({ ...good, fromEmail: 'nope' }));
    expect(await getTestDb().select().from(tickets)).toHaveLength(0);
  });
});
