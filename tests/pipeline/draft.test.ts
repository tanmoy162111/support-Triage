import { describe, it, expect } from 'vitest';
import { draftReply } from '@/pipeline/draft';
import { FakeLlm } from '../helpers/fake-llm';
import type { RetrievedChunk } from '@/domain/types';

const chunk: RetrievedChunk = { id: 'uuid-1', docId: 'refund-policy', title: 'Refund policy', section: 'Eligibility', version: '3', score: 0.8,
  text: 'Annual plans can be refunded within 14 days of purchase.' };
const ticket = { subject: 'Refund', body: 'I want a refund' };
const customer = { name: 'Sam', plan: 'pro' };

describe('draftReply', () => {
  it('maps model aliases back to chunk ids and marks supported', async () => {
    const llm = new FakeLlm({ draft: [{ value: { reply: 'You can get a refund within 14 days.', cited_chunk_ids: ['c1'], unsupported_points: [] } }] });
    const r = await draftReply(llm, { ticket, customer, chunks: [chunk], retrievalStatus: 'ok' });
    expect(r).toMatchObject({ isPlaceholder: false, citedChunkIds: ['uuid-1'], evidenceStatus: 'supported' });
    expect(llm.seenInputs[0]).toMatchObject({ chunks: [{ id: 'c1', title: 'Refund policy' }] });
  });
  it('marks partial when the model lists unsupported points', async () => {
    const llm = new FakeLlm({ draft: [{ value: { reply: 'Within 14 days.', cited_chunk_ids: ['c1'], unsupported_points: ['processing time unknown'] } }] });
    const r = await draftReply(llm, { ticket, customer, chunks: [chunk], retrievalStatus: 'ok' });
    expect(r.evidenceStatus).toBe('partial');
    expect(r.unsupportedPoints).toEqual(['processing time unknown']);
  });
  it('does not call the model and returns a placeholder when there is no evidence', async () => {
    const llm = new FakeLlm({});
    const r = await draftReply(llm, { ticket, customer, chunks: [], retrievalStatus: 'none' });
    expect(r).toMatchObject({ isPlaceholder: true, body: '', evidenceStatus: 'none' });
    expect(llm.usage.calls).toBe(0);
  });
  it('replaces an ungrounded draft with a placeholder', async () => {
    const llm = new FakeLlm({ draft: [{ value: { reply: 'We will refund $500 today.', cited_chunk_ids: ['c1'], unsupported_points: [] } }] });
    const r = await draftReply(llm, { ticket, customer, chunks: [chunk], retrievalStatus: 'ok' });
    expect(r.isPlaceholder).toBe(true);
    expect(r.body).toBe('');
    expect(r.unsupportedPoints.join(' ')).toContain('ungrounded_commitment:$500');
  });
  it('keeps conflicting evidence status on a valid draft', async () => {
    const llm = new FakeLlm({ draft: [{ value: { reply: 'Within 14 days.', cited_chunk_ids: ['c1'], unsupported_points: [] } }] });
    const r = await draftReply(llm, { ticket, customer, chunks: [chunk], retrievalStatus: 'conflicting' });
    expect(r.evidenceStatus).toBe('conflicting');
  });
  it('treats a draft that cites an unknown chunk as ungrounded', async () => {
    const llm = new FakeLlm({ draft: [{ value: { reply: 'Hi.', cited_chunk_ids: ['c9'], unsupported_points: [] } }] });
    expect((await draftReply(llm, { ticket, customer, chunks: [chunk], retrievalStatus: 'ok' })).isPlaceholder).toBe(true);
  });
  it('treats schema failure as a placeholder rather than throwing', async () => {
    const { StructuredOutputError } = await import('@/adapters/llm');
    const llm = new FakeLlm({ draft: [{ error: new StructuredOutputError('bad') }] });
    expect((await draftReply(llm, { ticket, customer, chunks: [chunk], retrievalStatus: 'ok' })).isPlaceholder).toBe(true);
  });
});
