import type { ZodType } from 'zod';
import type { LlmProvider, LlmUsage } from '@/adapters/llm';
import { StructuredOutputError } from '@/adapters/llm';

type Step = { value: unknown } | { error: Error };

export class FakeLlm implements LlmProvider {
  readonly name = 'fake';
  readonly model = 'fake-1';
  readonly usage: LlmUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  readonly seenInputs: unknown[] = [];
  constructor(private script: Record<string, Step[]>) {}

  async generateStructured<T>({ schemaName, schema, input }: { schemaName: string; schema: ZodType<T>; system: string; input: unknown }): Promise<T> {
    this.usage.calls++;
    this.seenInputs.push(input);
    const step = this.script[schemaName]?.shift();
    if (!step) throw new Error(`FakeLlm: no scripted step for ${schemaName}`);
    if ('error' in step) throw step.error;
    const parsed = schema.safeParse(step.value);
    if (!parsed.success) throw new StructuredOutputError('fake output failed schema', parsed.error);
    return parsed.data;
  }
}
