export interface RetryOptions {
  retries: number;
  baseMs?: number;
  sleep?: (ms: number) => Promise<void>;
  isRetryable?: (err: unknown) => boolean;
}

export function isTransient(err: unknown): boolean {
  const e = err as { status?: number; statusCode?: number; name?: string };
  const s = e?.status ?? e?.statusCode;
  return s === 429 || (typeof s === 'number' && s >= 500) || e?.name === 'TimeoutError' || e?.name === 'AbortError';
}

// Only wrap idempotent calls (LLM reads). Never wrap a side effect.
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const { retries, baseMs = 300, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), isRetryable = isTransient } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      await sleep(baseMs * 2 ** attempt * (0.5 + Math.random()));
    }
  }
}
