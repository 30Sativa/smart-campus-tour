# CampusTour DT-AMR — SRS v0.2 target

Updated 2026-10-27 from the live Report 3 SRS v0.2 aligned to Phiếu v1.9.
[Source ledger and gaps](srs-v02-backend-gap-register.md) records provenance.
[ADR-0020](../decisions/0020-srs-v02-business-baseline-and-technical-staff.md)
adopts the target and scopes succession. Prior wording is preserved in Git
at `e70fb52`; historical P0/P1/R1 criteria must not override current SRS IDs.
This is owner-authorized target behavior, not proof of advisor approval,
implementation or a physical acceptance pass.

## 1. Purpose and operating limits

Prospective high-school students join a remote campus tour through a school
Representative. Needs and benefits still require planned validation; no staffing,
cost or recruitment improvement is asserted. One physical AMR operates in one
surveyed indoor floor/area (the selected pilot area is NVH floor 6).
A physical tour requires an assigned Operator and a separate safety attendant.
The pilot has at least 3 POIs and 2 real navigation legs; prerecorded video is
labelled fallback and does not prove physical navigation or avatar acceptance.
Web is a five-role PWA. Vietnamese is the project language. No Viewer robot
driving, arbitrary map navigation, voting, admissions CRM or routine recording.

## 2. Roles and authorization (FR-01–05, BR-01/08/16/17)

| Actor | Target responsibilities |
|---|---|
| Admin | Accounts/authorized role assignment, system configuration, administrative audit |
| Technical Staff | Upload/version map packages; project-template POI import; physical POI verification and exact-version route test records |
| Staff | Content/Q&A/fallback approval; POI proposals; route composition; row/email-request review; invitation support; scheduling/READY; assigned tour operation; business statistics |
| Representative | Own registration/rows/invitations, review/delivery status, email-change and branch requests |
| Viewer | Own invitation session, authorized tour viewing and private Q&A; no account |

Tour Operator is Staff explicitly assigned to a Tour. CreatedByUserId is
attribution, not assignment. Safety attendant is a physical participant without
a separate account/workspace. Every endpoint must recheck role, ownership,
assignment, state and versions; UI visibility is insufficient.
Admin has no routine business/operation authority in the target. F-14 Admin
End Early is a narrow **pending** advisor-review exception, not active permission.

Current account mapping: ADMIN→Admin, STAFF→Staff,
TECHNICAL_STAFF→TechnicalStaff, SCHOOL_REPRESENTATIVE→Representative.
Exactly one supported role/account. Viewer and Operator are not account roles.
Only this Technical Staff account foundation is implemented in the present
slice; current business APIs still have the old ownership shown in the gap register.

## 3. Map, POI, route and content (FR-06–13, FR-28–30/49/50, BR-07–10)

Technical Staff creates maps outside the web, uploads immutable versions with
source/checksum/metadata, manually deploys the exact version to the robot and
records localization/display evidence. Upload is not robot deployment.
Technical Staff registers the physical robot identity by `RobotCode` and name
before selecting it for a map check. Registration creates an unassigned
identity only; credential issue/rotation/revocation is managed separately in
the Technical Staff web console under [ADR-0030](../decisions/0030-robot-credential-lifecycle.md),
while the map context is assigned to a valid uploaded map version in the Technical Staff web console under [ADR-0032](../decisions/0032-robot-map-context-assignment.md). Registration
is not connection, readiness, or check-pass evidence. The bridge and database
must use the same `RobotCode`.
The upload form chooses either a new area (key and name) or an existing area
from the full persisted catalog; the server allocates the next version. The
deployment-check form chooses a database robot whose persisted source type is
PHYSICAL; online telemetry is not the robot catalog.
Before a new deployment-check PASS, the current credential must have produced
one valid, accepted Fleet Sync report for the configured RobotCode/mapKey/frameId.
That report proves authenticated backend contact only; Technical Staff still
records localization and display by direct manual inspection. A FAIL remains
recordable before contact is confirmed. Provisioning a replacement credential
clears the connection confirmation, while backend restart or later offline
state does not clear it. This is an implementation rule added after the SRS
baseline, not a claim that sync proves map loading, localization, or safety.
After a map version has a successful exact-checksum localization and display
check recorded for at least one physical robot, Staff may click-propose POIs or
One physical robot has one robot record: this is an operating rule, because the
system cannot attest hardware (ADR-0039). Technical Staff may import robot pose-capture files (ADR-0038); both create POI
revisions bound to the map version, unverified unless the file carries a pose-capture
PASS under ADR-0038. A new map version does not inherit the
check. Later robot deployment elsewhere preserves the map version's historical
preparation eligibility, while POI verification still requires its robot's
latest deployment record to name that exact map version/checksum.
This project POI template is not the ROS navigation-map YAML. Its field schema
and frame/unit conversion remain pending template-owner validation.

Technical Staff physically verifies each POI, including one camera preset per
POI revision (FR-49). Staff composes route revisions from same-map POI revisions,
ordered stops, approved content, dwell and at most one permitted branch point.
Technical Staff with the assigned Operator tests the whole route and permitted
branches. A pass records exact map/POI/route/configuration, tester, Operator,
time, evidence, measured duration and result. Staff cannot technically confirm.

**POI result lifecycle.** Each immutable POI revision takes one technical result
and that result cannot be edited or withdrawn. A rejected revision leaves the
technical queue until Staff corrects and resubmits it. Content-only edits keep
an existing PASS. A changed pose, camera preset or map version needs a fresh
result, and a new map version inherits nothing. A later map check failure does
not change results already recorded. There is no flow to withdraw a PASS when
reality changes but the revision does not (open, see the gap register).

**Route authoring map gate (ADR-0033, owner decision 2026-10-30).** Staff may
save or submit a route revision only on a map version with current technical
evidence: at least one physical robot's latest check for that exact version
passes. This is stricter than POI evidence alone, so a map that lost its passing
check stops accepting route work even if its POIs passed, and only a new passing
check from Technical Staff or moving the route to another eligible map unblocks
it. A draft saved earlier stays readable but cannot be submitted meanwhile.
Revisions already submitted are not rewritten, and a route test run keeps its
own rule on the testing robot's latest deployment.

Scheduling and READY require the exact tested tuple. A movement-affecting new
revision never inherits a pass; a retained, unrevoked old tested tuple remains
eligible. READY/RUNNING references cannot be edited in place. Content-only
edits do not automatically invalidate navigation; duration/dwell are recomputed.

Staff approves narration text, uploads externally produced audio (and applicable
lip-sync assets), Q&A bank entries and fallback video. Before Start, approved
narration is delivered to the Quest guide and receipt checked (FR-50).
At POI arrival, apply the checked camera preset before the guide cue.
Manual Staff camera control is outside target. *Proposed revision (ADR-0045,
05/11/2026, pending owner acceptance): the assigned Operator of a RUNNING Tour
may turn the PAN/TILT head with buttons over Fleet Head v1; Viewers still may
not.* Command transport for these
future interactions remains pending; HTTPS telemetry sync is not a command path.

## 4. Scheduling and READY (FR-14–18/27, BR-06/07/16)

The server maintains SCHEDULED→READY→RUNNING→COMPLETED/CANCELLED, with allowed
pre-start reopen/reschedule/cancel. READY locks route/content/list and is
blocked by pending row or email-change decisions.
Reserve the one robot atomically for the whole fixed shift, which includes
15 minutes before and 15 minutes after the Tour (`docs/lich-tour-theo-ca.md`).
Overlaps are rejected; route/time changes rerun reservation and exact-version checks.
Assign a Staff Operator explicitly. READY is not physical safety proof.
Until an approved content/audio duration exists, the tested path duration is the
effective PASS run of the exact route revision (ADR-0034, interim), counted as the
whole run including dwell, plus any dwell the revision adds. A Tour starts only at
a fixed shift (`docs/lich-tour-theo-ca.md`), at least
72 hours ahead; registration still closes 48 hours
before the start (ADR-0035). Time, route
and robot changes on a created Tour mean cancelling and recreating it.
Start is requested while READY at/after published time, validates all guards,
claims the robot atomically, commits the permitted transition, then sends the
first leg. Deduplicate repeated Start/commands and record actor/time/reason.

## 5. Registration and per-row access (FR-22–26/39/44/45, BR-03–05/11–13)

One registration per Representative/Tour, maximum 10 viewing-point rows;
registration closes 48 hours before start. A shared-screen row identifies its
responsible person; students merely watching that screen are not individually
listed. Individual invitation is needed for a separate device/private Q&A.
New rows hold seats and await Staff review within 2 working days. Review,
participation, email delivery and session state are distinct.

Compare replacement lists by stable row identity/email per the SRS flow.
Unchanged rows retain IDs, accepted participation and current code/session.
Additions are pending; removals revoke only affected access and release seats.
An accepted row remains valid while unrelated new rows await review.
Do not let a whole-registration SUBMITTED/APPROVED gate invalidate old rows.
Changing only RepresentativeRegistrationPolicy cannot satisfy this rule:
writer, row approval, access guards and transaction must change together.

Representative requests email change for an accepted row; the request stores
old/proposed email, requester, state and review metadata. Old email/code remain
valid until Staff accepts. Rejection preserves them; acceptance rotates the
affected credential and closes the old session atomically. No direct approved
email overwrite by either Representative or a simple role-attribute swap.

Email contains an ordinary Tour URL and a private access code; URL alone grants
no access. Resend uses the same current code and approved email, keeping session.
Reissue changes credential and invalidates the old code/session; revoke disables
it. No automatic approval or expiry extension from delivery success/retry.
One active browser session per code, with same-device network reconnect within
2 minutes. Server throttles invalid codes; default threshold/cooldown remain
TBD and must be explicit. No extra Viewer account/OTP or identity/attendance claim.
Secrets/PII are excluded from URL/logs/AI; real data requires consent.

## 6. Q&A, media and Twin (FR-25/28–38/42/43/47, BR-18–20)

Viewer answers come only from the Staff-approved bank. Provider/Gemini assists
drafting for human approval, not free generation during Viewer runtime.
Distinguish approved match, fixed no-match, Busy, timeout and processing error.
An instance-wide atomic admission queue allows 8 executing and 20 total
executing+waiting; Busy only above 20. Per-session deduplication/rate limiting
is not that queue. Measure 95% ≤10s including queue wait at the defined ≤8
concurrent text-request load; count outcomes separately, including Busy/errors.

Authorize live/fallback at initial and continued playback against current
session/credential and Tour state. Revoke/reissue stops playback within 10s
including existing playback and copied URLs. During RUNNING fallback: mute live
audio, pause dwell, keep the actual-robot map, return to live at a waiting POI
and replay that POI guide. After End Early, live, fallback and Q&A are blocked;
only Ended/Result remains.

Twin shows server-received telemetry at target 5Hz, stale >2s, disconnected >5s,
with explicit source and data age. Commands require backend authorization,
assignment/state/version/safety guards and audit. ACK and measured completion
are distinct. Each robot has its own credential, separate from human accounts.
Current ADR-0019 HTTPS sync remains telemetry-only with empty commands.

## 7. Operations, safety and End Early (FR-19–21/46–48, BR-14–17/21)

Only the assigned Staff Operator operates a Tour. A movement command requires
telemetry ≤2s old, no open incident, no unresolved command, attendant present
and operator console connected. Denial sends no command. Incident order:
safety stop, labelled fallback, one state-appropriate recovery attempt,
End Early when unsafe/unrecoverable. No automatic resume after restart.

Before outside-team viewing: at 0.2m/s while driving/streaming, E-stop cuts motor
power with server off; stop ≥0.3m before a person-sized obstacle; attendant
reaches E-stop ≤2s. Heartbeat-loss local stop ≤3s. These require physical evidence,
not a backend test or fresh UI marker.

UC-OPS-07/FR-48/BR-21: End Early changes RUNNING→CANCELLED with actor/time/reason;
blocks live/fallback/Q&A for all sessions and copied URLs; preserves Ended/Result;
expires PENDING branch requests with Tour-ended reason; requests active mission
cancellation, blocks later movement commands, notifies accepted groups and audits.
CANCELLED/request/ACK is not proof of physical stop; inspection/safe release remain
separate and no automatic resume is allowed.

Branch uses verified options, server receipt order and at most one accepted
change. **Cutoff remains conflicting**: Phiếu says before Tour departure;
Report 1/historical flow says before leaving branch point. Do not settle or
implement either policy without the pending decision. Admin End Early F-14
also remains pending advisor review.

## 8. Research, capacity, privacy and acceptance

Mandatory benchmark: 1/5/10/20 synthetic robots at 5Hz; each load warms up 30s,
measures 5min and repeats ≥3 times; compare one-robot and minimal-relay baselines.
Measure generation-to-dashboard reception before rendering, p50/p95, distinct
sequence delivery and freshness (received within 2s/sent). Backend receipt is
intermediate. Record clock synchronization/offsets and hardware/software/network.
Evaluate p95 <1s separately at each load; do not promise N=20 or untested loads.
Delivery/freshness pass thresholds remain pending. Cross-check one physical AMR.

Two emulated Tours ×40 viewing points ×10 simultaneous questions tests isolation
and overload within the 8/20 limits; publish 40-point capacity only after passing.
Mandatory Q&A set ≥60 questions, ≥90% approved answers on answerable items,
≥90% fixed reply on unanswerable items, no unsafe answer.
Delete identifying data 30 days after Tour; minimize/pseudonymize operational
and research datasets; no student data to AI and no routine recording.

Acceptance targets AC-01..11 are defined by the SRS and linked in the gap register.
They are not test results. Voice-provider/data terms, YAML/frame mapping,
F-14, branch cutoff, invalid-code defaults, research delivery/freshness
thresholds and physical pilot evidence remain open. Navigation command
transport is selected by ADR-0042 and is implemented from M2.2.
