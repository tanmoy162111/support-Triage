import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDeps } from '@/server/deps';
import { ingestEmail } from '@/pipeline/ingest';
import { processTicket } from '@/pipeline/process-ticket';
import { DomainError } from '@/domain/errors';
import { handleError, readJson } from '@/server/http';

export const maxDuration = 120;

// Caps mirror the ingest layer (subject 300, body 20000) so oversized JSON is rejected early. Strict: no unknown fields.
const Body = z.strictObject({
  fromEmail: z.string().email().max(255),
  subject: z.string().max(300),
  body: z.string().min(1).max(20000),
});

/** Ingests one pasted (synthetic/mock inbox) email and runs the pipeline inline. It stops at awaiting_review. */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) throw new DomainError('Invalid request', 400);
    const deps = getDeps();
    const { ticketId, created } = await ingestEmail(deps.db, deps.tenantId, { ...parsed.data, messageId: `paste-${crypto.randomUUID()}` });
    if (created) await processTicket(deps, ticketId);
    return NextResponse.json({ ticketId });
  } catch (e) {
    return handleError(e);
  }
}
