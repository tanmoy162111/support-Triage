import type { RetrievedChunk } from './types';

const MONEY = /[$€£]\s?\d[\d,]*(?:\.\d+)?/g;
const PERCENT = /\d+(?:\.\d+)?\s?%/g;
const DURATION = /\b\d+\s?(?:business\s)?(?:days?|hours?|weeks?|months?)\b/gi;
const MONTH_DATE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s\d{1,2}(?:,\s?\d{4})?\b/gi;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

function norm(s: string): string {
  return s.toLowerCase().replace(/([$€£])\s+/g, '$1').replace(/\s+/g, ' ').trim();
}

export function extractCommitments(text: string): string[] {
  const found = new Set<string>();
  for (const re of [MONEY, PERCENT, DURATION, MONTH_DATE, ISO_DATE]) {
    for (const m of text.matchAll(re)) found.add(norm(m[0]));
  }
  return [...found];
}

export interface ValidateInput {
  reply: string;
  citedChunkIds: string[];
  retrieved: RetrievedChunk[];
}
export interface ValidateResult {
  ok: boolean;
  problems: string[];
}

export function validateDraft({ reply, citedChunkIds, retrieved }: ValidateInput): ValidateResult {
  const problems: string[] = [];
  if (reply.trim().length === 0) problems.push('empty_reply');
  if (citedChunkIds.length === 0) problems.push('no_citation');

  const byId = new Map(retrieved.map((c) => [c.id, c]));
  const cited: RetrievedChunk[] = [];
  for (const id of citedChunkIds) {
    const c = byId.get(id);
    if (c) cited.push(c);
    else problems.push(`unknown_citation:${id}`);
  }

  if (cited.length > 0) {
    const allowed = new Set(cited.flatMap((c) => extractCommitments(c.text)));
    for (const commitment of extractCommitments(reply)) {
      if (!allowed.has(commitment)) problems.push(`ungrounded_commitment:${commitment}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
