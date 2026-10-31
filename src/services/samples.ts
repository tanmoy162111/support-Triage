import type { Deps } from '@/pipeline/deps';
import { ingestEmail } from '@/pipeline/ingest';
import { processTicket } from '@/pipeline/process-ticket';
import { ensureSeeded } from '@/seed/seed';
import { SAMPLE_TICKETS } from '@/seed/sample-tickets';

/** Loads synthetic customers, help docs and sample tickets. Idempotent. Nothing is sent. */
export async function loadSamples(deps: Deps): Promise<{ created: number }> {
  await ensureSeeded(deps);
  let created = 0;
  const ids: string[] = [];
  for (const s of SAMPLE_TICKETS) {
    const r = await ingestEmail(deps.db, deps.tenantId, s);
    if (r.created) { created++; ids.push(r.ticketId); }
  }
  // Process sequentially: simple, and gentle on provider rate limits.
  for (const id of ids) await processTicket(deps, id);
  return { created };
}
