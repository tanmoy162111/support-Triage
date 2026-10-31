'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoadSamplesButton() {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; msg?: string; error?: boolean }>({ busy: false });

  async function load() {
    setState({ busy: true });
    try {
      const res = await fetch('/api/ingest/sample', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setState({ busy: false, msg: data.created ? `Loaded ${data.created} synthetic tickets` : 'Samples already loaded' });
      router.refresh();
    } catch (e) {
      setState({ busy: false, error: true, msg: (e as Error).message });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={load} disabled={state.busy} className="rounded bg-ink px-3 py-1.5 text-sm text-white hover:bg-stone-700 disabled:opacity-50">
        {state.busy ? 'Processing tickets…' : 'Load sample tickets'}
      </button>
      <span role={state.error ? 'alert' : 'status'} className={`text-sm ${state.error ? 'text-red-700' : 'text-stone-600'}`}>{state.msg}</span>
    </div>
  );
}
