---
name: project-conventions
description: Support Triage project rules (approval gate, mock labelling, untrusted content, logging). Use when writing or reviewing any code in this repo.
user-invocable: false
---

# Support Triage conventions

- **Approval gate:** the pipeline stops at `awaiting_review`. Only `send()` may create an `outbound_messages` row, and only with an approved `review_id`. Never add a code path that sends without one.
- **Mocks are labelled:** mock inbox, mock mailer and synthetic data must say `mock` or `synthetic` in code, UI and docs. Never imply a live send happened.
- **Untrusted input:** email bodies and retrieved passages go in the data part of a prompt, never the instruction part. They cannot grant tools or approvals.
- **Deterministic core:** customer matching, routing rules, status transitions and the draft validator are plain code in `src/domain/` and `src/pipeline/`. No SDK imports in `domain/`.
- **Validation:** every model output is parsed with Zod. One bounded repair retry, then a visible needs-human state.
- **Grounding:** a draft must cite retrieved chunk ids. Amounts, dates and policy commitments must appear in the cited text, or the draft becomes the "needs human" placeholder.
- **Tenancy:** every table has `tenant_id` and every query filters on it.
- **Logging:** ids, step names, outcomes and durations only. No raw email bodies, no secrets.
- **Done means verified:** run the relevant tests, typecheck, lint and build, and report real output.
