import { describe, it, expect, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { getTestDb, resetDb, insertTicket, TENANT, OTHER_TENANT } from '../helpers/db';
import { outboundMessages, tickets } from '@/db/schema';

beforeEach(resetDb);

describe('schema constraints', () => {
  it('rejects an outbound message without a review (approval gate)', async () => {
    const t = await insertTicket();
    // reviewId is required by the types too; cast so the DB (NOT NULL), not the compiler, is what rejects it.
    const row = {
      tenantId: TENANT, ticketId: t.id, idempotencyKey: 'k1', toEmail: 'a@b.test', body: 'x', result: 'mock',
    } as typeof outboundMessages.$inferInsert;
    await expect(getTestDb().insert(outboundMessages).values(row)).rejects.toThrow();
  });
  it('dedupes tickets by (tenant, message id)', async () => {
    await insertTicket(TENANT, { messageId: 'dup' });
    await expect(insertTicket(TENANT, { messageId: 'dup' })).rejects.toThrow();
    await expect(insertTicket(OTHER_TENANT, { messageId: 'dup' })).resolves.toBeTruthy();
  });
  it('scopes tenant reads', async () => {
    const a = await insertTicket(TENANT);
    await insertTicket(OTHER_TENANT);
    const rows = await getTestDb().select().from(tickets).where(and(eq(tickets.tenantId, TENANT)));
    expect(rows.map((r) => r.id)).toEqual([a.id]);
  });
});
