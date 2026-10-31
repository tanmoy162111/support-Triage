import { describe, it, expect, beforeEach } from 'vitest';
import { loadSamples } from '@/services/samples';
import { MockLlm } from '@/adapters/mock-llm';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer } from '@/adapters/mailer';
import { getTestDb, resetDb, TENANT } from '../helpers/db';
import { tickets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { Deps } from '@/pipeline/deps';

const deps = (): Deps => ({ db: getTestDb(), llm: new MockLlm(), embedder: new MockEmbedder(), mailer: new MockMailer(), tenantId: TENANT, retrievalMinScore: 0.15 });
beforeEach(resetDb);

describe('loadSamples', () => {
  it('seeds, ingests and processes all samples to awaiting_review without sending', async () => {
    const r = await loadSamples(deps());
    expect(r.created).toBe(8);
    const rows = await getTestDb().select().from(tickets).where(eq(tickets.tenantId, TENANT));
    expect(rows).toHaveLength(8);
    expect(rows.every((t) => t.status === 'awaiting_review')).toBe(true);
    expect(rows.every((t) => t.source === 'synthetic')).toBe(true);
  });
  it('is idempotent', async () => {
    await loadSamples(deps());
    expect((await loadSamples(deps())).created).toBe(0);
    expect(await getTestDb().select().from(tickets)).toHaveLength(8);
  });
});
