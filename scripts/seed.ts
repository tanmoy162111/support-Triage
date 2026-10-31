import { getDeps } from '../src/server/deps';
import { loadSamples } from '../src/services/samples';

// No top-level await: package.json has no "type": "module", so tsx compiles .ts as CJS.
async function main() {
  const r = await loadSamples(getDeps());
  console.log(`loaded synthetic samples: ${r.created} new tickets (mock inbox, mock send)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.name : 'Error');
  process.exit(1);
});
