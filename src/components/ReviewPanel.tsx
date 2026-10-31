'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  ticketId: string;
  toEmail: string;
  initialBody: string;
  isPlaceholder: boolean;
  disabled: boolean; // ticket is no longer awaiting review
}

export function ReviewPanel({ ticketId, toEmail, initialBody, isPlaceholder, disabled }: Props) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const edited = body.trim() !== initialBody.trim();
  // A placeholder draft is not a real reply: the reviewer must write their own before anything can be sent.
  const canSend = !disabled && body.trim().length > 0 && (!isPlaceholder || edited);

  async function post(payload: object) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Request failed'); dialog.current?.close(); return; }
      dialog.current?.close();
      router.refresh();
    } catch {
      setError('Could not reach the server. Nothing was sent.');
      dialog.current?.close();
    } finally {
      setBusy(false);
    }
  }

  const btn = 'rounded px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <section aria-labelledby="draft-h" className="grid gap-3">
      <h2 id="draft-h" className="font-display text-lg font-semibold">Reply draft</h2>
      {isPlaceholder && <p className="rounded border border-amber-400 bg-amber-100 p-2 text-sm text-amber-950">No grounded draft is available. Write your own reply below to enable sending, or reject.</p>}
      <label className="grid gap-1 text-sm">
        <span className="sr-only">Reply text</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} disabled={disabled} className="rounded border border-stone-400 bg-white p-2 disabled:bg-stone-100" />
      </label>
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <button disabled={!canSend || busy} onClick={() => dialog.current?.showModal()} className={`${btn} bg-emerald-800 text-white hover:bg-emerald-900`}>
            {edited ? 'Edit & approve (send mock)' : 'Approve & send (mock)'}
          </button>
          <button disabled={busy} aria-expanded={rejecting} onClick={() => setRejecting((r) => !r)} className={`${btn} border border-stone-500 bg-white`}>Reject</button>
        </div>
      )}
      {!disabled && isPlaceholder && !canSend && <p className="text-xs text-stone-600">Sending is disabled until you write your own reply.</p>}
      {rejecting && !disabled && (
        <div className="grid gap-2 text-sm">
          <label className="grid gap-1">Reason for rejecting (required)<input value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border border-stone-400 bg-white px-2 py-1" /></label>
          <button disabled={!reason.trim() || busy} onClick={() => post({ decision: 'rejected', rejectReason: reason })} className={`${btn} w-fit bg-rose-800 text-white`}>Confirm reject</button>
        </div>
      )}
      <p role="alert" className="text-sm text-red-700">{error}</p>

      <dialog ref={dialog} aria-labelledby="confirm-h" className="m-auto w-[min(36rem,92vw)] rounded border-2 border-ink bg-paper p-5 backdrop:bg-black/50">
        <h3 id="confirm-h" className="font-display text-lg font-semibold">Send this reply (mock)?</h3>
        <p className="mt-2 text-sm">To: <strong>{toEmail}</strong></p>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-sm">{body}</pre>
        <p className="mt-2 text-xs text-stone-700">Mock send: this exact text is recorded, but nothing is delivered to a real mailbox.</p>
        <div className="mt-4 flex gap-2">
          <button disabled={busy} onClick={() => post(edited ? { decision: 'edited', finalBody: body } : { decision: 'approved' })} className={`${btn} bg-emerald-800 text-white`}>{busy ? 'Sending (mock)…' : 'Confirm approve (mock)'}</button>
          <button onClick={() => dialog.current?.close()} className={`${btn} border border-stone-500 bg-white`}>Cancel</button>
        </div>
      </dialog>
    </section>
  );
}
