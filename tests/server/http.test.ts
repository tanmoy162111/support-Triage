import { describe, it, expect } from 'vitest';
import { assertSameOrigin, readJson } from '@/server/http';

const req = (headers: Record<string, string>, body = '{"a":1}') => new Request('http://internal/x', { method: 'POST', body, headers });

describe('readJson', () => {
  it('requires application/json (415), allowing a charset parameter', async () => {
    await expect(readJson(req({ 'content-type': 'text/plain' }))).rejects.toMatchObject({ httpStatus: 415 });
    await expect(readJson(req({}))).rejects.toMatchObject({ httpStatus: 415 });
    await expect(readJson(req({ 'content-type': 'application/json; charset=utf-8' }))).resolves.toEqual({ a: 1 });
  });
});

describe('assertSameOrigin', () => {
  it('allows a missing Origin (non-browser caller)', () => {
    expect(() => assertSameOrigin(req({}))).not.toThrow();
  });
  it('allows a matching Origin and Host', () => {
    expect(() => assertSameOrigin(req({ origin: 'http://localhost:3000', host: 'localhost:3000' }))).not.toThrow();
  });
  it('prefers x-forwarded-host over host', () => {
    expect(() => assertSameOrigin(req({ origin: 'https://app.example', host: 'internal', 'x-forwarded-host': 'app.example' }))).not.toThrow();
    expect(() => assertSameOrigin(req({ origin: 'https://evil.example', host: 'evil.example', 'x-forwarded-host': 'app.example' }))).toThrow(/Forbidden|origin/i);
  });
  it('rejects a different host with 403, and a null or malformed Origin', () => {
    for (const origin of ['https://evil.example', 'null', 'not a url']) {
      expect(() => assertSameOrigin(req({ origin, host: 'localhost:3000' }))).toThrowError(expect.objectContaining({ httpStatus: 403 }));
    }
  });
});
