import { Suspense } from 'react';
import { connection } from 'next/server';
import { getDeps } from '@/server/deps';
import { listAuditEvents } from '@/services/queries';


export default function DiagnosticsPage() {
  return (
    <Suspense fallback={<p role="status" className="text-sm text-stone-700">Loading…</p>}>
      <Diagnostics />
    </Suspense>
  );
}

async function Diagnostics() {
  await connection();
  const deps = getDeps();
  const events = await listAuditEvents(deps, 100);
  return (
    <div className="grid gap-3">
      <h1 className="font-display text-2xl font-semibold">Operator diagnostics</h1>
      <p className="text-sm text-stone-700">Provider: {deps.llm.name} · model: {deps.llm.model}. Ids and step outcomes only; no email bodies are logged.</p>
      {events.length === 0 ? <p className="text-sm text-stone-700">No events yet.</p> : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Audit events">
          <table className="w-full border border-stone-400 bg-white text-left text-xs">
            <caption className="sr-only">Most recent audit events</caption>
            <thead><tr className="bg-stone-100"><th scope="col" className="p-1.5">Time</th><th scope="col">Step</th><th scope="col">Outcome</th><th scope="col">ms</th><th scope="col">Ticket</th><th scope="col">Detail</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-stone-200 align-top"><td className="p-1.5 whitespace-nowrap">{e.createdAt.toISOString()}</td><td>{e.step}</td><td>{e.outcome}</td><td>{e.durationMs}</td><td>{e.ticketId?.slice(0, 8)}</td><td><code className="break-all">{JSON.stringify(e.detail)}</code></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
