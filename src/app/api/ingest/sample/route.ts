import { NextResponse } from 'next/server';
import { getDeps } from '@/server/deps';
import { loadSamples } from '@/services/samples';
import { assertSameOrigin, handleError } from '@/server/http';

export const maxDuration = 120;

/** Loads synthetic customers, help docs and sample tickets (mock data). Idempotent; nothing is sent. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    return NextResponse.json(await loadSamples(getDeps()));
  } catch (e) {
    return handleError(e);
  }
}
