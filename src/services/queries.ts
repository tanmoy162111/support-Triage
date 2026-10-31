import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { classifications, customers, drafts, kbChunks, reviews, tickets, auditEvents } from '@/db/schema';
import type { Deps } from '@/pipeline/deps';
import type { TicketStatus, Urgency } from '@/domain/types';

const MAX_ROWS = 200;
export const PAGE_SIZE = 25;

export interface TicketListItem {
  id: string; subject: string; fromEmail: string; status: TicketStatus; receivedAt: Date;
  needsHuman: boolean; topic: string | null; urgency: Urgency | null;
}

export async function listTickets(deps: Pick<Deps, 'db' | 'tenantId'>, opts: { status?: TicketStatus; page?: number }): Promise<TicketListItem[]> {
  const { db, tenantId } = deps;
  // Sort in SQL (urgency, critical first; no classification yet counts as normal; then oldest first) so that
  // LIMIT/OFFSET select the right rows. Classifications are unique per ticket, so the join cannot duplicate rows.
  const rank = sql`case coalesce(${classifications.urgency}, 'normal') when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`;
  const where = opts.status ? and(eq(tickets.tenantId, tenantId), eq(tickets.status, opts.status)) : eq(tickets.tenantId, tenantId);
  const paged = opts.page !== undefined;
  const page = paged ? Math.max(0, Math.floor(opts.page ?? 0)) : 0;
  const offset = page * PAGE_SIZE;
  if (paged && offset >= MAX_ROWS) return [];
  const limit = paged ? Math.min(PAGE_SIZE, MAX_ROWS - offset) : MAX_ROWS;
  const rows = await db.select({
    id: tickets.id, subject: tickets.subject, fromEmail: tickets.fromEmail, status: tickets.status, receivedAt: tickets.receivedAt,
    needsHuman: tickets.needsHuman, topic: classifications.topic, urgency: classifications.urgency,
  }).from(tickets)
    .leftJoin(classifications, and(eq(classifications.ticketId, tickets.id), eq(classifications.tenantId, tenantId)))
    .where(where)
    .orderBy(rank, asc(tickets.receivedAt), asc(tickets.id))
    .limit(limit).offset(offset);
  return rows.map((r) => ({ ...r, topic: r.topic ?? null, urgency: (r.urgency ?? null) as Urgency | null }));
}

export const isUuid = (v: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function getTicketDetail(deps: Pick<Deps, 'db' | 'tenantId'>, ticketId: string) {
  const { db, tenantId } = deps;
  if (!isUuid(ticketId)) return null; // a malformed id would make Postgres throw; treat it as not found
  const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)));
  if (!ticket) return null;
  const [classification] = await db.select().from(classifications).where(and(eq(classifications.ticketId, ticketId), eq(classifications.tenantId, tenantId))).orderBy(desc(classifications.createdAt)).limit(1);
  const [draft] = await db.select().from(drafts).where(and(eq(drafts.ticketId, ticketId), eq(drafts.tenantId, tenantId))).orderBy(desc(drafts.createdAt)).limit(1);
  const [customer] = ticket.customerId ? await db.select().from(customers).where(and(eq(customers.id, ticket.customerId), eq(customers.tenantId, tenantId))) : [];
  const citations = draft && draft.citedChunkIds.length
    ? await db.select({ id: kbChunks.id, title: kbChunks.title, section: kbChunks.section, version: kbChunks.version, text: kbChunks.text })
        .from(kbChunks).where(and(eq(kbChunks.tenantId, tenantId), inArray(kbChunks.id, draft.citedChunkIds)))
    : [];
  const review = await db.select().from(reviews).where(and(eq(reviews.ticketId, ticketId), eq(reviews.tenantId, tenantId))).orderBy(desc(reviews.createdAt)).limit(1);
  return { ticket, classification: classification ?? null, draft: draft ?? null, customer: customer ?? null, citations, review: review[0] ?? null };
}

export async function listAuditEvents(deps: Pick<Deps, 'db' | 'tenantId'>, limit = 100) {
  return deps.db.select().from(auditEvents).where(eq(auditEvents.tenantId, deps.tenantId)).orderBy(desc(auditEvents.createdAt)).limit(Math.min(limit, MAX_ROWS));
}
