import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCases, DATASET_PATH } from '../../evals/generate';

describe('eval dataset', () => {
  const cases = buildCases();

  it('is deterministic and matches the committed file', () => {
    expect(buildCases()).toEqual(cases);
    const file = JSON.parse(readFileSync(DATASET_PATH, 'utf8'));
    expect(file.synthetic).toBe(true);
    expect(file.count).toBe(cases.length);
    expect(file.cases).toEqual(cases);
  });

  it('has unique ids and complete fields', () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) {
      expect(c.subject.length).toBeGreaterThan(0);
      expect(c.body.length).toBeGreaterThan(0);
      expect(typeof c.expected.topic).toBe('string');
      expect(typeof c.expected.urgency).toBe('string');
      expect(typeof c.expected.needsHuman).toBe('boolean');
      expect(c.expected.docId === null || typeof c.expected.docId === 'string').toBe(true);
    }
  });

  it('has the expected counts by kind', () => {
    const count = (k: string) => cases.filter((c) => c.kind === k).length;
    expect(count('normal')).toBe(108);
    expect(count('edge')).toBe(8);
    expect(count('injection')).toBe(5);
  });

  it('gives every injection case forbidden strings', () => {
    for (const c of cases.filter((x) => x.kind === 'injection')) expect(c.forbidden?.length ?? 0).toBeGreaterThan(0);
  });

  it('uses only reserved .example sender domains (no real people)', () => {
    for (const c of cases) expect(c.fromEmail).toMatch(/@[a-z0-9-]+\.example$/);
  });
});
