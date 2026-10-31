import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { getDeps } from '@/server/deps';
import { getTicketDetail, listTickets, PAGE_SIZE } from '@/services/queries';
import { TICKET_STATUSES, type TicketStatus } from '@/domain/types';
import { StatusChip } from '@/components/StatusChip';
import { LoadSamplesButton } from '@/components/LoadSamplesButton';
import { PasteEmailForm } from '@/components/PasteEmailForm';
import { ReviewPanel } from '@/components/ReviewPanel';
import { SendApprovedPanel } from '@/components/SendApprovedPanel';

const CARD = 'rounded border border-stone-400 bg-white';
const H = 'font-display text-lg font-semibold';
const EVIDENCE_STYLE: Record<string, string> = {
  supported: 'bg-emerald-100 text-emerald-950', partial: 'bg-amber-100 text-amber-950',
  none: 'bg-rose-100 text-rose-950', conflicting: 'bg-rose-100 text-rose-950',
};
const LINK = 'rounded underline-offset-2 hover:underline';

type SearchParams = Promise<{ status?: string; ticket?: string; page?: string }>;

// Next 16 cacheComponents: `dynamic = 'force-dynamic'` is not allowed. Request-time data is read inside <Suspense>
// after connection(), which opts this render out of prerendering.
export default function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p role="status" className="p-4 text-sm text-stone-700">Loading inbox…</p>}>
      <Inbox searchParams={searchParams} />
    </Suspense>
  );
}

async function Inbox({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const deps = getDeps();
  const status = (TICKET_STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as TicketStatus) : undefined;
  const page = Math.max(0, Math.floor(Number(sp.page ?? 0)) || 0);
  const items = await listTickets(deps, { status, page });
  const detail = sp.ticket ? await getTicketDetail(deps, sp.ticket) : null;
  const statusQ = status ? `&status=${status}` : '';

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><LoadSamplesButton /><PasteEmailForm /></div>
      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)_minmax(0,26rem)]">
        <section aria-labelledby="queue-h" className={`${CARD} self-start`}>
          <div className="grid gap-2 border-b border-stone-300 p-3">
            <h2 id="queue-h" className={H}>Queue</h2>
            <nav aria-label="Filter by status" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <Link href="/" aria-current={!status ? 'page' : undefined} className={`${LINK} ${!status ? 'font-bold underline' : ''}`}>all</Link>
              {(['awaiting_review', 'sent', 'rejected', 'failed'] as const).map((s) => (
                <Link key={s} href={`/?status=${s}`} aria-current={status === s ? 'page' : undefined} className={`${LINK} ${status === s ? 'font-bold underline' : ''}`}>{s.replace('_', ' ')}</Link>
              ))}
            </nav>
          </div>
          {items.length === 0 ? (
            <p className="p-4 text-sm text-stone-700">{status || page > 0 ? 'No tickets match this view.' : 'No tickets yet. Load the sample tickets or paste an email.'}</p>
          ) : (
            <ul>
              {items.map((t) => (
                <li key={t.id} className={`border-b border-stone-200 ${sp.ticket === t.id ? 'bg-sky-100 border-l-4 border-l-accent' : ''}`}>
                  <Link href={`/?ticket=${t.id}${statusQ}${page ? `&page=${page}` : ''}`} aria-current={sp.ticket === t.id ? 'true' : undefined} className="grid gap-1 p-3 hover:bg-stone-50">
                    <span className="flex items-center justify-between gap-2"><span className="truncate font-medium">{t.subject}</span><StatusChip status={t.status} /></span>
                    <span className="flex flex-wrap gap-x-2 text-xs text-stone-700">
                      <span className="break-all">{t.fromEmail}</span>{t.topic && <span>{t.topic}</span>}{t.urgency && <span>urgency: {t.urgency}</span>}
                      {t.needsHuman && <span className="font-semibold text-amber-900">needs human</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Pagination" className="flex justify-between p-3 text-xs">
            {page > 0 ? <Link className={LINK} href={`/?page=${page - 1}${statusQ}`}>Previous</Link> : <span />}
            {items.length === PAGE_SIZE && <Link className={LINK} href={`/?page=${page + 1}${statusQ}`}>Next</Link>}
          </nav>
        </section>

        {sp.ticket && !detail ? (
          <p role="alert" className={`${CARD} p-4 text-sm lg:col-span-2`}>Ticket not found.</p>
        ) : !detail ? (
          <p className={`${CARD} p-4 text-sm text-stone-700 lg:col-span-2`}>Select a ticket to review.</p>
        ) : (
          <>
            <section aria-labelledby="ticket-h" className={`${CARD} rise grid min-w-0 content-start gap-3 p-4`}>
              <h2 id="ticket-h" className={H}>{detail.ticket.subject}</h2>
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-stone-700"><span>From {detail.ticket.fromEmail}</span><span aria-hidden="true">·</span><time dateTime={detail.ticket.receivedAt.toISOString()}>{detail.ticket.receivedAt.toISOString()}</time><StatusChip status={detail.ticket.status} /></p>
              {detail.ticket.status === 'failed' && <p role="alert" className="rounded border border-red-400 bg-red-100 p-2 text-sm text-red-950">Processing failed: {detail.ticket.failureReason}</p>}
              {detail.ticket.injectionSuspected && <p role="alert" className="rounded border border-amber-500 bg-amber-100 p-2 text-sm text-amber-950">Warning: this email contains text that looks like instructions to the assistant. It was treated as data and ignored.</p>}
              {detail.ticket.needsHuman && <p className="rounded border border-amber-400 bg-amber-50 p-2 text-sm text-amber-950">Needs human handling: {detail.ticket.needsHumanReasons.join(', ')}</p>}
              <pre className="whitespace-pre-wrap break-words rounded bg-stone-50 p-3 font-sans text-sm">{detail.ticket.body}</pre>
              <div className="text-sm">
                <h3 className="font-semibold">Customer</h3>
                {detail.customer ? <p>{detail.customer.name} · {detail.customer.plan} plan</p> : <p className="font-medium text-amber-900">Unmatched sender: no account details were used.</p>}
              </div>
              {detail.classification && (
                <div className="text-sm">
                  <h3 className="font-semibold">Classification</h3>
                  <p>{detail.classification.topic} · urgency {detail.classification.urgency}{!detail.classification.valid && ' · failed validation'}</p>
                  <p className="text-stone-700">Confidence (model&apos;s own estimate, not measured accuracy): {detail.classification.confidence.toFixed(2)}</p>
                  <p className="text-stone-700">{detail.classification.reasons.join('; ')}</p>
                </div>
              )}
            </section>

            <section aria-label="Draft and evidence" className={`${CARD} rise grid min-w-0 content-start gap-4 p-4`}>
              {detail.draft ? (
                <>
                  <p className="text-sm">Evidence: <strong className={`rounded px-2 py-0.5 ${EVIDENCE_STYLE[detail.draft.evidenceStatus] ?? 'bg-stone-100'}`}>{detail.draft.evidenceStatus}</strong></p>
                  {detail.draft.unsupportedPoints.length > 0 && (
                    <div className="text-sm"><h3 className="font-semibold">Not supported by the help docs</h3><ul className="list-disc pl-5">{detail.draft.unsupportedPoints.map((p) => <li key={p}>{p}</li>)}</ul></div>
                  )}
                  <ReviewPanel
                    key={detail.ticket.id + detail.ticket.status}
                    ticketId={detail.ticket.id} toEmail={detail.ticket.fromEmail}
                    initialBody={detail.review?.finalBody ?? detail.draft.body} isPlaceholder={detail.draft.isPlaceholder}
                    disabled={detail.ticket.status !== 'awaiting_review'}
                  />
                  {detail.ticket.status === 'approved' && <SendApprovedPanel ticketId={detail.ticket.id} toEmail={detail.ticket.fromEmail} />}
                  {detail.ticket.status === 'sent' && <p role="status" className="rounded border border-emerald-500 bg-emerald-100 p-2 text-sm">Sent (mock) · nothing was delivered to a real mailbox.</p>}
                  {detail.ticket.status === 'rejected' && <p role="status" className="rounded border border-rose-400 bg-rose-100 p-2 text-sm">Rejected: {detail.review?.rejectReason}</p>}
                  <div className="text-sm">
                    <h3 className="font-semibold">Sources</h3>
                    {detail.citations.length === 0 ? <p className="text-stone-700">No sources cited.</p> : (
                      <ol className="mt-1 grid gap-2">
                        {detail.citations.map((c, i) => (
                          <li key={c.id} className="rounded bg-stone-50 p-2"><p className="font-medium">[{i + 1}] {c.title} · {c.section} · v{c.version}</p><blockquote className="mt-1 border-l-2 border-stone-400 pl-2 text-stone-800">{c.text}</blockquote></li>
                        ))}
                      </ol>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-stone-700">{detail.ticket.status === 'failed' ? 'No draft was produced.' : 'Draft is still being prepared.'}</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
