import { migrateDb } from '../src/db/migrate';

// No top-level await: package.json has no "type": "module", so tsx compiles .ts as CJS.
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');
  await migrateDb(url);
  console.log('migrated');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
