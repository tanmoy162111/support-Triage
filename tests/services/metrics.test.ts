import { describe, it, expect, beforeEach } from 'vitest';
import { computeMetrics } from '@/services/metrics';
import { loadSamples } from '@/services/samples';
import { submitReview } from '@/services/review';
import { sendApproved } from '@/services/send';
import { MockLlm } from '@/adapters/mock-llm';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer } from '@/adapters/mailer';
import { getTestDb, resetDb, TENANT } from '../helpers/db';
import { tickets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { Deps } from '@/pipeline/deps';

const deps = (): Deps => ({ db: getTestDb(), llm: new MockLlm(), embedder: new MockEmbedder(), mailer: new MockMailer(), tenantId: TENANT, retrievalMinScore: 0.15 });
beforeEach(resetDb);

describe('computeMetrics', () => {
  it('returns nulls and zeros with no data (no fabricated numbers)', async () => {
    expect(await computeMetrics(deps())).toMatchObject({ ticketCount: 0, sentCount: 0, avgFirstResponseSec: null, avgIngestToApprovalSec: null, acceptance: { total: 0 } });
  });
  it('counts unchanged, light and rewritten outcomes from real reviews', async () => {
    const d = deps();
    await loadSamples(d);
    const rows = await d.db.select().from(tickets).where(eq(tickets.tenantId, TENANT));
    const withDraft = rows.filter((t) => !t.needsHuman);
    const [a, b] = withDraft;
    await submitReview(d, { ticketId: a.id, reviewer: 'r', decision: 'approved' });
    await sendApproved(d, a.id);
    await submitReview(d, { ticketId: b.id, reviewer: 'r', decision: 'edited', finalBody: 'Completely different words entirely here.' });
    const m = await computeMetrics(d);
    expect(m.ticketCount).toBe(8);
    expect(m.sentCount).toBe(1);
    expect(m.acceptance).toMatchObject({ unchanged: 1, rewritten: 1, total: 2 });
    expect(m.avgFirstResponseSec).not.toBeNull();
    expect(m.avgIngestToApprovalSec).not.toBeNull();
  });
});
