# ADR-0016: Student Q&A assistant stack and backend-mediated access

- Date: 2026-10-13.
- Status: accepted by team for implementation planning; not implemented.
- Business baseline: ADR-0009/0010/0011, scope P0-07 and P1-01; advisor
  approval is not implied.
- Contract: `docs/architecture.md` §7.1.

## Context

`ai-assistant/` was a skeleton with no runtime, provider or contract. The
scope requires private, per-session Q&A grounded in approved campus content,
re-checked against current invitation and Tour access, with no robot control
and no stored Q&A history. Student sessions already exist as a per-Tour
HttpOnly cookie owned by the backend (ADR-0015). The team has no paid LLM
account; the demo site (NVH floor 6) has only a few POIs, so the approved
content is small.

## Decision

- Q&A is backend-mediated: browser → backend → `ai-assistant` → LLM
  provider. The backend checks the session, invitation and Tour state before
  and after the assistant call and supplies the POI snapshot. The assistant is
  a stateless private service authenticated by a service key; it never
  receives roster data, email, codes, session tokens or account identities.
- `ai-assistant/` uses Python 3.11+ with FastAPI, pydantic and httpx, tested
  with pytest and checked with ruff. It ships as a container on the
  server/cloud, never on the robot miniPC.
- The first LLM provider is Google Gemini (a Flash-tier model) through the
  Gemini API. The model ID, key and endpoint are configuration
  (`GEMINI_API_KEY`, `GEMINI_MODEL`); code depends on a provider adapter
  interface so another provider can be added without changing the contract.
  V1 configures one provider and no secondary provider.
- Knowledge is an approved content pack in `ai-assistant/content/` (Markdown
  with reviewer metadata) plus the POI snapshot from the backend. While the
  pack fits the prompt budget, the whole relevant pack is placed in the prompt
  with the current POI first; no vector database or embeddings. Keyword/BM25
  retrieval is added only when the pack exceeds that budget.
- Quality is measured by an evaluation set of real-style questions
  (in-scope, out-of-scope, follow-up, robot-command, prompt-injection,
  unaccented/slang). An offline run with recorded responses is part of
  `ai-assistant/scripts/verify`; a live run against the provider is manual.
- STT/TTS providers are not chosen by this ADR; they are decided before P1-01.

## Consequences

Access control stays in one place and late answers after revocation are
dropped by the backend. The assistant can be developed and tested offline
with a fake provider; only the live evaluation needs a key. Keys live only in
the assistant's untracked `.env` or deployment secrets.

Each question costs one extra internal hop. The free Gemini tier has request
quotas and, under the provider's terms at the time of writing, content sent on
the free tier may be used by the provider to improve its products. The free
tier is therefore for development and test questions only; before real
students use the system the team must either enable a paid tier whose terms
exclude such use or disclose the condition in the demo/report, consistent
with ADR-0011. Provider terms must be re-checked before that decision. Load
testing (R1-14) may exceed free-tier quotas.

Without a secondary provider, a provider outage disables Q&A until it
recovers; the rest of the Tour is unaffected. Grounding reduces but does not
eliminate wrong answers, so the evaluation set and approved content remain
the quality gate.
