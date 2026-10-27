# SRS v0.2 backend source ledger and staged gaps

Read live on **2026-10-27**; owner authorizes SRS adoption and the scoped
Technical Staff map/POI implementation. Google Docs are updated separately
under revision guard. Code baseline for this follow-up branch: Route PR #90 commit
`ce844c0` (based on `main` at `a350139`).
This register distinguishes implemented API/schema from pending hardware,
frontend, route and broader authorization work.

## Sources and status

| Source | Native tab / version | Use |
|---|---|---|
| [Phiếu](https://docs.google.com/document/d/1JF-aRvwC_jkI07Wo6duQElqXNW5Fgy8dAIGU7j6G-gM/edit?tab=t.jnbkcy3sta7v) | t.jnbkcy3sta7v, v1.9 | Scope and mandatory research |
| [Report 3](https://docs.google.com/document/d/1JF-aRvwC_jkI07Wo6duQElqXNW5Fgy8dAIGU7j6G-gM/edit?tab=t.0) | t.0, SRS v0.2 aligned to Phiếu v1.9 | Target business authority |
| [Report 4](https://docs.google.com/document/d/1JF-aRvwC_jkI07Wo6duQElqXNW5Fgy8dAIGU7j6G-gM/edit?tab=t.uu43wal203k7) | t.uu43wal203k7, supporting SDD | Design/current evidence only; pending diagrams do not override SRS |

Connector document revision at read: `AHj4eMQ0Tog3_nrk0sBK-tgApmDU0mKDzIb-Ci__yK-4KtjAinYwEcrrQimr4voYdMnOkDSasGpbyQDOLOXA93vs0o_oeevLFuuuWLPc8nU`.
The live SRS includes ACC-04/05, **59 UCs**, FR-49 camera preset and FR-50 guide
narration delivery; do not assume the earlier 57-UC intermediate copy.
Canonical UC meanings follow SRS §7.4, not intermediate reused IDs.
AC-01..11 are source acceptance criteria, not executed Report 5 test-case IDs.

**Target** means adopted requirement awaiting implementation; **current** means
observed code/schema; **pending** means a decision/evidence gate remains open.
[ADR-0020](../decisions/0020-srs-v02-business-baseline-and-technical-staff.md)
records scoped succession without rewriting prior approvals or public APIs.

## Backend gap table

Every path below is relative to repository root. UCs/FRs/BRs/NFRs are SRS codes.
Dependencies are staged by wave W1–W6 below; AC references are targets only.

| Source requirement | Current code/schema evidence | Required backend change / status | Dependency | Acceptance / verification |
|---|---|---|---|---|
| FR-01/02, BR-01; ACC-01/02/03 | ApplicationRoles/AccountRoles previously resolve only three roles; UserRoles.Role VARCHAR(32), no value CHECK | **Implemented this slice:** TECHNICAL_STAFF→TechnicalStaff in create/list/lifecycle/login/refresh; no inheritance, no DDL | Existing account transaction | Role/handler/JWT/policy tests; SQL account tests opt-in; partial AC-08 only |
| FR-02/41; ACC-04/05 | Admin account endpoints exist; no matching settings/audit query workflow for new goals | Add bounded settings/audit contracts; defaults for invalid-code limits pending | W1, explicit configuration decision | AC-08; no invented separate acceptance for unlisted settings |
| FR-03/05, BR-08; POI-02/CFG-03 | AdminPoisController owns current POI API; no technical-confirmation endpoint/table | Technical-only mutation with role/state/tuple audit; Staff denied | W1+W2 | AC-06/08 |
| FR-04/05, BR-16; OPS/MON | Existing business controllers Admin-only; operations hub Staff-role only; Tour.CreatedByUserId is attribution and no OperatorUserId | Explicit Operator/managed-tour relation and per-action authorization; migrate business endpoints deliberately | W1 schema/API design | AC-08; AC-01/10 for operations |
| FR-06/07; MAP-01 | Current v1.1 Route.MapKey/map picker did not retain immutable package or deployment evidence | **Implemented in ADR-0021 slice:** validated ROS YAML+PGM ZIP, map version/checksum, manual exact-checksum robot localization/display record; no robot deploy endpoint | v1.2 additive schema; physical evidence still required | AC-06 API scope; AC-01 hardware proof not run |
| FR-08/09; CFG-02, POI-01/02 | Mutable legacy Pois plus Admin endpoints remain in place; separate immutable revisions now exist for the new Staff flow | **Implemented in ADR-0021 slice:** Staff draft/revise/submit; TechnicalStaff per-revision PASS/FAIL, evidence/history and free-cell/map-version checks. Project POI YAML import/frame conversion remains pending | W2 partial; project template decision pending | API/unit/schema tests; AC-06/08 target not claimed as physical pass |
| FR-10/11/13, BR-07..10; CFG-01/03 | Legacy Routes/RouteStops aggregate hash remains for catalog rows; v1.3 adds immutable `RouteRevisions`, exact map/checksum and POI revision/source-PASS stop links, submission receipts, append-only run evidence and configuration fingerprint | **Implemented:** fixed-route draft/revise/submit, Staff/TechnicalStaff current-revision catalog, Technical-only manual PASS/FAIL, explicit active single-role Staff test participant, origin-aware free-cell validation, latest cross-map deployment lock/check, history and audit. Current navigation fingerprint includes map/checksum, poses, ordered POI navigation fingerprints, camera preset and head-step configuration, excluding dwell. Historical hashes remain unchanged; compatibility uses immutable snapshots. Duration stays incomplete and reports recalculated dwell subtotal. Scheduling/READY and physical-test execution remain unimplemented | W2 + manual physical evidence; Database First v1.3 patch | API/unit and disposable SQL regression; AC-06 remains target, no physical result claimed |
| FR-12/14/16; TOUR-01..08 | Staff-authorized legacy Tour CRUD only; selects `AuthoringMode=LEGACY`, stores no exact RouteRevision or assigned Operator; no reservation, READY snapshot, reopen or target cancellation workflow | **Blocked, fail-closed (ADR-0024):** do not create a versioned Tour or claim target lifecycle until exact-version duration, registration/email decisions and physical readiness sources are available. Existing aliases cannot select VERSIONED routes. No versioned Tour writer is exposed in this phase | W1/W2/W3/W4 plus approved duration and row/email evidence sources | AC-06/08 remain target; no SCHEDULED/READY acceptance pass claimed |
| FR-15, BR-06 | `Tours` has `ScheduledStartAt` but no robot reservation; versioned Route reports `INCOMPLETE_CONTENT_AUDIO_DATA`; manual test duration does not establish configured total duration | **Blocked, fail-closed (ADR-0024):** no reservation can be safely computed or persisted until a version-bound duration source defines the tested-path interval. Do not substitute `MeasuredDurationSeconds`; legacy Tour times do not establish intervals for a robot | W2/W3 schema after duration-source decision; additive Database First patch | 15-minute boundary/overlap/concurrency/retry cases remain unimplemented; no NFR-REL-02 claim |
| FR-17/18/27; OPS-01/02 | No production Start/dispatch; robot current-tour column alone is not assignment logic | Start from READY, check scheduled time, atomic robot claim/state then send first leg; dedup and preflight | W1/W2/W3/W6 + transport decision | AC-01/10; NFR-REL-02 |
| FR-22, BR-03/04/05; REG-02/06/08 | RegistrationInputValidator accepts **1..1000**; Tour/registration models lack row decisions/capacity holds | **Backlog:** ≤10, 48h cutoff, unique Rep/Tour, seat holds and Staff review ≤2 working days | W4 schema/transactions | AC-02/08; boundary/cutoff/concurrency cases |
| FR-22/23, BR-11; REG-03 | RepresentativeRegistrationPolicy blocks all edits after APPROVED or any invitation | **Backlog:** allow target row operations only with coordinated writer/approval/access changes; never only relax policy | W4 after row decision design | AC-02 unchanged codes/session |
| FR-23, BR-11; REG-03 | RegistrationDraftWriter.Replace deactivates every old active row and inserts fresh GUIDs | **Backlog:** stable-row diff; preserve unchanged IDs/approval/credential/session; affected-only revocation and additions pending, in one Tour transaction | W4 writer+review+access together | AC-02, concurrent update/review rollback |
| FR-23/24/26, BR-11/13 | InvitationPolicy, GetInvitations and EfStudentAccessRepository require registration.State == APPROVED | **Backlog:** row-level participation/access; old accepted rows remain valid while unrelated added rows await review | W4 schema + writer + all guards/readers/delivery jobs | AC-02/09; old row access while registration has pending work |
| FR-23, BR-05/11; REG-09/06 | AdminRegistrationsController direct email correction; no EmailChangeRequest entity | **Backlog:** request/review; old email/code valid until decision; rejected request preserves access; accepted request atomically changes affected credential | W4 schema + Staff review authorization | AC-02/08; no direct role-attribute swap |
| FR-24/39/40, BR-12; INV-01..04 | Resend/reissue/revoke and email worker exist; Admin/own-Representative support; whole-registration eligibility | Migrate ownership/row guards; retain retries/correlation, separate email result from participation | W1/W4 | AC-02/08 |
| FR-26/44, NFR-REL-03; INV-05/06 | Unique open session exists; current idle policy is 10min, not same-device 2min reconnect | Explicit reconnect identity/grace and continued access checks; second browser cannot take over | W4 | AC-09 |
| FR-45, NFR-SEC-05; ACC-04/INV-05 | Existing IP join limiter is not the target configurable invalid-code abuse policy | Server invalid-attempt budget/cooldown + administrative settings; default values TBD | W1/W4 + decision | AC-09 |
| FR-25/38, NFR-SEC-02 | Viewer session checks exist; no complete live/fallback relay authorization enforcement | Authorize initial+continued playback, credential/session/Tour revocation ≤10s including copied URL | W4/W5 + media adapter | AC-07 real-browser evidence |
| FR-28/29/30; CFG-04/CONT-01/02 | Poi narration/audio fields and assistant approved pack; no full Staff versioned approval bank | Version/approve/withdraw content; externally produced audio, duration/dwell validation | W1/W2/W5 | AC-04/06; FR-29 has no separate listed AC |
| FR-31/34, NFR-AI-01, BR-18; AI-01..03 | Runtime HttpAiAssistantClient invokes provider-backed assistant; no complete approved-answer matcher; voice pipeline absent | Approved-bank-only Viewer answers; provider drafting only; review transcript before submit | W5; voice-provider/data terms pending; ai-assistant integration separate authorized slice | AC-04; ≥60 question set, no-match vs error |
| FR-32/33, BR-19; AI-01 | **StudentQuestionGate is per-session**, 6/min + one in flight; not global admission | **Backlog:** instance-wide atomic 8 executing/20 total queue, Busy only >20; latency includes wait; outcome metrics | W5 | AC-04, NFR-PERF-04, overload/isolation NFR-CAP-01 |
| FR-35/37/43, NFR-SEC-04 | ADR-0019 Fleet Sync validates dedicated robot credentials and projects telemetry; no command delivery/completion path | Retain telemetry contract; assess rotation/revocation lifecycle and target freshness separately; M2 requires decision | W6 for commands; current telemetry retained | AC-09 partial robot auth; AC-01 Twin/command not passed by telemetry alone |
| FR-36/46, NFR-SAFE-03; OPS/BRN | No production movement command authorizer/runtime | Assigned Operator + state/version, telemetry ≤2s, no incident/unresolved command, attendant and console; denial sends nothing | W1/W2/W3/W6 + transport | AC-10; physical AC-01 |
| FR-19, BR-14; BRN-01/02/03 | BranchRequest tables/indexes exist; no production branch workflow | Server order, one accepted change, verified branch; cutoff remains conflicting and unimplemented | W2/W6 + explicit cutoff decision | AC-01; cutoff cases blocked pending decision |
| FR-21/27/47, BR-15/16 | No production incident/fallback/recovery workflow; column/status is not behavior | Fixed incident order, one appropriate recovery; fallback audio/dwell/map/POI return; no auto resume | W5/W6 + physical gate | AC-01/10; NFR-SAFE-01/02, NFR-REL-01 |
| FR-48, BR-21; OPS-07 | Admin Tour cancel handles pre-Start only; no runtime End Early | Assigned Staff End Early transaction/outbox intent, all-session live/fallback/Q&A revoke, Result, expire branches, cancel active mission/no later motion, notify/audit; separate physical stop | W4/W5/W6 + command transport | AC-11; ACK never proves stop |
| FR-20, BR-17 | No F-14 runtime exception | **Pending: do not implement**; disconnected assigned Operator unable to return only after advisor review | Advisor decision | AC-08/11 pending branch only |
| FR-40/41/42, BR-20, NFR-PRIV-01 | Append-only audit and delivery worker exist; no complete 30-day cleanup/research artifact pipeline | Separate admin/business logs, idempotent jobs, minimize/delete data 30 days after Tour; consent gate | W4/W5/W6 + approved data process | AC-04/07 context; dedicated retention cases needed, no invented AC |
| FR-49/50; POI-02/OPS-01 | Existing head-step data; no exact POI camera-revision verification or pre-start Quest asset receipt/cue | One checked preset/revision; approved asset delivery+receipt before Start, camera before guide cue | W2/W6; M2/guide integration decision | AC-01 physical guide flow; no implementation claim |
| SRS §6.1 / Phiếu §3.3 / FR-42 | Telemetry slice/emulator scaffolds are not benchmark evidence | 1/5/10/20 at 5Hz, 30s+5min ×≥3; 2 baselines; dashboard-before-render timestamps, clocks and metrics; p95 <1s evaluated per load | Dataset/benchmark tools; delivery/freshness pass thresholds pending | AC-05; AC-03 isolation; no new research screen |

## Required coupled registration work

The four defects in policy, writer, row review and access are **one dependency
cluster**, not four independent permission tweaks. Before opening post-approval
edits, introduce row participation/review semantics and email requests through
Database First; change stable-row diff and review; update invitation issuance,
all session/media/Q&A readers and worker guards; preserve Tour-first locking,
idempotency and rollback. Demonstrate accepted old rows retain access while new
rows are pending. Never infer compliance from unchanged access-code strings
alone when aggregate APPROVED gating still denies playback.

## Delivery waves

| Wave | Deliverable | Entry dependency / exit evidence |
|---|---|---|
| W1 Authorization and Staff assignment | Finish role/action matrix, Admin config/audit, explicit managed-tour/Operator assignment; migrate old Admin business ownership | This role foundation first; schema/API ADR for assignment; AC-08 for implemented actions; CreatedByUserId never substitutes |
| W2 Map/POI/route revisions | Immutable map/POI/route revisions, deployment and per-POI evidence, manual exact-tuple whole-route test record | W1; route slice in ADR-0023; project YAML/frame mapping pending; physical route-test evidence required; AC-06 |
| W3 Scheduling, reservation, READY | Staff schedule/reschedule, buffered longest-path reservation, no overlap, exact pass, no pending decisions, locked snapshot | W1/W2; integrate W4 pending-row predicate before declaring READY complete; reservation/concurrency tests + AC-06 |
| W4 Per-row registration/email/invitations/sessions | 10 rows, cutoff/holds, stable diff, row review, request/review email, credential preservation, reconnect and invalid-code limits | W1; coupled schema/writer/guards/transaction cluster; AC-02/08/09 and delivery retry cases |
| W5 Approved-bank Q&A, admission and media | Staff approval, deterministic answer outcomes, global 8/20 queue, continuous live/fallback authorization | W2/W4; provider terms pending for voice; AC-04/07/09, overload tests |
| W6 Operation, incident, End Early | Preflight/Start, command intent/dedup, movement guards, branches after cutoff decision, incident/recovery, FR-48 notifications/revoke, safe release | W1–W5 + command transport/physical integration decisions; AC-01/10/11; F-14 excluded until approved |

These are a dependency plan, not six implementation claims. Report 5 test-case
IDs and schema migration scripts must be created in the corresponding slice,
not invented in this register. Capacity 40 requires declared load evidence.

## Pending / unimplemented disclosure

F-14, branch cutoff, YAML schema/frame conversion and command transport remain
blocked on decisions; no stub may make them appear enabled. Other open source
items: invalid-code defaults, speech provider/terms, research delivery/freshness
thresholds, pilot network/camera/safety evidence. Source SRS integrity wording
about unrecoverable tokens must be reconciled with NFR-SEC-01 recoverably protected
invitation resend before changing credential storage; this account slice does
not alter invitation cryptography.

This slice changes no robot, web or ai-assistant. Scoped Google Docs text updates
are performed separately; diagrams stay pending and are not redrawn. TechnicalStaff
login and human-entered check records are not physical AC-01/06 evidence or full AC-08.
SQL tests create disposable databases only when
`SMARTCAMPUS_SCHEMA_TEST_CONNECTION` is supplied; SKIPPED is not DB verification.
