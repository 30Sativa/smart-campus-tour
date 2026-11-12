# SRS v0.2 backend source ledger and staged gaps

Read live on **2026-10-27**; owner authorizes SRS adoption and the scoped
Technical Staff map/POI implementation. Google Docs are updated separately
under revision guard. Wave C baseline is Wave B commit `572f5c3`; Route PR #90
commit `ce844c0` is its parent feature baseline.
This register distinguishes implemented API/schema from pending hardware,
frontend, route and broader authorization work.

**Status refresh, 2026-11-08.** Rows naming M2.2 endpoints describe the code on
`main`. Rows naming ADR-0048 or schema v1.18 describe the 08/11/2026 review
batch and hold once its pull requests are merged. The hand-off to the SRS author
is `docs/dong-bo-srs-2026-11-08.md`.

**Status refresh, 2026-11-11.** The rows on READY, reservation, Start, shifts,
robot dispatch, camera and the POI camera head now describe `main` after
ADR-0049 steps 3.1-3.3, ADR-0050, ADR-0052, ADR-0053, ADR-0054 and the
ADR-0045 addendum of 10/11/2026. The hand-off to the SRS author is
`docs/dong-bo-srs-2026-11-11.md`.

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
| FR-02/41; ACC-04/05 | Admin account endpoints exist; audit is readable through `GET /api/admin/system-audit-logs` and the Admin log screen; no settings workflow. Invalid-code limits and `Tours:MaxCapacity` are server configuration (ADR-0048) | **Not implemented:** bounded Admin settings contracts and screen (UC-ACC-04). Configuration values are not Admin-editable | W1, explicit configuration decision | AC-08; no invented separate acceptance for unlisted settings |
| FR-03/05, BR-08; POI-02/CFG-03 | AdminPoisController owns current POI API; no technical-confirmation endpoint/table | Technical-only mutation with role/state/tuple audit; Staff denied | W1+W2 | AC-06/08 |
| FR-04/05, BR-16; OPS/MON | `StaffToursController` is Staff-only; `Tours.OperatorUserId` is required on versioned Tours and NULL on legacy Tours; Start, Next, End Early, Retry leg and Reconcile refuse anyone but the assigned Operator | **Implemented for Tour operation.** ADR-0048 adds `POST /api/staff/manage/tours/{id}/operator` (SCHEDULED/READY before Start, READY stays READY, new account must be active Staff) and 409 `ACCOUNT_IN_USE` on Admin deactivation (SRS 7.3 decision 8). Other per-action migrations are tracked in their own rows | W1 schema/API design; ADR-0034, ADR-0043, ADR-0048 | SQL tests for Operator change and deactivation block; AC-08 and AC-01/10 remain acceptance targets |
| FR-06/07; MAP-01 | Current v1.1 Route.MapKey/map picker did not retain immutable package or deployment evidence | **Implemented in ADR-0021 slice:** validated ROS YAML+PGM ZIP, map version/checksum, manual exact-checksum robot localization/display record; no robot deploy endpoint | v1.2 additive schema; physical evidence still required | AC-06 API scope; AC-01 hardware proof not run |
| FR-08/09; CFG-02, POI-01/02 | Mutable legacy Pois plus Admin endpoints remain in place; separate immutable revisions now exist for the new Staff flow | **Implemented in ADR-0021 + ADR-0028:** Staff create/revise/submit is gated by latest exact-version/physical-robot map evidence; TechnicalStaff per-revision PASS/FAIL, evidence/history and free-cell/map-version checks. Project POI YAML import/frame conversion remains pending | W2 partial; project template decision pending | API/unit/schema tests; AC-06/08 target not claimed as physical pass |
| FR-09, post-registration connection confirmation | Robot registration creates a non-dispatchable PHYSICAL identity; credential provisioning and bridge setup are separate | **Implemented in ADR-0029:** first valid Fleet Sync for the current credential stores BE acceptance time/map/frame; new deployment-check PASS requires this durable confirmation, while FAIL is allowed. This confirms HTTPS contact only, not loaded map, localization or safety. Confirmation clears on credential rotation and survives BE restart/offline state. | Database First v1.5; controlled v1.4→v1.5 upgrade/regrant | API, SQL-permission, restart/rotation and FE regression tests; no physical robot acceptance claimed |
| FR-10/11/13, BR-07..10; CFG-01/03 | Legacy Routes/RouteStops aggregate hash remains for catalog rows; v1.3 adds immutable `RouteRevisions`, exact map/checksum and POI revision/source-PASS stop links, submission receipts, append-only run evidence and configuration fingerprint | **Implemented:** fixed-route draft/revise/submit, Staff/TechnicalStaff current-revision catalog, Technical-only manual PASS/FAIL, explicit active single-role Staff test participant, origin-aware free-cell validation, latest cross-map deployment lock/check, history and audit. Current navigation fingerprint includes map/checksum, poses, ordered POI navigation fingerprints, camera preset and head-step configuration, excluding dwell. Historical hashes remain unchanged; compatibility uses immutable snapshots. Duration stays incomplete and reports recalculated dwell subtotal. Scheduling/READY and physical-test execution remain unimplemented | W2 + manual physical evidence; Database First v1.3 patch | API/unit and disposable SQL regression; AC-06 remains target, no physical result claimed |
| FR-12/14/16; TOUR-01..08 | `POST /api/staff/manage/tours` creates a versioned Tour; `/ready`, `/reopen` and `/cancel` exist; legacy Tours keep their projection. `PUT` refuses a schedule or route change after registration with `TOUR_CONFIGURATION_LOCKED` | **Implemented (ADR-0034, ADR-0042):** a Tour is created SCHEDULED on an exact tested revision with an explicit Operator and robot reservation, and READY/Reopen run under the Tour lock with `HasPendingDecisionsAsync` as a blocker. ADR-0048 makes `capacity` required at creation and lets EXPIRED items clear that blocker. **ADR-0054 (accepted 11/11/2026):** READY also needs at least one active ACCEPTED row (`NO_ACCEPTED_ROWS`, reported only once no decision is pending), and Start rechecks it as `hasAcceptedRows`; a quick Tour has no exception. **ADR-0053 (accepted 09/11/2026), quick Tour:** created with no date or shift and a required `shortNoticeReason`; its `ScheduledStartAt` is the latest Start (creation + `Tours:ShortNoticeMinLeadMinutes`, 30 by default) and it skips the 72-hour lead time and the 48/24-hour marks. This is an owner decision beyond the SRS (see `docs/dong-bo-srs-2026-11-11.md`). **Not implemented:** rescheduling a Tour that has registrations (UC-TOUR-08) | W1/W2/W3/W4; ADR-0034, ADR-0042, ADR-0048 | API and SQL tests; AC-06/08 remain acceptance targets, no physical pass claimed |
| FR-15, BR-06 | `Tours` has `ScheduledStartAt` but no robot reservation; versioned Route reports `INCOMPLETE_CONTENT_AUDIO_DATA`; manual test duration does not establish configured total duration | **Interim (ADR-0034):** reservation = 15 minutes + the effective PASS run + 15 minutes, under a per-robot lock with overlap refused. Schedule and route changes stay blocked. An approved duration source replaces the measurement later. Do not reuse `MeasuredDurationSeconds`; existing eligible legacy metadata edits/cancel remain separate | W2/W3 schema after duration-source decision; additive Database First patch | 15-minute boundary/overlap/concurrency/retry cases remain unimplemented; no NFR-REL-02 claim | **Update, ADR-0034/0035 and `docs/lich-tour-theo-ca.md`:** new Tours start only at a fixed shift and hold the robot for the whole shift, at least 72 hours ahead; the effective PASS run measured with dwell, plus increased dwell, must fit the shift. **Update 2026-11-11:** five shifts are configured, S1-S3 plus S4 "Ca trưa" 11:00-12:00 (routes of at most 30 minutes) and S5 "Ca tối" 19:00-21:00, added 09/11/2026 (#245). Whether S5 suits school groups is open for the SRS author. A quick Tour (ADR-0053) holds the robot from creation to latest Start + expected run + 15 minutes, checked against every other hold and Admin block, with no shift.
| FR-17/18/27; OPS-01/02 | `POST /api/staff/manage/tours/{id}/start`, `/next`, `/retry-leg` and `GET .../start-checks` exist. `FleetCommands:Enabled` is off by default; `Robots.IsDispatchEnabled` is written only by `POST /api/technical/physical-robots/{id}/dispatch` (ADR-0049 step 3.3, #231), which needs a GATE A record as `evidenceRef` | **Implemented in code (ADR-0042/0043):** Operator-only Start from READY with preflight, robot claim and first GoTo, deduplicated by `requestId`. **Start window (ADR-0050, ADR-0053):** from `StartEarlyLimitMinutes` (10) before the published time, whether or not every accepted row is in the waiting room (`allViewersJoined` is information only since ADR-0057; `EARLY_START` on `TOUR_STARTED` records the count), until `StartLateLimitMinutes` (15) after it; startup refuses either limit above the 15-minute reservation buffer. A quick Tour's window opens at creation. **Not enabled:** no GATE A record exists, so no robot may have dispatch on. Unstarted Tours are auto-cancelled (ADR-0047) | W1/W2/W3/W6; M2.3 safety evidence | Fake-bridge API and SQL tests only; AC-01/10 and NFR-REL-02 not claimed |
| FR-22, BR-03/04/05/26, AC-14; REG-02/06/08 | New v1.4 row participation decisions; `RegistrationInputValidator` limits viewing-point rows to 10; cutoff and Representative/Tour uniqueness are enforced under Tour-first lock; schema v1.18 adds `Tours.Capacity` (1..40) | **Implemented in Wave C:** new registrations/additional rows blocked inside 48h; one registration per Representative/Tour; duplicate/reserved emails remain transaction-serialized. **Implemented by ADR-0048:** held seats are active PENDING + ACCEPTED rows, counted under the Tour lock on create, add-row and replace; 409 `TOUR_CAPACITY_EXCEEDED` with `remainingSeats`; Staff changes capacity before Start, never below held seats (409 `CAPACITY_BELOW_HELD`); `Tours:MaxCapacity` defaults to 20 and is raised to 40 only after NFR-CAP-01. The Representative list shows only SCHEDULED Tours before the 48h close. | Wave C Database First v1.4; v1.18 + application transaction | Unit and SQL boundary/concurrency tests, including two registrations racing for the last seat; AC-02/08/14 remain acceptance targets |
| FR-22/23, BR-11; REG-03 | v1.4 per-row PENDING/ACCEPTED/REJECTED/REMOVED state; stable IDs and access scoped to row | **Implemented in Wave C:** stable diff preserves unchanged IDs/status/access, new rows pending, removed rows only lose their own credential/session/reservation; Staff row review. Aggregate review endpoint rejects multi-row decisions. | Wave C | SQL API tests; unchanged accepted row access with another row pending/rejected |
| FR-23/40, BR-05/11; REG-09/06 | `RosterEmailChangeRequests` v1.4; legacy Admin direct correction endpoint still exists as a compatibility URL; schema v1.18 adds `EXPIRED` to both roster-row and email-change states | **Implemented in Wave C:** Representative request + Staff review; pending/rejected preserves current email/access; accepted updates one row and rotates that row invitation/session in one Tour transaction; legacy direct Admin command returns `LEGACY_EMAIL_CORRECTION_DISABLED`. **Implemented by ADR-0048:** at T-24h `RosterExpiryWorker` moves PENDING rows and PENDING email changes of SCHEDULED/READY Tours to EXPIRED, one transaction per Tour under the Tour lock; seats return, the old email and code stay valid, READY is no longer blocked; a new request from T-24h gets 409 `EMAIL_CHANGE_CUTOFF`; the Representative gets one count-only email per registration through the existing claim/send/record delivery. | Wave C; email delivery adapter; v1.18 | SQL tests: exactly at T-24h, one minute early, second run changes nothing, seats returned; no real external email send in tests |
| FR-24/39/40, BR-12; INV-01..04 | Resend/reissue/revoke and email worker pre-existed; current Staff/Representative routes exist | **Partially implemented in Wave C:** invitations can be issued only for active ACCEPTED rows, and unrelated aggregate registration state no longer gates access. Other ownership/support migrations outside the new row-specific endpoints remain backlog; media pipeline remains separate. | Wave C with W1/W5 | AC-02/08 target; only backend-supported actions claimed |
| FR-26/44, NFR-REL-03; INV-05/06 | Unique open session plus v1.4 device-token hash | **Implemented in Wave C:** same browser may reconnect within 2 minutes using tour-scoped device token; another browser cannot take over; no IP-only identity | Wave C | AC-09 target; SQL integration verifies browser binding and grace boundary |
| FR-45, NFR-SEC-05; ACC-04/INV-05 | `InvitationCodeGuard` counts wrong codes per (code, source IP) in memory; the 60 requests/minute/IP limiter stays in front | **Implemented by ADR-0048 (SRS 7.3 decision 10):** 5 wrong attempts in 10 minutes lock the pair for 15 minutes, 429 `INVITATION_CODE_LOCKED` with the time left; a correct code clears the counter; values come from `Invitations:CodeGuard:*`. **Limits:** one API instance, a restart forgets the counters, and a guesser who changes code on every try is slowed only by the outer limiter. **Not implemented:** Admin-editable settings (UC-ACC-04) | W1/W4; ADR-0048 | SQL test of the 15-minute lock after 5 wrong codes; AC-09 remains an acceptance target |
| FR-25/38, NFR-SEC-02 | Viewer session checks exist; no complete live/fallback relay authorization enforcement. ADR-0052 (#253) runs the Quest camera only while a Tour on that robot is RUNNING or a Staff lease is live, but reading `quest` on the public relay is still open to anyone with the URL while the camera runs | Authorize initial+continued playback, credential/session/Tour revocation ≤10s including copied URL | W4/W5 + media adapter | AC-07 real-browser evidence |
| FR-28/29/30; CFG-04/CONT-01/02 | Versioned POI revisions now store required narration text and optional HTTPS fallback video; Route revision stops snapshot selected content. There is no full Staff versioned approval bank or approved audio-duration source. | Version/approve/withdraw content; externally produced audio and duration/dwell validation remain pending | W1/W2/W5 | AC-04/06; Part 1 covers content persistence only, not approval/audio acceptance; FR-29 has no separate listed AC |
| FR-31/34, NFR-AI-01, BR-18; AI-01..03 | Runtime HttpAiAssistantClient invokes provider-backed assistant; no complete approved-answer matcher; voice pipeline absent | Approved-bank-only Viewer answers; provider drafting only; review transcript before submit | W5; voice-provider/data terms pending; ai-assistant integration separate authorized slice | AC-04; ≥60 question set, no-match vs error |
| FR-32/33, BR-19; AI-01 | **StudentQuestionGate is per-session**, 6/min + one in flight; not global admission | **Backlog:** instance-wide atomic 8 executing/20 total queue, Busy only >20; latency includes wait; outcome metrics | W5 | AC-04, NFR-PERF-04, overload/isolation NFR-CAP-01 |
| FR-35/37/43, NFR-SEC-04 | ADR-0019 Fleet Sync validates dedicated robot credentials and projects telemetry. Commands use the separate Fleet Commands v1 `poll` and `results` endpoints (ADR-0042), off by default; Fleet Sync stays telemetry-only | Retain telemetry contract; assess rotation/revocation lifecycle and target freshness separately. Command delivery is implemented; physical dispatch waits for M2.3 evidence | W6; M2.3 safety evidence | AC-09 partial robot auth; AC-01 Twin/command not passed by telemetry or fake-bridge tests |
| FR-36/46, NFR-SAFE-03; OPS/BRN | Start, Next and Retry leg check the assigned Operator, `RowVersion` and the movement checks in `TourStartPreflight` (ADR-0043); a refusal creates no command | **Implemented in code; not enabled on a physical robot** (M2.3). There is no incident table: NEEDS_ASSISTANCE stands in for an open incident | W1/W2/W3/W6; M2.3 safety evidence | Fake-bridge API and SQL tests only; AC-10 and physical AC-01 not claimed |
| FR-19, BR-14; BRN-01/02/03 | BranchRequest tables/indexes exist; no production branch workflow | Server order, one accepted change, verified branch; cutoff remains conflicting and unimplemented | W2/W6 + explicit cutoff decision | AC-01; cutoff cases blocked pending decision |
| FR-21/27/47, BR-15/16 | RUNNING Tours move to NEEDS_ASSISTANCE on a failed, rejected, expired or unknown command and on backend restart; Retry leg and Reconcile exist (ADR-0043). No incident table | **Partly implemented:** the assistance state and the two recoveries above, nothing resumes by itself. **Not implemented:** fixed incident order and fallback audio/dwell/map/POI return. Hold is deferred by ADR-0043 D12 | W5/W6 + physical gate | Fake-bridge API and SQL tests only; AC-01/10, NFR-SAFE-01/02 and NFR-REL-01 not claimed |
| FR-48, BR-21; OPS-07 | `POST /api/staff/manage/tours/{id}/end-early` is Operator-only: sets CANCELLED, withdraws or cancels the open command and keeps the robot held for inspection. Pre-Start cancel is separate | **Partly implemented (ADR-0043 D13/D14):** state and commands only. **Deferred by ADR-0043 D14:** all-session live/fallback/Q&A revoke and notifying accepted groups. A separate physical stop is still required | W4/W5/W6 + command transport | Fake-bridge API and SQL tests only; AC-11 not claimed; ACK never proves stop |
| FR-20, BR-17 | No F-14 runtime exception | **Pending: do not implement**; disconnected assigned Operator unable to return only after advisor review | Advisor decision | AC-08/11 pending branch only |
| FR-40/41/42, BR-20, NFR-PRIV-01 | Append-only audit and delivery worker exist; no complete 30-day cleanup/research artifact pipeline | Separate admin/business logs, idempotent jobs, minimize/delete data 30 days after Tour; consent gate | W4/W5/W6 + approved data process | AC-04/07 context; dedicated retention cases needed, no invented AC |
| FR-49/50; POI-02/OPS-01 | Each POI revision stores one camera head action in `CameraPreset` (`PoiCameraPresets`): FRONT, LEFT, RIGHT, NONE, SWEEP[:deg] or ANGLE:pan,tilt within the firmware limits, 422 `POI_CAMERA_PRESET_INVALID` otherwise; route revision stops copy it (ADR-0045 addendum 10/11/2026, #265, no schema change). In AUTO head mode the backend turns it into one Fleet Head command on arrival. No pre-start Quest asset receipt/cue | **Partly implemented:** one checked preset per POI revision. Fleet Head stays behind `FleetHead:Enabled = false` and ADR-0045 is still Proposed. **Not implemented:** approved asset delivery+receipt before Start, camera before guide cue | W2/W6; M2/guide integration decision; ADR-0045 owner acceptance | Unit and SQL tests of the preset rules; AC-01 physical guide flow not claimed |
| SRS §6.1 / Phiếu §3.3 / FR-42 | Telemetry slice/emulator scaffolds are not benchmark evidence | 1/5/10/20 at 5Hz, 30s+5min ×≥3; 2 baselines; dashboard-before-render timestamps, clocks and metrics; p95 <1s evaluated per load | Dataset/benchmark tools; delivery/freshness pass thresholds pending | AC-05; AC-03 isolation; no new research screen |

## Wave C coupled registration implementation and remaining decisions

Wave C introduces row participation and email-request semantics through
Database First, stable-row diff, Staff row review, invitation issuance checks,
session binding and the existing student Q&A access guard. Tour-first locking,
rowversion guards and transaction rollback remain required. It does not deliver
media relay authorization. The `HasPendingDecisionsAsync` predicate reports
active pending row/email decisions; READY and the Start preflight now consume it
(ADR-0042), and EXPIRED items do not count as pending (ADR-0048).

The seat limit (BR-26, AC-14) is `Tours.Capacity` from schema v1.18 and is
recorded in the FR-22 row above; ADR-0048 replaces the earlier note here that the
SRS and schema had none. The two-working-day
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

F-14, branch cutoff and YAML schema/frame conversion remain blocked on
decisions; no stub may make them appear enabled. Command transport is selected
by ADR-0042 and is implemented from M2.2. Other open source
items: speech provider/terms, research delivery/freshness
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
