# Support Triage: Status Report

Date: 2026-10-31. Branch merged: `feat/support-triage`.

## What exists

An agent-assisted support inbox over **synthetic data and mock integrations**. For each email it matches the customer, classifies topic and urgency, retrieves help-doc evidence, drafts a grounded reply, and stops at `awaiting_review`. Only a human approval can lead to a (mock) send.

Verified at merge time: `pnpm test` 239 passed, `pnpm e2e` 3 passed, typecheck, lint and build clean, and the mock eval exits 0 with 0 injection bypasses.

## Current limitations

**Not verified against reality**
1. **The real LLM path has never run.** `GatewayLlm` and `GatewayEmbedder` are unit-tested only against a mocked `ai` package. Real model output, latency, cost and error behaviour are unknown.
2. **Eval numbers measure the mock, not model quality.** Mock results (topic accuracy 91.4%, urgency 68.1%, retrieval hit 99.1%, needs-human precision 50%) say nothing about production accuracy. The injection test cannot fail under the mock.
3. **`RETRIEVAL_MIN_SCORE` (0.15) is uncalibrated.** With the lexical mock embedder the margin between noise (~0.13) and the threshold is thin.
4. **No LLM-judge grounding check.** Only the deterministic validator (citations, numbers, dates, risky phrases) runs. It is conservative but rule-based, so novel unsupported claims phrased in new ways can still pass.

**Product scope**
5. No authentication: a single hard-coded demo reviewer. Do not expose this to a network.
6. No real inbox or sending. The mailer is a mock and the data is synthetic.
7. Processing is synchronous inside the request. There is no queue or worker.
8. **No stuck-claim recovery.** A crash mid-processing leaves a ticket (or outbound row) stuck, with no recovery job.
9. Migration `0001` adds unique indexes and would fail on a database that already has duplicate rows.
10. The knowledge base has 16 help chunks (spec target 20–30), and the UI uses plain Tailwind, not shadcn/ui.
11. English only.
12. Tickets are screened for prompt injection by a keyword heuristic that only raises a warning. It is not a defence by itself. The defences are the data/instruction separation, the validator and the approval gate.

## What you need to do

**Required before any real-model use**
1. Create an AI Gateway key and put these in `.env.local` (never commit it):
   `AI_GATEWAY_API_KEY`, `LLM_MODEL`, `EMBED_MODEL`, and set `LLM_PROVIDER=gateway`. The embedding model must output **1536 dimensions**, or the schema must change.
2. Re-seed the knowledge base so it is re-embedded with the real embedder, then run `pnpm eval`.
3. Tune `RETRIEVAL_MIN_SCORE` from the real score distribution, then read the eval results with their sample sizes.
4. Hand-check a sample of real drafts for grounding. This is the validation the spec asks for and I could not do it.

**Local setup (on any new machine)**
5. Copy `.env.example` to `.env.local` and set `POSTGRES_PASSWORD`. Then `docker compose --env-file .env.local up -d db`, `pnpm install`, `pnpm db:migrate`, `pnpm seed`.
   The DB listens on `127.0.0.1:5434` because 5433 is used by another project's container.

**Decisions only you can make**
6. `next dev` appends a managed block to `AGENTS.md` on each run. Either commit that block or restore the file after running `dev`. The e2e uses a production build, so it does not trigger this.
7. `.planning/` is untracked (an auto-created checkpoint folder). Delete it or add it to `.gitignore`.
8. Before using any real customer data or a real mailbox you need auth and roles, a data-handling review, and a retention policy. All are out of scope today.
9. Optional setup deferred earlier: Postgres MCP, hooks, an `eval-run` skill.

## Safety properties to preserve

- Only `sendApproved()` creates an outbound row; `outbound_messages.review_id` is NOT NULL with an FK.
- Email text and retrieved docs are untrusted data, kept out of system prompts.
- Logs and audit events hold ids and enums only, never email bodies.
