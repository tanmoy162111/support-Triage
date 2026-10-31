import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import { getDeps } from '../src/server/deps';
import type { Deps } from '../src/pipeline/deps';
import { ensureSeeded } from '../src/seed/seed';
import { ingestEmail } from '../src/pipeline/ingest';
import { processTicket } from '../src/pipeline/process-ticket';
import { validateDraft } from '../src/domain/draft-validator';
import { tickets, classifications, drafts, kbChunks, outboundMessages, customers, reviews, auditEvents } from '../src/db/schema';
import { scoreRuns, type RunRecord } from './score';
import { DATASET_PATH } from './generate';

const CAVEAT = 'Synthetic data, small sample. These numbers do not establish production accuracy. With LLM_PROVIDER=mock they measure the mock keyword rules, not model quality.';

type Dataset = { version: string; cases: Array<{ id: string; kind: RunRecord['kind']; fromEmail: string; subject: string; body: string; expected: RunRecord['expected']; forbidden?: string[] }> };

/** Deletes every row of the eval tenant, children before parents. */
async function cleanup(deps: Deps): Promise<void> {
  const { db, tenantId } = deps;
  await db.delete(auditEvents).where(eq(auditEvents.tenantId, tenantId));
  await db.delete(outboundMessages).where(eq(outboundMessages.tenantId, tenantId));
  await db.delete(reviews).where(eq(reviews.tenantId, tenantId));
  await db.delete(drafts).where(eq(drafts.tenantId, tenantId));
  await db.delete(classifications).where(eq(classifications.tenantId, tenantId));
  await db.delete(tickets).where(eq(tickets.tenantId, tenantId));
  await db.delete(kbChunks).where(eq(kbChunks.tenantId, tenantId));
  await db.delete(customers).where(eq(customers.tenantId, tenantId));
}

async function main(): Promise<number> {
  const keep = process.argv.includes('--keep');
  let base: Deps;
  try { base = getDeps(); } catch (err) {
    // getDeps() throws static configuration messages (names of env vars, never values), safe to print.
    console.error(`eval cannot start: ${(err as Error).message}`);
    return 1;
  }
  const tenantId = `eval-${Date.now()}`;
  const deps: Deps = { ...base, tenantId };
  const data = JSON.parse(readFileSync(DATASET_PATH, 'utf8')) as Dataset;

  try {
    await ensureSeeded(deps);
    const kb = await deps.db.select().from(kbChunks).where(eq(kbChunks.tenantId, tenantId));
    const runs: RunRecord[] = [];

    for (const c of data.cases) {
      const start = performance.now();
      const { ticketId } = await ingestEmail(deps.db, tenantId, { messageId: c.id, fromEmail: c.fromEmail, subject: c.subject, body: c.body });
      await processTicket(deps, ticketId);
      const latencyMs = performance.now() - start;

      const [t] = await deps.db.select().from(tickets).where(eq(tickets.id, ticketId));
      const [cls] = await deps.db.select().from(classifications).where(eq(classifications.ticketId, ticketId));
      const [d] = await deps.db.select().from(drafts).where(eq(drafts.ticketId, ticketId));
      const sent = await deps.db.select().from(outboundMessages).where(and(eq(outboundMessages.ticketId, ticketId), eq(outboundMessages.tenantId, tenantId)));
      const [ret] = await deps.db.select({ detail: auditEvents.detail }).from(auditEvents)
        .where(and(eq(auditEvents.ticketId, ticketId), eq(auditEvents.tenantId, tenantId), eq(auditEvents.step, 'retrieve')));
      const cited = d?.citedChunkIds ?? [];
      // Retrieval is scored on what the retriever returned (audit detail), not only what the draft cited.
      const retrievedIds = new Set(((ret?.detail?.chunkIds as string[] | undefined) ?? []));
      const retrievedDocIds = [...new Set(kb.filter((k) => retrievedIds.has(k.id)).map((k) => k.docId))];
      const groundedOk = d && !d.isPlaceholder
        ? validateDraft({ reply: d.body, citedChunkIds: cited, retrieved: kb.map((k) => ({ ...k, score: 1 })) }).ok
        : false;

      runs.push({
        id: c.id, kind: c.kind, forbidden: c.forbidden, expected: c.expected, latencyMs,
        actual: {
          topic: cls?.topic ?? 'none', urgency: cls?.urgency ?? 'none', confidence: cls?.confidence ?? 0, retrievedDocIds,
          needsHuman: t.needsHuman, isPlaceholder: d?.isPlaceholder ?? true, groundedOk, replyBody: d?.body ?? '', status: t.status, sentCount: sent.length,
        },
      });
    }

    // Injection cases are excluded from accuracy; they are scored only by bypass count.
    const scored = scoreRuns(runs.filter((r) => r.kind !== 'injection'));
    const injectionScore = scoreRuns(runs.filter((r) => r.kind === 'injection'));
    const usage = deps.llm.usage;
    const failed = runs.filter((r) => r.actual.status === 'failed').map((r) => r.id);
    const summary = {
      datasetVersion: data.version, tenantId, provider: deps.llm.name, model: deps.llm.model,
      note: CAVEAT,
      totalCases: runs.length, failedTickets: failed,
      scored, injection: { cases: injectionScore.injectionCases, bypasses: injectionScore.injectionBypasses },
      usage, avgTokensPerTicket: runs.length ? (usage.inputTokens + usage.outputTokens) / runs.length : null,
    };
    mkdirSync('evals/results', { recursive: true });
    const outFile = `evals/results/${Date.now()}.json`;
    writeFileSync(outFile, JSON.stringify({ summary, runs }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    console.log(`results written to ${outFile}`);
    if (injectionScore.injectionBypasses > 0) { console.error('FAIL: injection bypasses detected'); return 1; }
    return 0;
  } finally {
    if (keep) console.log(`--keep: eval tenant ${tenantId} rows left in place`);
    else { await cleanup(deps); console.log(`cleaned up eval tenant ${tenantId}`); }
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => { console.error(`eval failed: ${(err as Error)?.name ?? 'Error'}`); process.exit(1); },
);
