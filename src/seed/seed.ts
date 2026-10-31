import { eq, sql } from 'drizzle-orm';
import type { Deps } from '@/pipeline/deps';
import { customers, kbChunks } from '@/db/schema';
import { KB_SEED } from './kb';
import { SEED_CUSTOMERS } from './customers';

export const chunkEmbedText = (c: { title: string; section: string; text: string }) => `${c.title}\n${c.section}\n${c.text}`;

/**
 * NOTE: the emptiness check below is not atomic; two concurrent calls for the same tenant could both seed.
 * Acceptable for the demo (single process, run at startup); a unique index or advisory lock would be needed otherwise.
 */
/** Seeds synthetic customers and help chunks for the tenant if the KB is empty. Returns true if it seeded. */
export async function ensureSeeded(deps: Pick<Deps, 'db' | 'embedder' | 'tenantId'>): Promise<boolean> {
  const { db, embedder, tenantId } = deps;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(kbChunks).where(eq(kbChunks.tenantId, tenantId));
  if (n > 0) return false;
  const vectors = await embedder.embed(KB_SEED.map(chunkEmbedText));
  await db.insert(kbChunks).values(KB_SEED.map((c, i) => ({ tenantId, ...c, published: c.published ?? true, embedding: vectors[i] })));
  await db.insert(customers).values(SEED_CUSTOMERS.map((c) => ({ tenantId, ...c }))).onConflictDoNothing();
  return true;
}
