import { describe, it, expect } from 'vitest';
import { extractCommitments, validateDraft } from '@/domain/draft-validator';
import type { RetrievedChunk } from '@/domain/types';

const chunk = (id: string, text: string): RetrievedChunk =>
  ({ id, docId: 'd', title: 't', section: 's', version: '1', text, score: 0.9 });

describe('extractCommitments', () => {
  it('extracts money, percent, durations and dates', () => {
    const c = extractCommitments('Refund of $ 50.00, 20% off, within 14 days, by March 3, 2026 or 2026-04-01.');
    expect(c).toEqual(expect.arrayContaining(['50 usd', '20%', '14 days', '2026-03-03', '2026-04-01']));
  });
  it('returns empty for plain text', () => {
    expect(extractCommitments('Please reset your password.')).toEqual([]);
  });
});

describe('validateDraft', () => {
  const retrieved = [chunk('c1', 'Refunds are available within 14 days of purchase.'), chunk('c2', 'Other.')];
  it('accepts a grounded draft', () => {
    expect(validateDraft({ reply: 'You can request a refund within 14 days.', citedChunkIds: ['c1'], retrieved }))
      .toEqual({ ok: true, problems: [] });
  });
  it('rejects a draft with no citation', () => {
    const r = validateDraft({ reply: 'Hello.', citedChunkIds: [], retrieved });
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('no_citation');
  });
  it('rejects citations that were not retrieved', () => {
    const r = validateDraft({ reply: 'Hello.', citedChunkIds: ['zzz'], retrieved });
    expect(r.problems).toContain('unknown_citation:zzz');
  });
  it('rejects an amount absent from the cited text', () => {
    const r = validateDraft({ reply: 'We will refund $500 today.', citedChunkIds: ['c1'], retrieved });
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('ungrounded_commitment:500 usd');
  });
  it('rejects a duration absent from the cited text', () => {
    const r = validateDraft({ reply: 'Refunds take 30 days.', citedChunkIds: ['c1'], retrieved });
    expect(r.problems).toContain('ungrounded_commitment:30 days');
  });
  it('rejects an empty reply', () => {
    expect(validateDraft({ reply: '  ', citedChunkIds: ['c1'], retrieved }).problems).toContain('empty_reply');
  });
});

describe('validateDraft: spelled-out and phrased commitments', () => {
  const retrieved = [chunk('c1', 'Refunds are available within 14 days of purchase.'), chunk('c2', 'Other.')];
  const bad = (reply: string) => validateDraft({ reply, citedChunkIds: ['c1'], retrieved });

  it.each([
    '500 dollars', 'USD 500', 'within five days', 'fourteen days is not it, thirty days', '30-day refund window',
    'fifty percent', '48 hrs', '2 years', 'March 15th', '15 March 2026', '03/15/2026', '15.03.2026', '15th of March',
    'a refund of 500 euros', 'GBP 20', 'twenty-four hours', '50 per cent', 'ten business days', 'two weeks',
  ])('flags %s when the cited chunk lacks it', (phrase) => {
    const r = bad(`We can do that: ${phrase}.`);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.startsWith('ungrounded_commitment:'))).toBe(true);
  });

  it('flags a phrased commitment with no digits', () => {
    const r = bad('We refunded your account in full and extended your plan for free.');
    expect(r.problems).toEqual(expect.arrayContaining([
      'ungrounded_commitment_phrase:refund in full', 'ungrounded_commitment_phrase:for free',
    ]));
  });

  it.each([
    ['full refund', 'ungrounded_commitment_phrase:full refund'], ['free of charge', 'ungrounded_commitment_phrase:free of charge'],
    ['a complimentary month', 'ungrounded_commitment_phrase:complimentary'], ['account credit', 'ungrounded_commitment_phrase:credit'],
    ['we will waive the fee', 'ungrounded_commitment_phrase:waive'], ['we guarantee it', 'ungrounded_commitment_phrase:guarantee'],
    ['compensation', 'ungrounded_commitment_phrase:compensat'],
  ])('flags the phrase %s', (phrase, problem) => {
    expect(bad(`You get ${phrase}.`).problems).toContain(problem);
  });

  it('accepts a risky phrase that the cited chunk also contains', () => {
    const r = validateDraft({
      reply: 'Annual plans get a full refund within 14 days.', citedChunkIds: ['p'],
      retrieved: [chunk('p', 'Annual plans get a Full Refund within 14 days of purchase.')],
    });
    expect(r).toEqual({ ok: true, problems: [] });
  });

  it('does not treat "credit card" as a credit commitment', () => {
    expect(bad('Update your credit card under Billing.').problems).not.toContain('ungrounded_commitment_phrase:credit');
  });

  const grounded = (chunkText: string, reply: string) =>
    validateDraft({ reply, citedChunkIds: ['x'], retrieved: [chunk('x', chunkText)] });

  it.each([
    ['Refunds within 14 days.', 'Refunds within fourteen days.'],
    ['Delivery takes 3 to 5 business days.', 'It takes three to five business days.'],
    ['A fee of $50.', 'A fee of 50 dollars.'],
    ['A fee of $1,000.', 'A fee of USD 1000.'],
    ['A fee of 50 euros.', 'A fee of \u20ac50.00.'],
    ['Save 50%.', 'Save fifty percent.'],
    ['A 30-day window.', 'A window of thirty days.'],
    ['Wait 48 hours.', 'Wait 48 hrs.'],
    ['Due March 15th, 2026.', 'Due 15 March 2026.'],
    ['Due 2026-03-15.', 'Due 03/15/2026.'],
    ['Due on 15th of March.', 'Due March 15.'],
    ['Due 15.03.2026.', 'Due 2026-03-15.'],
  ])('accepts equivalent forms: %s / %s', (chunkText, reply) => {
    expect(grounded(chunkText, reply)).toEqual({ ok: true, problems: [] });
  });

  it('still passes plain text', () => {
    expect(bad('Please reset your password from the login page.')).toEqual({ ok: true, problems: [] });
  });

  it('does not equate different amounts, currencies or dates', () => {
    expect(grounded('A fee of $50.', 'A fee of 50 euros.').ok).toBe(false);
    expect(grounded('Due March 15.', 'Due March 16.').ok).toBe(false);
    expect(grounded('Within 14 days.', 'Within 14 hours.').ok).toBe(false);
  });
});
