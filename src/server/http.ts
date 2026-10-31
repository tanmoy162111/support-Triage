import { NextResponse } from 'next/server';
import { DomainError } from '@/domain/errors';

/** Max accepted request body in bytes. The per-field zod caps are tighter; this stops oversized payloads early. */
export const MAX_BODY_BYTES = 100_000;

export function handleError(err: unknown) {
  if (err instanceof DomainError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
  console.error('unhandled error', err instanceof Error ? err.name : 'UnknownError'); // name only: never log messages or payloads
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}

/**
 * Rejects cross-origin browser requests (CSRF hardening). When an Origin header is present its host must equal the
 * request host (x-forwarded-host, then Host, then the URL host). A missing Origin (non-browser callers, tests) is allowed.
 * This is not authentication: the demo has none.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (origin === null) return;
  const expected = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host).split(',')[0].trim().toLowerCase();
  let actual: string | null = null;
  try { actual = new URL(origin).host.toLowerCase(); } catch { /* "null" or malformed */ }
  if (actual === null || actual !== expected) throw new DomainError('Cross-origin request rejected', 403);
}

/**
 * Reads a JSON request body with a size cap. Throws DomainError 413 when too large and 400 when it is not valid JSON.
 * The declared content-length is checked first, then the real length (the header can be absent or wrong).
 */
export async function readJson(req: Request, maxBytes: number = MAX_BODY_BYTES): Promise<unknown> {
  // Requiring application/json blocks cross-site HTML form posts (which can only send form/text content types).
  if (!/^application\/json\s*(;|$)/i.test(req.headers.get('content-type') ?? '')) throw new DomainError('Content-Type must be application/json', 415);
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new DomainError('Request too large', 413);
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new DomainError('Request too large', 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError('Invalid request', 400);
  }
}
