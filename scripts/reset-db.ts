import postgres from 'postgres';

// No top-level await: package.json has no "type": "module", so tsx compiles .ts as CJS.
async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/test/.test(new URL(url).pathname)) throw new Error('TEST_DATABASE_URL must point at a *test* database');
  const sql = postgres(url, { max: 1 });
  try {
    await sql`TRUNCATE audit_events, outbound_messages, reviews, drafts, classifications, tickets, kb_chunks, customers RESTART IDENTITY CASCADE`;
  } finally {
    await sql.end();
  }
  console.log('test db reset');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
