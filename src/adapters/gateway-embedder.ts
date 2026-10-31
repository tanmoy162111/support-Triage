import { embedMany } from 'ai';
import type { Embedder } from './embedder';
import { withRetry } from '@/lib/retry';

/** The model must output EMBED_DIM (1536) dimensions. UNVERIFIED against the live network. */
export class GatewayEmbedder implements Embedder {
  readonly name = 'gateway-embedder';
  constructor(private readonly model: string) {}
  async embed(texts: string[]): Promise<number[][]> {
    const { embeddings } = await withRetry(
      () => embedMany({ model: this.model, values: texts, maxRetries: 0, abortSignal: AbortSignal.timeout(30_000) }),
      { retries: 2 },
    );
    return embeddings;
  }
}
