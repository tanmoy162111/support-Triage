import { describe, it, expect, beforeEach } from 'vitest';
import { findCustomer, escapeLike } from '@/pipeline/identify-customer';
import { getTestDb, resetDb, insertCustomer, TENANT, OTHER_TENANT } from '../helpers/db';

beforeEach(resetDb);

describe('findCustomer', () => {
  it('matches the exact email', async () => {
    const c = await insertCustomer(TENANT, 'sam@acme.test');
    expect((await findCustomer(getTestDb(), TENANT, 'SAM@acme.test'))?.id).toBe(c.id);
  });
  it('matches by company domain when exactly one customer shares it', async () => {
    const c = await insertCustomer(TENANT, 'sam@acme.test');
    expect((await findCustomer(getTestDb(), TENANT, 'other@acme.test'))?.id).toBe(c.id);
  });
  it('does not match ambiguous domains', async () => {
    await insertCustomer(TENANT, 'sam@acme.test');
    await insertCustomer(TENANT, 'lee@acme.test', 'Lee');
    expect(await findCustomer(getTestDb(), TENANT, 'new@acme.test')).toBeNull();
  });
  it('never domain-matches free-mail providers', async () => {
    await insertCustomer(TENANT, 'sam@gmail.com');
    expect(await findCustomer(getTestDb(), TENANT, 'someone@gmail.com')).toBeNull();
  });
  it('does not cross tenants', async () => {
    await insertCustomer(OTHER_TENANT, 'sam@acme.test');
    expect(await findCustomer(getTestDb(), TENANT, 'sam@acme.test')).toBeNull();
  });
  it('treats LIKE metacharacters in the sender domain literally', async () => {
    await insertCustomer(TENANT, 'sam@acme.test');
    expect(await findCustomer(getTestDb(), TENANT, 'x@_cme.test')).toBeNull();
    expect(await findCustomer(getTestDb(), TENANT, 'x@%')).toBeNull();
    expect(await findCustomer(getTestDb(), TENANT, 'x@%.test')).toBeNull();
  });
});

describe('escapeLike', () => {
  it('escapes %, _ and backslash', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });
});
