import { describe, it, expect } from 'vitest';
import { normalizeEmailBody } from '@/pipeline/normalize';

describe('normalizeEmailBody', () => {
  it('strips quoted lines, reply headers and signatures', () => {
    const raw = 'I need help.\r\n> old quoted text\r\nMore detail.\r\n-- \r\nSam Lee\r\nOn Mon, Jan 5, Bob wrote:\r\n> earlier';
    expect(normalizeEmailBody(raw)).toBe('I need help.\nMore detail.');
  });
  it('stops at an "On ... wrote:" line', () => {
    expect(normalizeEmailBody('Hello\nOn Tue, Sam <s@x.test> wrote:\n> hi')).toBe('Hello');
  });
});
