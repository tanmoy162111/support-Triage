import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDeps } from '@/server/deps';
import { submitReview } from '@/services/review';
import { sendApproved } from '@/services/send';
import { DomainError } from '@/domain/errors';
import { REVIEW_DECISIONS } from '@/domain/types';
import { handleError, readJson } from '@/server/http';

// Strict: unknown fields (e.g. reviewer, tenantId) are rejected, so a client can never supply them.
const Body = z.strictObject({
  decision: z.enum(REVIEW_DECISIONS),
  finalBody: z.string().max(10000).optional(),
  rejectReason: z.string().max(500).optional(),
});

// LIMITATION: single-user demo with no authentication. Every review is recorded as this fixed reviewer, and the
// tenant comes from server config (getDeps), never from the request. Real auth is out of scope for v1.
const DEMO_REVIEWER = 'demo-reviewer';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new DomainError('Ticket not found', 404);
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) throw new DomainError('Invalid request', 400);
    const deps = getDeps();
    await submitReview(deps, { ticketId: id, reviewer: DEMO_REVIEWER, ...parsed.data });
    if (parsed.data.decision === 'rejected') return NextResponse.json({ status: 'rejected' });
    const sent = await sendApproved(deps, id);
    return NextResponse.json({ status: 'sent', deliveryMode: sent.deliveryMode });
  } catch (e) {
    return handleError(e);
  }
}
