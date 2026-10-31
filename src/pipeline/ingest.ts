import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { tickets } from '@/db/schema';
import { DomainError } from '@/domain/errors';
import { normalizeEmailBody } from './normalize';

export const IncomingEmailSchema = z.object({
  messageId: z.string().min(1).max(255),
  fromEmail: z.string().email().max(255),
  subject: z.string().max(300),
  body: z.string().max(20000),
  receivedAt: z.date().optional(),
});
export type IncomingEmail = z.input<typeof IncomingEmailSchema>;

export async function ingestEmail(db: Db, tenantId: string, input: IncomingEmail): Promise<{ ticketId: string; created: boolean }> {
  const parsed = IncomingEmailSchema.safeParse(input);
  if (!parsed.success) throw new DomainError(`Invalid email: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`, 400);
  const email = parsed.data;
  const body = normalizeEmailBody(email.body);
  if (body.length === 0) throw new DomainError('Invalid email: body is empty after removing quoted text', 400);

  const [row] = await db.insert(tickets).values({
    tenantId, messageId: email.messageId, fromEmail: email.fromEmail.toLowerCase(),
    subject: email.subject, body, ...(email.receivedAt ? { receivedAt: email.receivedAt } : {}),
  }).onConflictDoNothing({ target: [tickets.tenantId, tickets.messageId] }).returning({ id: tickets.id });

  if (row) return { ticketId: row.id, created: true };
  const [existing] = await db.select({ id: tickets.id }).from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.messageId, email.messageId)));
  return { ticketId: existing.id, created: false };
}
