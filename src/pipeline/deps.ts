import type { Db } from '@/db/client';
import type { LlmProvider } from '@/adapters/llm';
import type { Embedder } from '@/adapters/embedder';
import type { Mailer } from '@/adapters/mailer';

export interface Deps {
  db: Db;
  llm: LlmProvider;
  embedder: Embedder;
  mailer: Mailer;
  tenantId: string;
  retrievalMinScore: number;
}
