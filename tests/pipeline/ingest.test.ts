import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ingestEmail } from '@/pipeline/ingest';
import { getTestDb, resetDb, TENANT, OTHER_TENANT } from '../helpers/db';
import { tickets } from '@/db/schema';
import { DomainError } from '@/domain/errors';

beforeEach(resetDb);
const email = { messageId: 'm1', fromEmail: 'Sam@Acme.test', subject: 'Help', body: 'Hi\n> quoted' };

describe('ingestEmail', () => {
  it('creates a received ticket with a normalised body and lowercased sender', async () => {
    const r = await ingestEmail(getTestDb(), TENANT, email);
    expect(r.created).toBe(true);
    const [t] = await getTestDb().select().from(tickets).where(eq(tickets.id, r.ticketId));
    expect(t).toMatchObject({ status: 'received', body: 'Hi', fromEmail: 'sam@acme.test', tenantId: TENANT });
  });
  it('is idempotent on message id', async () => {
    const a = await ingestEmail(getTestDb(), TENANT, email);
    const b = await ingestEmail(getTestDb(), TENANT, email);
    expect(b.created).toBe(false);
    expect(b.ticketId).toBe(a.ticketId);
  });
  it('treats the same message id in another tenant as a different ticket', async () => {
    const a = await ingestEmail(getTestDb(), TENANT, email);
    const b = await ingestEmail(getTestDb(), OTHER_TENANT, email);
    expect(b.ticketId).not.toBe(a.ticketId);
  });
  it('rejects invalid input', async () => {
    await expect(ingestEmail(getTestDb(), TENANT, { ...email, fromEmail: 'nope' })).rejects.toThrow(DomainError);
    await expect(ingestEmail(getTestDb(), TENANT, { ...email, body: 'x'.repeat(20001) })).rejects.toThrow(DomainError);
    await expect(ingestEmail(getTestDb(), TENANT, { ...email, body: '> only quoted' })).rejects.toThrow(DomainError);
  });
});
