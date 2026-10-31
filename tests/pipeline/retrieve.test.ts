import { describe, it, expect, beforeEach } from 'vitest';
import { retrieveEvidence } from '@/pipeline/retrieve';
import { ensureSeeded } from '@/seed/seed';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { kbChunks, customers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb, TENANT, OTHER_TENANT } from '../helpers/db';

const embedder = new MockEmbedder();
const deps = (tenantId = TENANT) => ({ db: getTestDb(), embedder, tenantId });
const MIN = 0.15;

beforeEach(async () => { await resetDb(); await ensureSeeded(deps()); });

describe('retrieveEvidence', () => {
  it('finds the password reset doc for a login problem', async () => {
    const r = await retrieveEvidence(deps(), { subject: 'Cannot log in', body: 'How do I reset my password? The reset email never arrives.' }, MIN);
    expect(r.status).toBe('ok');
    expect(r.chunks[0].docId).toBe('reset-password');
  });
  it('returns none when nothing is relevant', async () => {
    const r = await retrieveEvidence(deps(), { subject: 'Partnership', body: 'zebra quantum helicopter' }, MIN);
    expect(r).toMatchObject({ status: 'none', chunks: [] });
  });
  it('flags conflicting versions of the same document', async () => {
    const r = await retrieveEvidence(deps(), { subject: 'Export', body: 'How long can I download my exported data? Exports available for how many days' }, MIN);
    expect(r.status).toBe('conflicting');
    const versions = r.chunks.filter((c) => c.docId === 'export-data').map((c) => c.version).sort();
    expect(versions).toEqual(['1', '2']);
  });
  it('is tenant scoped', async () => {
    const r = await retrieveEvidence(deps(OTHER_TENANT), { subject: 'Reset', body: 'reset my password' }, MIN);
    expect(r.chunks).toEqual([]);
  });
  it('ignores unpublished chunks', async () => {
    await getTestDb().update(kbChunks).set({ published: false }).where(eq(kbChunks.docId, 'reset-password'));
    const r = await retrieveEvidence(deps(), { subject: 'Reset', body: 'reset my password' }, MIN);
    expect(r.chunks.every((c) => c.docId !== 'reset-password')).toBe(true);
  });
});

describe('ensureSeeded', () => {
  it('is idempotent and tenant scoped', async () => {
    expect(await ensureSeeded(deps())).toBe(false);
    expect(await ensureSeeded(deps(OTHER_TENANT))).toBe(true);
    const db = getTestDb();
    const a = await db.select().from(kbChunks).where(eq(kbChunks.tenantId, TENANT));
    const b = await db.select().from(kbChunks).where(eq(kbChunks.tenantId, OTHER_TENANT));
    expect(a.length).toBe(b.length);
    const cs = await db.select().from(customers).where(eq(customers.tenantId, OTHER_TENANT));
    expect(cs.every((c) => c.email.endsWith('.example'))).toBe(true);
  });
});
