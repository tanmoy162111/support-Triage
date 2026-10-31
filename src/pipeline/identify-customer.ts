import { and, eq, like } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { customers } from '@/db/schema';
import { FREE_MAIL_DOMAINS } from '@/domain/constants';

/** Escape LIKE metacharacters (backslash is Postgres' default escape character). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function findCustomer(db: Db, tenantId: string, email: string) {
  const addr = email.toLowerCase();
  const [exact] = await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.email, addr)));
  if (exact) return exact;

  const domain = addr.split('@')[1];
  if (!domain || (FREE_MAIL_DOMAINS as readonly string[]).includes(domain)) return null;
  const sameDomain = await db.select().from(customers)
    .where(and(eq(customers.tenantId, tenantId), like(customers.email, `%@${escapeLike(domain)}`))).limit(2);
  return sameDomain.length === 1 ? sameDomain[0] : null;
}
