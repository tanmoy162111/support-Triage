import { migrateDb } from '../src/db/migrate';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');
  await migrateDb(url);
}
