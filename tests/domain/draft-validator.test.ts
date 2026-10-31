import { describe, it, expect } from 'vitest';
import { extractCommitments, validateDraft } from '@/domain/draft-validator';
import type { RetrievedChunk } from '@/domain/types';

const chunk = (id: string, text: string): RetrievedChunk =>
  ({ id, docId: 'd', title: 't', section: 's', version: '1', text, score: 0.9 });

describe('extractCommitments', () => {
  it('extracts money, percent, durations and dates', () => {
    const c = extractCommitments('Refund of $ 50.00, 20% off, within 14 days, by March 3, 2026 or 2026-04-01.');
    expect(c).toEqual(expect.arrayContaining(['$50.00', '20%', '14 days', 'march 3, 2026', '2026-04-01']));
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
    expect(r.problems).toContain('ungrounded_commitment:$500');
  });
  it('rejects a duration absent from the cited text', () => {
    const r = validateDraft({ reply: 'Refunds take 30 days.', citedChunkIds: ['c1'], retrieved });
    expect(r.problems).toContain('ungrounded_commitment:30 days');
  });
  it('rejects an empty reply', () => {
    expect(validateDraft({ reply: '  ', citedChunkIds: ['c1'], retrieved }).problems).toContain('empty_reply');
  });
});
