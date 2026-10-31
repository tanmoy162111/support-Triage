import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import path from 'node:path';
config({ path: '.env.local' });
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['tests/**/*.test.ts'], globalSetup: ['tests/global-setup.ts'], fileParallelism: false, testTimeout: 15000 },
});
