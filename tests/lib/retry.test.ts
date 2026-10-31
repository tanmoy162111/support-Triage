import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '@/lib/retry';

describe('withRetry', () => {
  const sleep = vi.fn(async () => {});
  it('retries retryable errors then succeeds', async () => {
    let n = 0;
    const r = await withRetry(async () => { if (++n < 3) throw Object.assign(new Error('x'), { status: 429 }); return 'ok'; },
      { retries: 2, sleep });
    expect(r).toBe('ok');
    expect(n).toBe(3);
  });
  it('does not retry non-retryable errors', async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw new Error('bad'); }, { retries: 2, sleep })).rejects.toThrow('bad');
    expect(n).toBe(1);
  });
  it('gives up after the retry budget', async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw Object.assign(new Error('x'), { status: 503 }); }, { retries: 2, sleep })).rejects.toThrow();
    expect(n).toBe(3);
  });
});
