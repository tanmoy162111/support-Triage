import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDeps } from '@/server/deps';
import { sendApproved } from '@/services/send';
import { DomainError } from '@/domain/errors';
import { handleError } from '@/server/http';

/**
 * Retry path for a ticket stuck in `approved` (the review was recorded but the send never claimed its outbound
 * row). It only calls sendApproved(), which itself requires the latest review to be approved/edited and the
 * ticket to be `approved`, is idempotent, and never retries a failed send. It records no review and accepts no body.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new DomainError('Ticket not found', 404);
    if ((await req.text()).trim().length > 0) throw new DomainError('Invalid request', 400);
    const sent = await sendApproved(getDeps(), id);
    return NextResponse.json({ status: 'sent', deliveryMode: sent.deliveryMode });
  } catch (e) {
    return handleError(e);
  }
}
