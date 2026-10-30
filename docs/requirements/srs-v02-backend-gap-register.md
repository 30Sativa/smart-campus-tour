# SRS v0.2 backend source ledger and staged gaps

Read live on **2026-10-27**; owner authorizes SRS adoption and the scoped
Technical Staff map/POI implementation. Google Docs are updated separately
under revision guard. Wave C baseline is Wave B commit `572f5c3`; Route PR #90
commit `ce844c0` is its parent feature baseline.
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
| FR-08/09; CFG-02, POI-01/02 | Mutable legacy Pois plus Admin endpoints remain in place; separate immutable revisions now exist for the new Staff flow | **Implemented in ADR-0021 + ADR-0028:** Staff create/revise/submit is gated by latest exact-version/physical-robot map evidence; TechnicalStaff per-revision PASS/FAIL, evidence/history and free-cell/map-version checks. Project POI YAML import/frame conversion remains pending | W2 partial; project template decision pending | API/unit/schema tests; AC-06/08 target not claimed as physical pass |
| FR-09, post-registration connection confirmation | Robot registration creates a non-dispatchable PHYSICAL identity; credential provisioning and bridge setup are separate | **Implemented in ADR-0029:** first valid Fleet Sync for the current credential stores BE acceptance time/map/frame; new deployment-check PASS requires this durable confirmation, while FAIL is allowed. This confirms HTTPS contact only, not loaded map, localization or safety. Confirmation clears on credential rotation and survives BE restart/offline state. | Database First v1.5; controlled v1.4→v1.5 upgrade/regrant | API, SQL-permission, restart/rotation and FE regression tests; no physical robot acceptance claimed |
| FR-10/11/13, BR-07..10; CFG-01/03 | Legacy Routes/RouteStops aggregate hash remains for catalog rows; v1.3 adds immutable `RouteRevisions`, exact map/checksum and POI revision/source-PASS stop links, submission receipts, append-only run evidence and configuration fingerprint | **Implemented:** fixed-route draft/revise/submit, Staff/TechnicalStaff current-revision catalog, Technical-only manual PASS/FAIL, explicit active single-role Staff test participant, origin-aware free-cell validation, latest cross-map deployment lock/check, history and audit. Current navigation fingerprint includes map/checksum, poses, ordered POI navigation fingerprints, camera preset and head-step configuration, excluding dwell. Historical hashes remain unchanged; compatibility uses immutable snapshots. Duration stays incomplete and reports recalculated dwell subtotal. Scheduling/READY and physical-test execution remain unimplemented | W2 + manual physical evidence; Database First v1.3 patch | API/unit and disposable SQL regression; AC-06 remains target, no physical result claimed |
| FR-12/14/16; TOUR-01..08 | Staff-authorized legacy Tour CRUD only; selects `AuthoringMode=LEGACY`, stores no exact RouteRevision or assigned Operator; no reservation, READY snapshot, reopen or target cancellation workflow | **Blocked, fail-closed (ADR-0024):** do not create a versioned Tour or claim target lifecycle until exact-version duration, registration/email decisions and physical readiness sources are available. Existing aliases cannot select VERSIONED routes. No versioned Tour writer is exposed in this phase | W1/W2/W3/W4 plus approved duration and row/email evidence sources | AC-06/08 remain target; no SCHEDULED/READY acceptance pass claimed |
| FR-15, BR-06 | `Tours` has `ScheduledStartAt` but no robot reservation; versioned Route reports `INCOMPLETE_CONTENT_AUDIO_DATA`; manual test duration does not establish configured total duration | **Blocked, fail-closed (ADR-0024):** no new Tour scheduling or schedule/route changes through legacy aliases until a version-bound approved configured-duration source defines the interval. Never substitute `MeasuredDurationSeconds`; existing eligible legacy metadata edits/cancel remain separate | W2/W3 schema after duration-source decision; additive Database First patch | 15-minute boundary/overlap/concurrency/retry cases remain unimplemented; no NFR-REL-02 claim |
| FR-17/18/27; OPS-01/02 | No production Start/dispatch; robot current-tour column alone is not assignment logic | Start from READY, check scheduled time, atomic robot claim/state then send first leg; dedup and preflight | W1/W2/W3/W6 + transport decision | AC-01/10; NFR-REL-02 |
| FR-22, BR-03/04/05; REG-02/06/08 | New v1.4 row participation decisions; `RegistrationInputValidator` limits viewing-point rows to 10; cutoff and Representative/Tour uniqueness are enforced under Tour-first lock | **Implemented in Wave C:** new registrations/additional rows blocked inside 48h; one registration per Representative/Tour; duplicate/reserved emails remain transaction-serialized. No global seat capacity exists in SRS/schema, so no total-attendee capacity is invented. | Wave C Database First v1.4 + application transaction | Unit and opt-in SQL boundary/concurrency tests; AC-02/08 remain acceptance targets |
| FR-22/23, BR-11; REG-03 | v1.4 per-row PENDING/ACCEPTED/REJECTED/REMOVED state; stable IDs and access scoped to row | **Implemented in Wave C:** stable diff preserves unchanged IDs/status/access, new rows pending, removed rows only lose their own credential/session/reservation; Staff row review. Aggregate review endpoint rejects multi-row decisions. | Wave C | SQL API tests; unchanged accepted row access with another row pending/rejected |
| FR-23, BR-05/11; REG-09/06 | `RosterEmailChangeRequests` v1.4; legacy Admin direct correction endpoint still exists as a compatibility URL | **Implemented in Wave C:** Representative request + Staff review; pending/rejected preserves current email/access; accepted updates one row and rotates that row invitation/session in one Tour transaction; legacy direct Admin command returns `LEGACY_EMAIL_CORRECTION_DISABLED` | Wave C; email delivery adapter | SQL tests; no real external email send in tests |
| FR-24/39/40, BR-12; INV-01..04 | Resend/reissue/revoke and email worker pre-existed; current Staff/Representative routes exist | **Partially implemented in Wave C:** invitations can be issued only for active ACCEPTED rows, and unrelated aggregate registration state no longer gates access. Other ownership/support migrations outside the new row-specific endpoints remain backlog; media pipeline remains separate. | Wave C with W1/W5 | AC-02/08 target; only backend-supported actions claimed |
| FR-26/44, NFR-REL-03; INV-05/06 | Unique open session plus v1.4 device-token hash | **Implemented in Wave C:** same browser may reconnect within 2 minutes using tour-scoped device token; another browser cannot take over; no IP-only identity | Wave C | AC-09 target; SQL integration verifies browser binding and grace boundary |
| FR-45, NFR-SEC-05; ACC-04/INV-05 | Existing IP join limiter is not the target configurable invalid-code abuse policy | Server invalid-attempt budget/cooldown + administrative settings; default values TBD | W1/W4 + decision | AC-09 |
| FR-25/38, NFR-SEC-02 | Viewer session checks exist; no complete live/fallback relay authorization enforcement | Authorize initial+continued playback, credential/session/Tour revocation ≤10s including copied URL | W4/W5 + media adapter | AC-07 real-browser evidence |
| FR-28/29/30; CFG-04/CONT-01/02 | Versioned POI revisions now store required narration text and optional HTTPS fallback video; Route revision stops snapshot selected content. There is no full Staff versioned approval bank or approved audio-duration source. | Version/approve/withdraw content; externally produced audio and duration/dwell validation remain pending | W1/W2/W5 | AC-04/06; Part 1 covers content persistence only, not approval/audio acceptance; FR-29 has no separate listed AC |
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

## Wave C coupled registration implementation and remaining decisions

Wave C introduces row participation and email-request semantics through
Database First, stable-row diff, Staff row review, invitation issuance checks,
session binding and the existing student Q&A access guard. Tour-first locking,
rowversion guards and transaction rollback remain required. It does not deliver
media relay authorization or a versioned Tour/READY writer. The
`HasPendingDecisionsAsync` predicate reports active pending row/email decisions
for future readiness consumption; because Wave B has no versioned
scheduling/READY write API, this wave does not claim the predicate is wired to
a lifecycle transition.

No total seat-capacity rule is defined by SRS or represented in the current
Tour schema, so no global attendee capacity is invented. The two-working-day
Staff review target is tracked from submission/pending state; automatic
escalation or due-date calculation remains pending until an institutional
working-day/holiday calendar is defined. A review target is not an automatic
approval/rejection rule.

## Delivery waves

| Wave | Deliverable | Entry dependency / exit evidence |
|---|---|---|
| W1 Authorization and Staff assignment | Finish role/action matrix, Admin config/audit, explicit managed-tour/Operator assignment; migrate old Admin business ownership | This role foundation first; schema/API ADR for assignment; AC-08 for implemented actions; CreatedByUserId never substitutes |
| W2 Map/POI/route revisions | Immutable map/POI/route revisions, deployment and per-POI evidence, manual exact-tuple whole-route test record | W1; route slice in ADR-0023; project YAML/frame mapping pending; physical route-test evidence required; AC-06 |
| W3 Scheduling, reservation, READY | Staff schedule/reschedule, buffered longest-path reservation, no overlap, exact pass, no pending decisions, locked snapshot | W1/W2; integrate W4 pending-row predicate before declaring READY complete; reservation/concurrency tests + AC-06 |
| W4 Per-row registration/email/invitations/sessions | 10 rows, cutoff/holds, stable diff, row review, request/review email, credential preservation, reconnect and invalid-code limits | W1; coupled schema/writer/guards/transaction cluster; AC-02/08/09 and delivery retry cases |
| W5 Approved-bank Q&A, admission and media | Staff approval, deterministic answer outcomes, global 8/20 queue, continuous live/fallback authorization | W2/W4; provider terms pending for voice; AC-04/07/09, overload tests |
| W6 Operation, incident, End Early | Preflight/Start, command intent/dedup, movement guards, branches after cutoff decision, incident/recovery, FR-48 notifications/revoke, safe release | W1–W5 + command transport/physical integration decisions; AC-01/10/11; F-14 excluded until approved |

Wave C implements the backend row-registration slice as a separate branch and
database v1.4 snapshot/patch. SQL integration results remain explicitly
opt-in; `SKIPPED` is not SQL verification. Screens and diagrams have not been
updated or redrawn.

These are a dependency plan, not six implementation claims. Report 5 test-case
IDs and schema migration scripts must be created in the corresponding slice,
not invented in this register. Capacity 40 requires declared load evidence.

## Pending / unimplemented disclosure

**Route map gate (ADR-0033, owner decision 2026-10-30):** implemented on Route
save and submit with existing 409 codes and no schema change; a target rule
added after the SRS baseline. Physical behavior remains unverified.

**Open, no decision yet:** a POI PASS cannot be withdrawn. If a POI stops working
while its pose, camera and map are unchanged, Technical Staff cannot lower it
and a content-only revision does not re-enter the queue. Do not add a withdrawal
flow without an owner decision; route evidence depends on POI PASS being stable.

F-14, branch cutoff, YAML schema/frame conversion and command transport remain
blocked on decisions; no stub may make them appear enabled. Other open source
items: invalid-code defaults, speech provider/terms, research delivery/freshness
thresholds, pilot network/camera/safety evidence. Source SRS integrity wording
about unrecoverable tokens must be reconciled with NFR-SEC-01 recoverably protected
invitation resend before changing credential storage; this account slice does
not alter invitation cryptography.

The Map→POI follow-up adds read-only area/physical-robot lookups, full persisted
area selection and updates the Technical Staff upload/check and Staff POI web
screens. Technical Staff can register a physical identity by code and name;
runtime Robot permission is SELECT/INSERT only, while the existing one-shot
provisioner still updates only the credential hash. It changes no robot
transport or ai-assistant behavior. Scoped Google Docs text updates are
performed separately; diagrams stay pending and are not redrawn. TechnicalStaff
login and human-entered check records are not physical AC-01/06 evidence or full AC-08.
SQL tests create disposable databases only when
`SMARTCAMPUS_SCHEMA_TEST_CONNECTION` is supplied; SKIPPED is not DB verification.
