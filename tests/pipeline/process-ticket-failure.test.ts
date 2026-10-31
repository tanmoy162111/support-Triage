import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { ingestEmail } from '@/pipeline/ingest';
import { ensureSeeded } from '@/seed/seed';
import { MockLlm } from '@/adapters/mock-llm';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer } from '@/adapters/mailer';
import { getTestDb, resetDb, TENANT } from '../helpers/db';
import { tickets, auditEvents } from '@/db/schema';
import type { Deps } from '@/pipeline/deps';

let failRoute = false;
vi.mock('@/pipeline/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/pipeline/audit')>();
  return {
    ...actual,
    audit: async (...args: Parameters<typeof actual.audit>) => {
      if (failRoute && args[1].step === 'route') throw new Error('audit unavailable');
      return actual.audit(...args);
    },
  };
});
const { processTicket } = await import('@/pipeline/process-ticket');

const deps = (): Deps => ({ db: getTestDb(), llm: new MockLlm(), embedder: new MockEmbedder(), mailer: new MockMailer(), tenantId: TENANT, retrievalMinScore: 0.15 });
beforeEach(async () => { failRoute = false; await resetDb(); await ensureSeeded(deps()); });

describe('processTicket failure handler', () => {
  it('does not move an awaiting_review ticket to failed when the final route audit fails', async () => {
    failRoute = true;
    const { ticketId } = await ingestEmail(getTestDb(), TENANT, { messageId: 'm1', fromEmail: 'sam@acme.example', subject: 'Cannot log in', body: 'How do I reset my password?' });
    await processTicket(deps(), ticketId);
    const [t] = await getTestDb().select().from(tickets).where(eq(tickets.id, ticketId));
    expect(t.status).toBe('awaiting_review');
    expect(t.failureReason).toBeNull();
    const events = await getTestDb().select().from(auditEvents).where(eq(auditEvents.ticketId, ticketId));
    expect(events.some((e) => e.step === 'pipeline_error' && e.outcome === 'error')).toBe(true);
  });
});
