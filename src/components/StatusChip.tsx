const STYLES: Record<string, string> = {
  received: 'bg-stone-200 text-stone-800', classified: 'bg-stone-200 text-stone-800', drafted: 'bg-stone-200 text-stone-800',
  awaiting_review: 'bg-sky-100 text-sky-900', approved: 'bg-emerald-100 text-emerald-900', sent: 'bg-emerald-200 text-emerald-950',
  rejected: 'bg-rose-100 text-rose-900', failed: 'bg-red-200 text-red-950',
};
const LABELS: Record<string, string> = { awaiting_review: 'needs review', sent: 'sent (mock)' };

export function StatusChip({ status }: { status: string }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? 'bg-stone-100'}`}>{LABELS[status] ?? status}</span>;
}
