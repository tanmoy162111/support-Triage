import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ingestEmail } from '@/pipeline/ingest';
import { processTicket } from '@/pipeline/process-ticket';
import { submitReview } from '@/services/review';
import { sendApproved } from '@/services/send';
import { ensureSeeded } from '@/seed/seed';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer, type Mailer } from '@/adapters/mailer';
import { MockLlm } from '@/adapters/mock-llm';
import { StructuredOutputError } from '@/adapters/llm';
import { FakeLlm } from '../helpers/fake-llm';
import { getTestDb, resetDb, TENANT } from '../helpers/db';
import { auditEvents, outboundMessages, tickets } from '@/db/schema';
import type { Deps } from '@/pipeline/deps';
import type { Embedder } from '@/adapters/embedder';

const base = (over: Partial<Deps> = {}): Deps => ({ db: getTestDb(), llm: new MockLlm(), embedder: new MockEmbedder(), mailer: new MockMailer(), tenantId: TENANT, retrievalMinScore: 0.15, ...over });
beforeEach(async () => { await resetDb(); await ensureSeeded(base()); });

async function run(deps: Deps) {
  const { ticketId } = await ingestEmail(deps.db, TENANT, { messageId: crypto.randomUUID(), fromEmail: 'sam@acme.example', subject: 'Login', body: 'How do I reset my password?' });
  await processTicket(deps, ticketId);
  const [t] = await deps.db.select().from(tickets).where(eq(tickets.id, ticketId));
  return t;
}

describe('failure paths are visible, not silent', () => {
  it('embedding outage -> failed, names the step, and never leaks the error message', async () => {
    const broken: Embedder = { name: 'broken', embed: async () => { throw new Error('SENTINEL-LEAK embedding service down'); } };
    const deps = base({ embedder: broken });
    const t = await run(deps);
    expect(t.status).toBe('failed');
    expect(t.failureReason).toContain('retrieve');
    expect(t.failureReason).not.toContain('SENTINEL-LEAK');
    const events = await deps.db.select().from(auditEvents).where(eq(auditEvents.ticketId, t.id));
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events.map((e) => e.detail))).not.toContain('SENTINEL-LEAK');
    expect(JSON.stringify(events)).not.toContain('SENTINEL-LEAK');
  });

  it('LLM timeout during draft -> failed, naming the draft step', async () => {
    const llm = new FakeLlm({
      classification: [{ value: { topic: 'login_access', urgency: 'normal', confidence: 0.9, reasons: [] } }],
      draft: [{ error: Object.assign(new Error('SENTINEL-LEAK timed out'), { name: 'TimeoutError' }) }],
    });
    const t = await run(base({ llm }));
    expect(t.status).toBe('failed');
    expect(t.failureReason).toContain('draft');
    expect(t.failureReason).not.toContain('SENTINEL-LEAK');
  });

  it('malformed classification twice -> human review with classification_invalid, not a crash', async () => {
    const llm = new FakeLlm({
      classification: [{ error: new StructuredOutputError('bad') }, { error: new StructuredOutputError('bad') }],
      draft: [{ value: { reply: 'Use the Forgot password link.', cited_chunk_ids: ['c1'], unsupported_points: [] } }],
    });
    const t = await run(base({ llm }));
    expect(t.status).toBe('awaiting_review');
    expect(t.needsHuman).toBe(true);
    expect(t.needsHumanReasons).toContain('classification_invalid');
    expect(t.needsHumanReasons).not.toContain('low_confidence');
  });

  it('mailer throwing during send -> ticket failed, outbound failed, no retry', async () => {
    let calls = 0;
    const mailer: Mailer = { send: async () => { calls++; throw new Error('SENTINEL-LEAK smtp down'); } };
    const deps = base({ mailer });
    const t = await run(deps);
    expect(t.status).toBe('awaiting_review');
    await submitReview(deps, { ticketId: t.id, reviewer: 'r', decision: 'approved' });
    await expect(sendApproved(deps, t.id)).rejects.toThrow();
    const [after] = await deps.db.select().from(tickets).where(eq(tickets.id, t.id));
    expect(after.status).toBe('failed');
    const outs = await deps.db.select().from(outboundMessages);
    expect(outs).toHaveLength(1);
    expect(outs[0].result).toBe('failed');
    expect(JSON.stringify(await deps.db.select().from(auditEvents))).not.toContain('SENTINEL-LEAK');
    // A second attempt must not call the mailer again.
    await expect(sendApproved(deps, t.id)).rejects.toMatchObject({ httpStatus: 409 });
    expect(calls).toBe(1);
  });
});
