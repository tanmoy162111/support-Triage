import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) throw new Error('TEST_DATABASE_URL must be set for e2e (put it in .env.local)');
let dbName = '';
try { dbName = new URL(testDbUrl).pathname; } catch { /* handled below */ }
if (!/test/i.test(dbName)) throw new Error('TEST_DATABASE_URL must point at a *test* database; e2e refuses to run against anything else');

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    // A production build, never `next dev` (dev rewrites project files).
    command: 'pnpm build && pnpm exec next start --port 3100',
    url: 'http://localhost:3100',
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: testDbUrl,
      LLM_PROVIDER: 'mock',
      DEMO_TENANT_ID: 'e2e',
      RETRIEVAL_MIN_SCORE: process.env.RETRIEVAL_MIN_SCORE ?? '0.15',
    },
  },
});
