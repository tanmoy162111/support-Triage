'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const FIELD = 'rounded border border-stone-400 bg-white px-2 py-1';

export function PasteEmailForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/ingest/paste', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(fd)) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      form.reset();
      router.push(`/?ticket=${data.ticketId}`);
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded border border-stone-400 bg-white p-3">
      <summary className="cursor-pointer rounded text-sm font-medium">Paste an email (goes to the mock inbox)</summary>
      <form onSubmit={submit} className="mt-3 grid gap-2 text-sm">
        <label className="grid gap-1">From<input name="fromEmail" type="email" required className={FIELD} /></label>
        <label className="grid gap-1">Subject<input name="subject" required maxLength={300} className={FIELD} /></label>
        <label className="grid gap-1">Body<textarea name="body" required maxLength={20000} rows={5} className={FIELD} /></label>
        <button disabled={busy} className="w-fit rounded bg-ink px-3 py-1.5 text-white disabled:opacity-50">{busy ? 'Processing…' : 'Submit to mock inbox'}</button>
        <p role="alert" className="text-red-700">{error}</p>
      </form>
    </details>
  );
}
