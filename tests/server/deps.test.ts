import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllEnvs(); });

const load = async () => (await import('@/server/deps')).getDeps;

describe('getDeps', () => {
  it('gateway without AI_GATEWAY_API_KEY throws a clear error that names no secret', async () => {
    vi.stubEnv('LLM_PROVIDER', 'gateway');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('DATABASE_URL', 'postgres://user:s3cret@localhost:5432/x');
    const getDeps = await load();
    expect(() => getDeps()).toThrow(/AI_GATEWAY_API_KEY/);
    try { getDeps(); } catch (e) { expect(String((e as Error).message)).not.toContain('s3cret'); }
  });
  it('unknown provider throws', async () => {
    vi.stubEnv('LLM_PROVIDER', 'bogus');
    vi.stubEnv('DATABASE_URL', 'postgres://user:s3cret@localhost:5432/x');
    const getDeps = await load();
    expect(() => getDeps()).toThrow(/Unknown LLM_PROVIDER/);
  });
  it('missing DATABASE_URL names only the variable', async () => {
    vi.stubEnv('LLM_PROVIDER', 'mock');
    vi.stubEnv('DATABASE_URL', '');
    const getDeps = await load();
    expect(() => getDeps()).toThrow(/^DATABASE_URL is not set/);
  });
  it('defaults to mock and caches', async () => {
    vi.stubEnv('LLM_PROVIDER', '');
    vi.stubEnv('DATABASE_URL', 'postgres://user:pw@localhost:5432/x');
    const getDeps = await load();
    const d = getDeps();
    expect(d.llm.constructor.name).toBe('MockLlm');
    expect(getDeps()).toBe(d);
  });
});
