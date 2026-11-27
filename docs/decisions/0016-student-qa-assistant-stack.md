# ADR-0016: Student Q&A assistant stack and backend-mediated access

> Scoped succession, 2026-10-27: [ADR-0020](0020-srs-v02-business-baseline-and-technical-staff.md). Viewer runtime provider/general-answer generation is superseded as target by approved-bank answers only; provider assists Staff drafting. Backend privacy/robot-control boundaries remain. Per-session limits are not the target global 8/20 queue. No new advisor approval is recorded.


- Date: 2026-10-13.
- Status: accepted by team for implementation planning; not implemented.
- Business baseline: ADR-0009/0010/0011, scope P0-07 and P1-01; advisor
  approval is not implied.
- Contract: `docs/architecture.md` §7.1.

Implementation update, 2026-10-19: the backend-mediated text Q&A slice and invited
Student integration now exist under the §7.1 contract, including SQL-backed
access checks and offline/fake-service tests. The original planning status above
is historical; it does not claim live provider quality, voice integration,
production readiness or advisor approval. STT/TTS remain separate work.

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

## Addendum: HTTP framework and test tooling (2026-10-13)

The first implementation uses **Starlette** (the ASGI toolkit FastAPI is built
on) with pydantic models and uvicorn, instead of FastAPI. The Gemini adapter
uses the standard-library HTTP client in a worker thread instead of httpx,
and tests use the standard-library `unittest` instead of pytest. Runtime
dependencies are therefore only starlette, pydantic and uvicorn; ruff is the
only development dependency.

Reasons: the service has two internal endpoints and needs none of FastAPI's
additions (OpenAPI docs, dependency injection); fewer dependencies are less
to install and patch; and the development environment used for the first
implementation could not install packages from PyPI, while these choices let
the full test suite run there. Requests and responses still use pydantic and
the §7.1 contract is unchanged. Switching to FastAPI later only affects
`src/campus_assistant/api.py`.

## Addendum: OpenAI-compatible gateway adapter (2026-10-19)

The team's available key is for a third-party gateway that serves Gemini
models through the OpenAI chat-completions format, not a Google AI Studio key.
`AI_PROVIDER=openai_compat` adds a second adapter
(`providers/openai_compat.py`, configured by `OPENAI_BASE_URL`,
`OPENAI_API_KEY`, `OPENAI_MODEL`) behind the same provider interface. Still
one provider per deployment and no fallback; the `/v1/answer` contract is
unchanged and `gemini` stays the default.

Consequences: student questions and approved content pass through the gateway
operator as well as the model provider, so the data and terms concerns above
apply to that operator too. Gateway availability is outside the team's
control; a Google AI Studio key is the fallback, switched by configuration
only. The adapter does not request structured output; it relies on the system
prompt and strips a Markdown fence, so a live evaluation run is needed before
relying on it. First live run (2026-10-19, `ag/gemini-3.8-flash-low`, same
content version and question set as the recorded Gemini baseline): 64/64
gradable questions passed (baseline 63/64), no regressions. Grading is by
keywords; reports stay untracked and `evals/recorded/latest.json` remains the
Gemini baseline.

## Update 2026-11-28

### Context

Phiếu v1.12 and Report 3 BR-18/19 require private Viewer answers from approved entries or a fixed reply,
with a bounded instance-wide admission queue. The original record chose a provider-backed Student Q&A service.

### Decision

Viewer answers are selected only from the approved answer bank or the fixed refusal. Gemini assists Staff
content drafting; it does not freely generate Viewer replies. Narration approval is by a Staff member other than
its last editor (BR-36); that rule alone does not establish a reviewed Q&A bank.
Q&A admission is instance-wide: at most 8 executing and 20 executing plus waiting (BR-19).
Backend session/revocation checks, no roster data to AI and no AI robot-control boundary remain.

The separate Python HTTP boundary is retained. The service implementation uses Starlette, pydantic and uvicorn,
rather than the original FastAPI/tooling selection. HTTP cancellation/timeout is bounded by the configured
client timeout or 20 seconds, whichever is smaller.
The system-wide modular ASP.NET Core / separate Python deployment choice is **ADR-0074**; it is not silently
attributed to the original Q&A decision or to repository ADR-0020.

### Rejected alternatives

- General/free-generated Viewer answers, including "outside the Tour": violate BR-18 and the approved-content rule.
- Sending roster/session secrets to the provider: violates BR-20 and expands the privacy boundary.
- Treating per-session throttles as the 8/20 queue: cannot enforce instance-wide admission and waiting behavior.

### Consequences

Reviewed entries make replies auditable, but Staff must maintain and approve the answer bank.
The Python HTTP hop adds latency and a failure mode; busy/timeout/unavailable replies must be explicit.
An approved narration pack is not itself an approved Q&A bank.

### Status / Notes

The original Viewer-generation policy is **partially superseded by ADR-0020** and Phiếu v1.12.
Main `1b586a70` still calls `ai-assistant/src/campus_assistant/service.py` → `provider.generate`;
sanitization is not approved-bank selection. The Python limiter defaults to 8 in flight and rejects overflow
without the required waiting queue; `StudentQuestionGate` supplies additional per-session limits.
These business gaps are [change #469](https://github.com/30Sativa/smart-campus-tour/issues/469).
Report 4's modular-backend citation is corrected to new ADR-0074, with ADR-0016 retained for Q&A policy/boundaries.
