import { makeDb } from '@/db/client';
import { MockLlm } from '@/adapters/mock-llm';
import { MockEmbedder } from '@/adapters/mock-embedder';
import { MockMailer } from '@/adapters/mailer';
import { GatewayLlm } from '@/adapters/gateway-llm';
import { GatewayEmbedder } from '@/adapters/gateway-embedder';
import { requireEnv } from '@/lib/env';
import type { Deps } from '@/pipeline/deps';

let cached: Deps | undefined;

export function getDeps(): Deps {
  if (cached) return cached;
  const provider = process.env.LLM_PROVIDER || 'mock';
  let llm: Deps['llm'];
  let embedder: Deps['embedder'];
  if (provider === 'gateway') {
    if (!process.env.AI_GATEWAY_API_KEY) {
      throw new Error('LLM_PROVIDER=gateway needs AI_GATEWAY_API_KEY. Set it in .env.local, or use LLM_PROVIDER=mock for the offline demo.');
    }
    llm = new GatewayLlm(requireEnv('LLM_MODEL'));
    embedder = new GatewayEmbedder(requireEnv('EMBED_MODEL'));
  } else if (provider === 'mock') {
    llm = new MockLlm();
    embedder = new MockEmbedder();
  } else {
    throw new Error(`Unknown LLM_PROVIDER "${provider}" (use "mock" or "gateway")`);
  }
  cached = {
    db: makeDb(requireEnv('DATABASE_URL')), llm, embedder, mailer: new MockMailer(),
    tenantId: process.env.DEMO_TENANT_ID ?? 'demo',
    retrievalMinScore: Number(process.env.RETRIEVAL_MIN_SCORE ?? '0.15'),
  };
  return cached;
}
