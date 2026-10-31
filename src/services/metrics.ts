import { and, eq, inArray } from 'drizzle-orm';
import { drafts, outboundMessages, reviews, tickets } from '@/db/schema';
import { classifyEdit } from '@/domain/edit-class';
import type { Deps } from '@/pipeline/deps';

export interface Metrics {
  ticketCount: number;
  sentCount: number;
  avgFirstResponseSec: number | null;
  avgIngestToApprovalSec: number | null;
  acceptance: { unchanged: number; light: number; rewritten: number; rejected: number; total: number };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Computed only from stored rows. With no data, values are null/0 - never placeholders. */
export async function computeMetrics(deps: Pick<Deps, 'db' | 'tenantId'>): Promise<Metrics> {
  const { db, tenantId } = deps;
  const allTickets = await db.select().from(tickets).where(eq(tickets.tenantId, tenantId)).limit(5000);
  const byId = new Map(allTickets.map((t) => [t.id, t]));
  const outs = await db.select().from(outboundMessages).where(eq(outboundMessages.tenantId, tenantId));
  const revs = await db.select().from(reviews).where(eq(reviews.tenantId, tenantId));
  const draftIds = [...new Set(revs.map((r) => r.draftId))];
  const draftRows = draftIds.length ? await db.select().from(drafts).where(and(eq(drafts.tenantId, tenantId), inArray(drafts.id, draftIds))) : [];
  const draftById = new Map(draftRows.map((d) => [d.id, d]));

  const acceptance = { unchanged: 0, light: 0, rewritten: 0, rejected: 0, total: 0 };
  for (const r of revs) {
    acceptance.total++;
    if (r.decision === 'rejected') { acceptance.rejected++; continue; }
    const original = draftById.get(r.draftId)?.body ?? '';
    acceptance[classifyEdit(original, r.finalBody ?? '')]++;
  }

  const firstResp = outs.filter((o) => o.sentAt && byId.get(o.ticketId)).map((o) => (o.sentAt.getTime() - byId.get(o.ticketId)!.receivedAt.getTime()) / 1000);
  const toApproval = revs.filter((r) => r.decision !== 'rejected' && byId.get(r.ticketId)).map((r) => (r.createdAt.getTime() - byId.get(r.ticketId)!.receivedAt.getTime()) / 1000);

  return {
    ticketCount: allTickets.length,
    sentCount: allTickets.filter((t) => t.status === 'sent').length,
    avgFirstResponseSec: avg(firstResp),
    avgIngestToApprovalSec: avg(toApproval),
    acceptance,
  };
}
