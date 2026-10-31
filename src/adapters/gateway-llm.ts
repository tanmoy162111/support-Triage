import { generateText, Output, NoObjectGeneratedError, NoOutputGeneratedError } from 'ai';
import type { ZodType } from 'zod';
import { StructuredOutputError, type LlmProvider, type LlmUsage } from './llm';
import { withRetry } from '@/lib/retry';

const TIMEOUT_MS = 30_000;

/**
 * AI SDK v7: `generateObject` is superseded by `generateText` with `output: Output.object(...)`.
 * The model is a plain "provider/model" string, resolved through the Vercel AI Gateway.
 * UNVERIFIED against the live network (no key in dev): only unit-tested with a mocked `ai`.
 */
export class GatewayLlm implements LlmProvider {
  readonly name = 'gateway';
  readonly usage: LlmUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  constructor(readonly model: string) {}

  async generateStructured<T>({ schemaName, schema, system, input }: { schemaName: string; schema: ZodType<T>; system: string; input: unknown }): Promise<T> {
    // Untrusted content is fenced as data. The system prompt tells the model never to follow instructions inside it.
    const prompt = `<data name="${schemaName}">\n${JSON.stringify(input)}\n</data>`;
    try {
      const result = await withRetry(
        () => generateText({
          model: this.model,
          output: Output.object({ schema, name: schemaName }),
          system,
          prompt,
          timeout: TIMEOUT_MS,
          maxRetries: 0, // retries are owned by withRetry
        }),
        { retries: 2 },
      );
      this.usage.calls++;
      this.usage.inputTokens += result.usage?.inputTokens ?? 0;
      this.usage.outputTokens += result.usage?.outputTokens ?? 0;
      // `output` is a getter that throws when no valid object was produced.
      return result.output as T;
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err) || NoOutputGeneratedError.isInstance(err)) {
        throw new StructuredOutputError('Model output did not match schema', err);
      }
      throw err;
    }
  }
}
