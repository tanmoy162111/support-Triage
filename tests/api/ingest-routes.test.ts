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
  paste.POST(new Request('http://x', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } }));
const sampleCall = (headers: Record<string, string> = {}) => sample.POST(new Request('http://x', { method: 'POST', headers }));
const good = { fromEmail: 'sam@acme.test', subject: 'Need help', body: 'How do I reset my password?' };

beforeEach(async () => { await resetDb(); mailer.sent.length = 0; });

describe('POST /api/ingest/sample', () => {
  it('creates 8 tickets, then 0 on repeat, and sends nothing', async () => {
    expect(sample.maxDuration).toBe(120);
    expect(await (await sampleCall()).json()).toEqual({ created: 8 });
    expect(await (await sampleCall()).json()).toEqual({ created: 0 });
    expect(mailer.sent).toHaveLength(0);
  });
});

describe('POST /api/ingest/sample origin check', () => {
  it('rejects a cross-origin request with 403 and creates nothing', async () => {
    expect((await sampleCall({ origin: 'https://evil.example', host: 'localhost:3000' })).status).toBe(403);
    expect(await getTestDb().select().from(tickets)).toHaveLength(0);
  });
  it('allows a same-origin request, honouring x-forwarded-host', async () => {
    expect((await sampleCall({ origin: 'https://app.example', host: 'internal:3000', 'x-forwarded-host': 'app.example' })).status).toBe(200);
  });
});

describe('POST /api/ingest/paste', () => {
  it('rejects a non-JSON content type with 415', async () => {
    const res = await pasteCall(JSON.stringify(good), { 'content-type': 'text/plain' });
    expect(res.status).toBe(415);
  });
  it('rejects a cross-origin request with 403', async () => {
    const res = await pasteCall(JSON.stringify(good), { origin: 'https://evil.example', host: 'localhost:3000' });
    expect(res.status).toBe(403);
  });
  it('creates an awaiting_review ticket with a paste- message id', async () => {
    await sampleCall(); // seeds help docs and customers
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
