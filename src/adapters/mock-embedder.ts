import { EMBED_DIM } from '@/domain/constants';
import type { Embedder } from './embedder';

const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'are', 'can', 'with', 'this', 'that', 'have', 'from', 'was', 'not', 'but', 'our', 'any', 'how', 'what', 'when', 'will', 'its', 'has', 'been', 'please', 'hello', 'thanks', 'thank']);

function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t)).map((t) => t.replace(/s$/, ''));
}

/** Lexical hashed bag-of-words. Deterministic and offline; NOT semantic. For tests and the mock demo only. */
export class MockEmbedder implements Embedder {
  readonly name = 'mock-embedder-v1';
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array<number>(EMBED_DIM).fill(0);
      for (const tok of tokens(t)) v[fnv(tok) % EMBED_DIM] += 1;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
  }
}
