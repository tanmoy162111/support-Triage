import type { Db } from '@/db/client';
import { auditEvents } from '@/db/schema';

export interface AuditInput {
  tenantId: string;
  ticketId?: string;
  runId: string;
  step: string;
  outcome: 'ok' | 'error' | 'skipped';
  durationMs?: number;
  /** ids, counts and enum values only. Never raw email bodies or secrets. */
  detail?: Record<string, unknown>;
}

export async function audit(db: Db, e: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    tenantId: e.tenantId, ticketId: e.ticketId, runId: e.runId, step: e.step,
    outcome: e.outcome, durationMs: Math.round(e.durationMs ?? 0), detail: e.detail ?? {},
  });
}

export async function timedStep<T>(
  db: Db, base: Omit<AuditInput, 'outcome' | 'durationMs' | 'detail'>, fn: () => Promise<{ value: T; detail?: Record<string, unknown> }>,
): Promise<T> {
  const start = performance.now();
  try {
    const { value, detail } = await fn();
    await audit(db, { ...base, outcome: 'ok', durationMs: performance.now() - start, detail });
    return value;
  } catch (err) {
    await audit(db, { ...base, outcome: 'error', durationMs: performance.now() - start, detail: { error: (err as Error).name } });
    throw err;
  }
}
