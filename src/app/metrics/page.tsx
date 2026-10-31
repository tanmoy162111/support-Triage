import { Suspense } from 'react';
import { connection } from 'next/server';
import { getDeps } from '@/server/deps';
import { computeMetrics } from '@/services/metrics';

const fmt = (s: number | null) => (s === null ? 'no data yet' : s < 120 ? `${s.toFixed(1)} s` : `${(s / 60).toFixed(1)} min`);
const TILE = 'rounded border border-stone-400 bg-white p-4';

export default function MetricsPage() {
  return (
    <Suspense fallback={<p role="status" className="text-sm text-stone-700">Loading…</p>}>
      <Metrics />
    </Suspense>
  );
}

async function Metrics() {
  await connection();
  const m = await computeMetrics(getDeps());
  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="font-display text-2xl font-semibold">Metrics</h1>
      <p className="text-sm text-stone-700">Computed from stored data only. Tickets here are synthetic, so these numbers describe the demo, not a customer baseline.</p>
      {m.truncated && <p role="status" className="rounded border border-amber-400 bg-amber-50 p-2 text-sm text-amber-950">Row cap reached: these figures cover only the first rows read, not all data.</p>}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className={TILE}><dt>Tickets</dt><dd className="text-xl font-semibold">{m.ticketCount}</dd></div>
        <div className={TILE}><dt>Replies sent (mock)</dt><dd className="text-xl font-semibold">{m.sentCount}</dd></div>
        <div className={TILE}><dt>Avg time to (mock) first response</dt><dd className="text-xl font-semibold">{fmt(m.avgFirstResponseSec)}</dd></div>
        <div className={TILE}><dt>Avg ingest to approval</dt><dd className="text-xl font-semibold">{fmt(m.avgIngestToApprovalSec)}</dd></div>
      </dl>
      <section aria-labelledby="acc-h" className={`${TILE} text-sm`}>
        <h2 id="acc-h" className="font-semibold">Draft outcomes ({m.acceptance.total} reviewed)</h2>
        {m.acceptance.total === 0 ? <p className="text-stone-700">No reviews yet.</p> : (
          <ul className="mt-2 list-disc pl-5">
            <li>Accepted unchanged: {m.acceptance.unchanged}</li><li>Light edit: {m.acceptance.light}</li>
            <li>Rewritten: {m.acceptance.rewritten}</li><li>Rejected: {m.acceptance.rejected}</li>
          </ul>
        )}
      </section>
    </div>
  );
}
