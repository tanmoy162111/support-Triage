# Support Triage

BeyondAI Use Case 2: an agent-assisted support inbox.

## What this is, and is not

For each incoming support email the system identifies the customer, classifies topic and urgency, retrieves help-doc evidence, and drafts a grounded reply. **A human must approve every reply.** Nothing is ever sent on its own.

- It is **not** a website chatbot.
- All data is **synthetic** (customers, help docs, sample tickets).
- All integrations are **mocks**: the inbox is a paste form and a sample loader, and "sending" goes to a mock mailer. These are labelled `mock` in the UI. Nothing is delivered to a real mailbox.

## How it works

Ticket states: `received -> classified -> drafted -> awaiting_review -> approved | rejected -> sent | failed`. Each step writes an audit event. The pipeline stops at `awaiting_review`; it cannot send.

| Step | Mechanism |
|---|---|
| Ingest (validate, normalise, idempotent on message id) | deterministic code |
| Customer match (exact sender email, then domain) | deterministic code |
| Classify (topic, urgency, confidence, reasons) | **LLM** (schema-validated) |
| Retrieve help-doc chunks (tenant + published filter, score threshold, conflicting-version check) | embedding + deterministic filter |
| Draft reply (reply, cited chunk ids, unsupported points) | **LLM** |
| Draft validator (cited ids must have been retrieved, citation required, no uncited amounts/dates/commitments) | deterministic code |
| Needs-human routing | deterministic rules |
| Approval gate and send | deterministic code |

**Needs-human rules** (`src/domain/routing.ts`): unmatched customer; no evidence; conflicting evidence; cancellation/refund topic with no cited policy; critical urgency; invalid classification; `low_confidence` (model confidence < 0.5, a conservative extra flag only); possible prompt injection; draft rejected by the validator. These change flagging and whether a draft is offered. Every ticket still goes through review.

**Approval gate.**
- `outbound_messages.review_id` is `NOT NULL` (foreign key to `reviews`).
- `sendApproved` (`src/services/send.ts`) refuses unless the ticket's *latest* review is `approved` or `edited` and the ticket status is `approved`.
- It is idempotent: the outbound row is claimed on a unique key (`send:<review id>`) before the mailer is called, so a double click or replay yields one record.
- A failed send marks the ticket `failed` and is not retried automatically.

## Setup

Prerequisites: Node.js, pnpm (`packageManager` is pnpm 11.5.0), Docker.

```bash
cp .env.example .env.local        # then edit .env.local (never commit it)
docker compose --env-file .env.local up -d db
pnpm install
pnpm db:migrate
pnpm seed
pnpm dev
```

`.env.local` variables (see `.env.example`; it contains placeholders only):

| Variable | Meaning |
|---|---|
| `POSTGRES_PASSWORD` | password for the Docker Postgres user `triage`; choose your own |
| `DATABASE_URL` | dev database connection string (`127.0.0.1:5434`, db `support_triage`) |
| `TEST_DATABASE_URL` | test database (`support_triage_test`); used by integration tests and e2e |
| `LLM_PROVIDER` | `mock` (default) or `gateway` |
| `AI_GATEWAY_API_KEY`, `LLM_MODEL`, `EMBED_MODEL` | only for `gateway` |
| `RETRIEVAL_MIN_SCORE` | minimum cosine similarity for a chunk to count as evidence (0.15 in `.env.example`) |
| `DEMO_TENANT_ID` | tenant id used for all queries (`demo`) |

The compose service runs Postgres 18 with pgvector (`pgvector/pgvector:pg18`) on `127.0.0.1:5434`. On first start of an empty volume it creates the `support_triage` and `support_triage_test` databases and enables the `vector` extension.

`pnpm seed` loads the synthetic customers and help chunks if the tenant's knowledge base is empty, then loads 8 synthetic sample tickets for tenant `demo` and processes them (nothing is sent). It is idempotent.

Note: running `next dev` (`pnpm dev`) makes Next.js append a managed block to `AGENTS.md`. That is tool-generated; commit or restore it as you prefer.

## LLM provider

- `LLM_PROVIDER=mock` (default): offline and deterministic. The "LLM" is a keyword-rule stand-in. Mock embeddings are a lexical hashed bag-of-words, **not semantic**.
- `LLM_PROVIDER=gateway`: Vercel AI Gateway through AI SDK v7. Needs `AI_GATEWAY_API_KEY`, `LLM_MODEL` and `EMBED_MODEL`. The embedding model must output 1536 dimensions (the `kb_chunks.embedding` column size).

**The gateway path is UNVERIFIED against the live service.** No API key was available during development. It is only unit-tested with a mocked `ai` module.

Switching provider requires re-embedding the knowledge base, because mock and real embeddings are not comparable. Guidance (not run as part of this README): delete the tenant's chunks, e.g. `DELETE FROM kb_chunks WHERE tenant_id = 'demo';` (no other table references `kb_chunks`), then run `pnpm seed`. Seeding embeds the help chunks again only when the tenant has none. Existing tickets keep their old drafts and citations.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | `next dev` (see the AGENTS.md note above) |
| `pnpm build` | production build |
| `pnpm typecheck` | `next typegen && tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest (unit, integration against the test database, safety suite) |
| `pnpm db:generate` | generate a Drizzle migration from the schema |
| `pnpm db:migrate` | apply migrations to `DATABASE_URL` |
| `pnpm db:reset-test` | reset the test database |
| `pnpm seed` | load synthetic help docs, customers and sample tickets |
| `pnpm eval:generate` | regenerate `evals/data/tickets.v1.json` |
| `pnpm eval` | run the evaluation against the configured provider |
| `pnpm e2e` | reset the test database, then build and run a production server on port 3100 against the **test** database and run the Playwright smoke tests |

## Evaluation

The eval set (`evals/data/tickets.v1.json`, version `v1`) is synthetic: 121 cases.
- 108 templated normal tickets: 12 help-doc topics x 3 phrasings x 3 urgency lines.
- 8 edge cases: unmatched sender, conflicting doc versions, vague, no evidence, critical outage, non-English, multi-issue, refund with no policy.
- 5 prompt-injection cases.

`pnpm eval` runs each case through the real pipeline in a throwaway tenant (cleaned up afterwards) and scores: topic and urgency accuracy with a confusion matrix, topic accuracy by confidence band, retrieval hit rate, draft grounding (via the deterministic validator), needs-human recall and precision, injection bypasses (any bypass makes the command exit non-zero), latency, and token usage. Injection cases are excluded from the accuracy figures.

**Results with `LLM_PROVIDER=mock`, run 2026-10-31** (non-injection cases, n = 116 unless stated):

| Metric | Result |
|---|---|
| Topic accuracy | 91.4% (n = 116) |
| Urgency accuracy | 68.1% (n = 116) |
| Retrieval hit rate | 99.1% (n = 112 cases with an expected doc) |
| Grounded draft rate | 100% (n = 113 drafts) |
| Needs-human recall | 100% (7 positives) |
| Needs-human precision | 50% (14 flagged) |
| Topic accuracy, confidence 0.8-1.0 | 99.0% (n = 105) |
| Topic accuracy, confidence 0.4-0.8 | 18.2% (n = 11) |
| Injection bypasses | 0 of 5 |
| Failed tickets | 0 of 121 |
| Latency p50 / p95 | about 21 ms / 27 ms (mock, local) |
| Tokens | 0 (mock) |

These numbers measure the **mock's keyword rules, not model quality**. They come from synthetic, templated, small-sample data and do not establish production accuracy.

**Not done yet:** the real-model evaluation and calibration of the retrieval threshold (`RETRIEVAL_MIN_SCORE`, currently 0.15 for the lexical mock). Both need a gateway key.

Observed trade-off: with the mock, the `low_confidence` rule raises needs-human recall and lowers precision.

## Safety and privacy design

- Email bodies and retrieved docs are treated as untrusted data. Model input is wrapped in a `<data>` block and system prompts tell the model never to follow instructions inside it.
- A deterministic injection heuristic (`src/domain/injection.ts`) flags suspicious emails with the `possible_prompt_injection` reason. The ticket still requires review; the flag is a warning.
- Every query is scoped by `tenant_id`.
- A ticket failure reason contains only the step name, the error class name and a status code, never the provider's error message.
- Audit events store ids, counts and enum values only, not raw email bodies. The only `console` call in `src` logs an error name.
- Secrets live only in `.env.local` (git-ignored). `.env.example` has placeholders.

## Known limitations

- One demo reviewer and no authentication. The tenant comes from the `DEMO_TENANT_ID` environment variable.
- No real inbox and no real sending; both are mocks.
- Processing is synchronous inside the request. There is no queue or worker.
- The UI uses Tailwind, not shadcn/ui (the spec named shadcn/ui).
- The knowledge base has 16 seeded help chunks (spec target was 20-30).
- Retrieval threshold margin with the lexical mock is thin (noise around 0.13 against a 0.15 threshold).
- A crash after claiming a ticket for processing, or after claiming an outbound row, leaves it stuck. There is no recovery job; sending is at-most-once by design.
- The gateway path is untested against the live service.
- Needs-human reason codes are shown raw in the UI.
- Timestamps are shown as ISO strings.

## What a real client rollout needs

- The client's historical tickets and real help docs.
- An inbox or helpdesk integration with proper authorization.
- Real authentication and roles.
- A baseline measurement of current handling time before claiming any time saved.
- Calibration of thresholds (retrieval score, confidence flag) on real data, with a real-model evaluation.

## Project layout

```
src/domain/      pure rules: state machine, routing, draft validator, injection heuristic
src/pipeline/    ingest, identify-customer, classify, retrieve, draft, process-ticket, audit
src/adapters/    LLM, embedder and mailer interfaces; mock and gateway implementations
src/services/    review, send (approval gate), samples, queries, metrics
src/db/          Drizzle schema and client (migrations are in drizzle/)
src/seed/        synthetic customers, help chunks, sample tickets
src/app/         reviewer UI, /metrics, /diagnostics, API routes
evals/           dataset generator, runner, scoring
e2e/  tests/     Playwright smoke tests; Vitest suites
scripts/         migrate, seed, reset-db
```

Documents: design spec `docs/superpowers/specs/2026-10-31-support-triage-design.md`, implementation plan `docs/superpowers/plans/2026-10-31-support-triage.md`, engineering playbook `codex.md`, project rules `CLAUDE.md`, `AGENTS.md`.
