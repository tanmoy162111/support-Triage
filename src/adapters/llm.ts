import { z } from 'zod';
import { TOPICS, URGENCIES } from '@/domain/types';

export const ClassificationSchema = z.object({
  topic: z.enum(TOPICS),
  urgency: z.enum(URGENCIES),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().max(300)).max(5),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const DraftSchema = z.object({
  reply: z.string().max(4000),
  cited_chunk_ids: z.array(z.string()),
  unsupported_points: z.array(z.string().max(300)).max(10),
});
export type DraftOutput = z.infer<typeof DraftSchema>;

/** Thrown when the model output could not be produced or did not match the schema. */
export class StructuredOutputError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'StructuredOutputError';
  }
}

export interface LlmUsage { calls: number; inputTokens: number; outputTokens: number }

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  readonly usage: LlmUsage;
  /**
   * `system` holds trusted instructions only. `input` is untrusted data and is
   * delivered to the model inside a delimited data block, never as instructions.
   */
  generateStructured<T>(args: { schemaName: string; schema: import('zod').ZodType<T>; system: string; input: unknown }): Promise<T>;
}
