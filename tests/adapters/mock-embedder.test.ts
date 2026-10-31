import { describe, it, expect } from 'vitest';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { EMBED_DIM } from '@/domain/constants';

const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

describe('MockEmbedder', () => {
  const e = new MockEmbedder();
  it('is deterministic with the right dimension and unit norm', async () => {
    const [a] = await e.embed(['reset my password']);
    const [b] = await e.embed(['reset my password']);
    expect(a).toHaveLength(EMBED_DIM);
    expect(a).toEqual(b);
    expect(Math.sqrt(a.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 5);
  });
  it('scores related text above unrelated text', async () => {
    const [q, rel, unrel] = await e.embed(['reset my password', 'How to reset your password', 'Shipping times for parcels']);
    expect(cos(q, rel)).toBeGreaterThan(cos(q, unrel));
  });
});
