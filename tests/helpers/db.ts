import { sql } from 'drizzle-orm';
import { makeDb, type Db } from '@/db/client';
import { customers, tickets } from '@/db/schema';

let db: Db | undefined;
export function getTestDb(): Db {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  return (db ??= makeDb(url));
}

export async function resetDb(): Promise<void> {
  await getTestDb().execute(sql`TRUNCATE audit_events, outbound_messages, reviews, drafts, classifications, tickets, kb_chunks, customers RESTART IDENTITY CASCADE`);
}

export const TENANT = 'tenant-a';
export const OTHER_TENANT = 'tenant-b';

export async function insertCustomer(tenantId = TENANT, email = 'sam@acme.test', name = 'Sam Lee') {
  const [c] = await getTestDb().insert(customers).values({ tenantId, name, email, plan: 'pro' }).returning();
  return c;
}

export async function insertTicket(tenantId = TENANT, over: Partial<typeof tickets.$inferInsert> = {}) {
  const [t] = await getTestDb().insert(tickets).values({
    tenantId, messageId: `m-${crypto.randomUUID()}`, fromEmail: 'sam@acme.test',
    subject: 'Help', body: 'I need help', ...over,
  }).returning();
  return t;
}
