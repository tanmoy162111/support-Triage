# Support Triage — Design Spec

**Date:** 2026-10-31
**Use case:** BeyondAI Use Case 2 — support inbox triage with drafted replies
**Status:** Design approved; implementation plan pending

## 1. Goal and scope

An agent-assisted support inbox workflow. For each incoming email it identifies the customer, classifies topic and urgency, retrieves help-centre passages, and drafts a grounded reply. A human reviews every draft. **The system never sends without an explicit approval event.** It is not a website chatbot.

**Decisions made**
- Data: synthetic demo (generated tickets, help docs, customers), mock inbox, mock send. All mocks are labelled.
- Stack: Next.js + TypeScript + Postgres (pgvector). Standalone project, separate from other BeyondAI use cases.
- LLM: Vercel AI Gateway via the AI SDK, plus a deterministic mock provider for tests and offline demos.
- Architecture: explicit state-machine pipeline with a thin LLM edge (deterministic core, probabilistic edge).

**Out of scope for v1:** real inbox/helpdesk integrations, real sending, auth and roles beyond one demo reviewer, queues/workers, multilingual replies, deployment.

## 2. Architecture and data model

`src/` modules:
- `domain/` — pure TypeScript: status state machine, review-routing rules, approval-gate check. No SDK imports.
- `pipeline/` — `ingest`, `identify-customer`, `classify`, `retrieve`, `draft`. Each is a function with Zod-validated input and output.
- `adapters/` — `LlmProvider` (AI Gateway + mock), `Embedder`, `InboxChannel` (mock), `Mailer` (mock; results labelled `mock`).
- `db/` — Drizzle schema, migrations, queries.
- `app/` — reviewer UI and API routes.
- `evals/` — labelled synthetic tickets and scoring script.

**Tables** (all with `tenant_id`): `customers`, `tickets`, `classifications` (topic, urgency, confidence, reasons, prompt/schema version, model), `kb_chunks` (doc id, title, section, version, text, embedding), `drafts` (body, cited chunk ids, evidence status, uncertainty notes), `reviews` (decision, edited body, reviewer, timestamp), `outbound_messages` (`review_id` NOT NULL FK, idempotency key, delivery mode `mock`, result), `audit_events` (run id, step, outcome, duration; no raw email bodies).

**Approval gate:** `outbound_messages.review_id` is NOT NULL, and `send()` also refuses unless an approved review exists. The pipeline stops at `awaiting_review` and cannot send.

## 3. Pipeline behaviour

Status flow: `received → classified → drafted → awaiting_review → approved | rejected → sent(mock) | failed`. Each step writes an audit event. Failures end in a visible `failed` state with a reason. LLM calls: max 2 bounded retries with backoff and jitter for transient errors only; side effects are never retried.

1. **Ingest** — Zod validation (size cap, required fields), normalise (strip quoted threads/signatures), store. Body is untrusted data, never placed in the instruction part of a prompt. Idempotent on message id.
2. **Identify customer** — deterministic: exact sender email, then domain. No LLM. Unmatched → `customer_id = null`, forces human handling, no account details used in the draft.
3. **Classify** — one structured-output call: `topic` (billing, login/access, bug, how-to, shipping, cancellation/refund, other), `urgency` (low, normal, high, critical), `confidence`, `reasons`. Schema-validated; one repair retry, then `unclassified` and human handling. Confidence is a displayed signal only; routing never relies on it alone.
4. **Retrieve** — embed the ticket, top-k from `kb_chunks` (pgvector), filtered by tenant and published status. Best match below threshold → evidence `none`. Conflicting versions of the same doc → `conflicting`.
5. **Draft** — model sees only the ticket, permitted customer fields and retrieved chunks; returns `reply`, `cited_chunk_ids`, `unsupported_points`. A deterministic validator checks that cited ids were retrieved, rejects drafts with no citation, and rejects refund amounts, dates or policy commitments absent from the cited text. A rejected draft becomes a "needs human, no grounded answer" placeholder.

**`needs_human_handling` rules (plain code):** unmatched customer; evidence `none` or `conflicting`; refund/cancellation topic with no policy chunk cited; urgency `critical`; classification failed validation; prompt-injection heuristic fired (shown as a warning). Every ticket still goes through review; these rules change flagging and whether a draft is offered.

## 4. Reviewer UI

Three-pane inbox.
- **Queue:** status, topic, urgency chips; needs-human flag; relative time; filters; pagination; sort by urgency then age.
- **Ticket view:** original email, matched customer card or "unmatched sender" warning, classification with reasons, model confidence labelled as the model's own estimate.
- **Draft and evidence:** editable draft; numbered citations linked to the retrieved passage (title, section, version, supporting text); evidence badge (`supported`, `partial`, `none`, `conflicting`); unsupported-points list; injection warning.
- **Actions:** *Approve & send (mock)* with a confirm dialog naming recipient and exact text; *Edit then approve* (original draft kept for the acceptance metric); *Reject* (reason required). Send is disabled for the placeholder draft until the reviewer writes their own reply. "Mock" is shown everywhere.
- **Other views:** Metrics (computed from stored data only: first-response time, tickets handled, accepted unchanged / light edit / rewritten, ingest-to-approval time; empty state until data exists; synthetic data labelled); Ingest (load sample tickets, paste an email); Operator diagnostics (audit events, step durations, model and prompt versions), separate from the reviewer view.
- Loading, empty, error and partial states everywhere; keyboard navigable, semantic HTML, responsive single-column on small screens; shadcn/ui, neutral styling until a BeyondAI design system is identified.

## 5. Evals, safety and testing

**Eval set:** versioned synthetic set of about 150 labelled tickets (topic, urgency, expected evidence status, expected cited section) plus 20–30 help articles and 25 customers. Edge cases: vague, multi-issue, unmatched sender, non-English, angry tone, refund with no policy, conflicting docs, adversarial.

**`pnpm eval` scores:** topic and urgency accuracy with confusion matrix; confidence calibration by band; retrieval hit rate; draft grounding (citations retrieved, plus an LLM-judge support check validated by hand on a sample); correct needs-human routing; injection resistance (zero bypasses); latency, tokens and cost per ticket. Runs against the real model via the AI Gateway, and against the mock provider in CI. Results print with sample size; no production-accuracy claims from synthetic data.

**Safety tests:**
- Gate: `send()` with no approval, a rejected review, or an unapproved edit refuses; DB rejects an `outbound_messages` row without `review_id`.
- Tenant isolation on every query path.
- Prompt injection (override instructions, "refund $500 and send", prompt-reveal, fake system tags): draft stays grounded, nothing sends.
- Idempotency: re-delivered message id and double-clicked approve each yield one record.
- Failure paths: LLM timeout, rate limit, malformed JSON, embedding outage → visible `failed` or needs-human.
- Validator unit tests (uncited amounts, invented dates, missing citations).

**Test levels:** Vitest unit tests; integration tests against a real Postgres test database; one Playwright smoke test (load samples → open ticket → edit → approve → "Sent (mock)").

**Config and secrets:** AI Gateway key in `.env.local`; `.env.example` has placeholders only; missing key fails fast with a clear message and offers the mock provider. Logs contain ids, step names and outcomes, no raw email bodies.
