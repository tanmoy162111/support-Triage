import { and, cosineDistance, desc, eq, gt, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import type { Embedder } from '@/adapters/embedder';
import { kbChunks } from '@/db/schema';
import type { RetrievedChunk } from '@/domain/types';

export interface RetrievalResult {
  status: 'ok' | 'none' | 'conflicting';
  chunks: RetrievedChunk[];
}

const TOP_K = 5;

export async function retrieveEvidence(
  deps: { db: Db; embedder: Embedder; tenantId: string },
  ticket: { subject: string; body: string },
  minScore: number,
): Promise<RetrievalResult> {
  const query = `${ticket.subject}\n${ticket.body}`.slice(0, 2000);
  const [vector] = await deps.embedder.embed([query]);
  const similarity = sql<number>`1 - (${cosineDistance(kbChunks.embedding, vector)})`;

  const rows = await deps.db
    .select({ id: kbChunks.id, docId: kbChunks.docId, title: kbChunks.title, section: kbChunks.section, version: kbChunks.version, text: kbChunks.text, score: similarity })
    .from(kbChunks)
    // Tenant and publication filters are applied in SQL, before anything reaches the model.
    .where(and(eq(kbChunks.tenantId, deps.tenantId), eq(kbChunks.published, true), gt(similarity, minScore)))
    .orderBy(desc(similarity))
    .limit(TOP_K);

  const chunks: RetrievedChunk[] = rows.map((r) => ({ ...r, score: Number(r.score) }));
  if (chunks.length === 0) return { status: 'none', chunks };

  const versionsByDoc = new Map<string, Set<string>>();
  for (const c of chunks) versionsByDoc.set(c.docId, (versionsByDoc.get(c.docId) ?? new Set()).add(c.version));
  const conflicting = [...versionsByDoc.values()].some((v) => v.size > 1);
  return { status: conflicting ? 'conflicting' : 'ok', chunks };
}
