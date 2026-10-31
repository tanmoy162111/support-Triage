import type { ZodType } from 'zod';
import type { LlmProvider, LlmUsage } from './llm';
import { StructuredOutputError } from './llm';

const TOPIC_RULES: Array<[string, RegExp]> = [
  ['cancellation_refund', /\b(refund|cancel|cancellation|money back)\b/i],
  ['billing', /\b(invoice|charge[ds]?|billing|payment|receipt)\b/i],
  ['login_access', /\b(password|log ?in|sign ?in|locked out|2fa|access)\b/i],
  ['bug', /\b(error|crash(es|ed)?|bug|broken|not working|fails?)\b/i],
  ['shipping', /\b(shipping|delivery|parcel|tracking|order)\b/i],
  ['how_to', /\b(how (do|can|to)|where (do|can)|set ?up)\b/i],
];

function classify(subject: string, body: string) {
  const text = `${subject}\n${body}`;
  const hit = TOPIC_RULES.find(([, re]) => re.test(text));
  const urgency = /\b(data loss|production down|outage)\b/i.test(text) ? 'critical'
    : /\b(urgent|asap|locked out|cannot|can't|down)\b/i.test(text) ? 'high'
    : /\b(thanks|just wondering|no rush)\b/i.test(text) ? 'low' : 'normal';
  return { topic: hit?.[0] ?? 'other', urgency, confidence: hit ? 0.8 : 0.4, reasons: [hit ? 'keyword match' : 'no keyword match'] };
}

interface DraftInput {
  customer: { name: string } | null;
  chunks: Array<{ id: string; text: string }>;
}

/** Deterministic stand-in: never invents content, only echoes the first provided chunk. */
export class MockLlm implements LlmProvider {
  readonly name = 'mock';
  readonly model = 'mock-llm-v1';
  readonly usage: LlmUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };

  async generateStructured<T>({ schemaName, schema, input }: { schemaName: string; schema: ZodType<T>; system: string; input: unknown }): Promise<T> {
    this.usage.calls++;
    let raw: unknown;
    if (schemaName === 'classification') {
      const i = input as { subject: string; body: string };
      raw = classify(i.subject, i.body);
    } else if (schemaName === 'draft') {
      const i = input as DraftInput;
      const first = i.chunks[0];
      raw = first
        ? { reply: `Hi ${i.customer?.name ?? 'there'},\n\n${first.text}\n\nBest regards,\nSupport`, cited_chunk_ids: [first.id], unsupported_points: [] }
        : { reply: '', cited_chunk_ids: [], unsupported_points: ['No help-centre evidence was found.'] };
    } else if (schemaName === 'grounding_judge') {
      raw = { supported: true, explanation: 'mock' };
    } else {
      throw new StructuredOutputError(`MockLlm: unknown schema ${schemaName}`);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new StructuredOutputError('MockLlm output failed schema', parsed.error);
    return parsed.data;
  }
}
