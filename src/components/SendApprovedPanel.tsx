'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Shown when a review was approved but the (mock) send did not complete. It only asks the server to send the
 * already-approved reply; the server re-checks the approval and never retries a failed send.
 */
export function SendApprovedPanel({ ticketId, toEmail }: { ticketId: string; toEmail: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Request failed'); return; }
      router.refresh();
    } catch {
      setError('Could not reach the server. Nothing was sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="approved-h" className="grid gap-2 rounded border border-amber-500 bg-amber-50 p-3 text-sm">
      <h3 id="approved-h" className="font-semibold">Approved but not yet sent (mock)</h3>
      <p>The reply to <strong>{toEmail}</strong> was approved, but the mock send did not complete. Nothing was delivered.</p>
      <button disabled={busy} onClick={send} className="w-fit rounded bg-emerald-800 px-3 py-1.5 text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? 'Sending (mock)…' : 'Send approved reply (mock)'}
      </button>
      <p role="alert" className="text-red-700">{error}</p>
    </section>
  );
}
