# System Architecture

## SRS v0.2 adoption and implementation boundary (2026-10-27)

The owner adopts Report 3 SRS v0.2 aligned to Phiếu v1.9 through
[ADR-0020](decisions/0020-srs-v02-business-baseline-and-technical-staff.md).
The current target is in `docs/requirements/campus-tour-scope.md`; source evidence,
implementation gaps and waves are in `docs/requirements/srs-v02-backend-gap-register.md`.
TechnicalStaff accounts, the scoped versioned map/POI API, and Wave C's
per-row registration/email-change slice are implemented.
Staff owns versioned POI proposals and route revisions, per-row registration
review, and the existing pre-execution Tour operations. Admin business aliases,
the legacy POI catalog API, legacy Route authoring writes, aggregate registration
review, and direct Admin email correction have been removed from HTTP routing.
Read-only legacy Route projections remain for the Tour slice that cannot yet
consume RouteRevision. Admin account management remains available.
F-14, conflicting branch cutoff and project YAML/frame mapping remain pending.
M2 command transport is selected by [ADR-0042](decisions/0042-m2-command-transport-and-start-readiness.md)
and is implemented from M2.2; dispatch stays off until M2.3 safety evidence.
Repo ADR-0019 HTTPS Fleet Sync stays telemetry-only; no command endpoint is enabled yet.

## API ownership and retired compatibility routes (2026-10-28)

The accepted cutover is recorded in
[ADR-0027](decisions/0027-versioned-map-poi-and-route-api-cutover.md). `Staff`
is the application/JWT role for Tour Staff; `TechnicalStaff` has only the
map-upload, deployment-evidence and POI-verification policies. Admin keeps
account management. The old `/api/admin/{pois,routes,tours,registrations}`
aliases and direct Admin email correction are not routed. `GET
/api/staff/manage/routes` and its detail read remain a legacy projection used by
the existing Tour model; route creation/edit/activation is versioned under
`/api/staff/routes`. Staff registration review remains under its Staff path and
uses per-row actions. The legacy POI catalog endpoints and aggregate approve/
reject endpoints are removed. Existing SQL tables and rows are retained.

## Tour Management API (legacy pre-execution slice)

This is the pre-execution SQL slice in
`docs/decisions/0018-admin-tour-management.md`; Staff now owns the existing
pre-execution API. All endpoints require Staff, and CreatedByUserId is attribution
only. `/api/staff/manage/tours` is canonical; the former `/api/admin/tours`
compatibility alias was retired under ADR-0027. Route selection is restricted
to `AuthoringMode=LEGACY`.
Tour create stores the exact RouteRevisionId, assigned Operator and robot
reservation (ADR-0034); legacy Tours store none of them. No immutable READY
snapshot is stored: the Tour pins its exact revision. READY and Reopen are
implemented under ADR-0042 (conditions in §3.2) for versioned Tours; a legacy
Tour is refused READY. Start, Next, End Early, Retry leg and Reconcile are implemented
at Application and Staff API level (M2.2-b, M2.2-c);
the robot gets its commands through the Fleet Commands v1 endpoints (§3.6). No Finalize or
branch-request endpoint is implemented here.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/staff/manage/tours` | Each row carries its active `reservation`, or null, and a read-only `execution` summary (additive; the detail's `tour` carries it too): `operationalStatus`, `assistanceReason`, `currentStep`, `commandState` (the current leg's GoTo state, the command the detail's `execution.command` shows, or null) and `needsReconcile` (true while any GoTo of the Tour is UNKNOWN, also after End Early, until Reconcile or a late result closes it). Read in the same list query; it changes no Tour or command. Paged list: search name/description/Route name; state; `phase` (`UPCOMING` = SCHEDULED/READY with a future start, `RUNNING`, `FINISHED` = COMPLETED/ENDED/CANCELLED); from/to inclusive schedule instants; sort `name`, `-name`, `scheduledStartAt`, `-scheduledStartAt`, `createdAt`, `-createdAt` (default scheduledStartAt); page >= 1, size 1–100. Non-empty expand rejected. Since 2026-11-07 (additive): each row carries `operator` (`userId`, `fullName`, `username` of the assigned Operator, null for a legacy Tour; never CreatedByUserId); `operator=me` keeps the caller's own Tours (any other value is 400); `needsReconcile=true` keeps Tours with an UNKNOWN GoTo in any state; `readyBlockers=true` adds `readyBlockers` (the detail's `permissions.readyBlockers`, same advisory checks without locks) to SCHEDULED rows, other rows null, and is 400 above size 10. |
| GET | `/api/staff/manage/tours/{id}` | Tour summary plus base/active Route details using the existing Route contract, usage and permissions; no roster/contact/code data. `permissions` adds `canMarkReady`, `canReopen` and `readyBlockers` (`[{code, message}]`, Vietnamese message): the READY conditions evaluated now, without locks. `execution` gives state, operationalStatus, assistanceReason, currentStep, the current leg, the stop ids, dwellDeadlineAt (display only) and the leg's command. `allowedActions` (`start`, `next`, `endEarly`, `retryLeg`, `reconcile`) are `{allowed, reason, blockedBy}` for the caller, advisory until rechecked under locks. |
| GET | `/api/staff/manage/tours/slots` | `routeRevisionId`, `robotCode`, `from`, `to` (Vietnam dates, at most 31 days). Per day, one entry per configured shift (`Tours:Shifts`, `docs/lich-tour-theo-ca.md`): `shiftCode`, `shiftName`, `maxDurationSeconds`, `time` and `startsAt` (the Tour start), `available`, or `reasonCode` (`LEAD_TIME_TOO_SHORT`, `ROUTE_TEST_REMEASURE_REQUIRED`, `ROUTE_TOO_LONG_FOR_SHIFT`, `SHIFT_BLOCKED`, `RESERVATION_OVERLAP`) with Vietnamese `reason`, plus the reservation window (the whole shift) and registration close. The response adds `recommendedMaxSeconds`. Same calculation as create. |
| GET | `/api/staff/manage/tours/shifts` | Staff only. `from`, `to` (Vietnam dates, at most 31 days). `{days: [{date, shifts: [{code, name, startsAt, endsAt, tourStartsAt, time, maxDurationSeconds, block}]}], recommendedMaxSeconds}`; `startsAt`/`endsAt` is the robot hold, `block` is null or `{id, scope: DAY or SHIFT, reason}`. Draws the calendar before a route or robot is chosen. |
| GET | `/api/admin/schedule-blocks` | Admin only. Same `from`, `to` and response as `shifts`. |
| POST | `/api/admin/schedule-blocks` | Admin only. `{requestId, date, shiftCode, reason}`; null `shiftCode` closes the whole day; returns `{id, scope, reason}`. 400 for a date before today (Vietnam date), an unknown shift or a blank reason. 409 `SCHEDULE_BLOCK_EXISTS` for a duplicate block, or a whole-day block and a single-shift block on one day; 409 `SHIFT_HAS_TOURS` with `errors.blockers` naming each uncancelled Tour. Takes the same per-date lock as Tour create. Audited as `SCHEDULE_BLOCK_CREATED`. |
| POST | `/api/admin/schedule-blocks/{id}/remove` | Admin only. `{requestId}`; allowed for past dates too. 404 when missing, 409 `SCHEDULE_BLOCK_ALREADY_REMOVED`. Audited as `SCHEDULE_BLOCK_REMOVED`. |
| GET | `/api/admin/system-audit-logs` | Admin only. Paged audit entries, newest first, filtered by `action`, `actor`, `from`, `to`. Safe columns only, never `DataJson`. |
| GET | `/api/staff/notifications` | Staff only (Admin/TechnicalStaff 403). `size` 1-50 (default 30). The newest audit rows of Technical Staff outcomes Staff acts on, newest first: `POI_TECHNICAL_VERIFIED`, `POI_POSE_CAPTURE_VERIFIED`, `POI_TECHNICAL_REJECTED`, `ROUTE_TEST_PASSED`, `ROUTE_TEST_FAILED`, `MAP_DEPLOYMENT_CHECK_RECORDED` (`resultCode` PASS/FAIL) and `ROBOT_INSPECTION_RELEASED`. Each row is `{id, occurredAt, action, resultCode, targetId, subject, revisionNumber, robotCode, actorName}`; `targetId` is the POI proposal, Route, map version or robot to open, null with `subject` when the target is gone. A read projection of the audit log: no new table, never `DataJson`. Read state is the browser's (per account); there is no push event, the web polls. |
| GET | `/api/staff/manage/tours/operators` | Active single-role Staff accounts a new Tour can name as Operator (ADR-0034). |
| POST | `/api/staff/manage/tours` | `{requestId, configuration}` with `routeRevisionId`, `robotCode`, `operatorUserId`, schedule and metadata. The schedule must be exactly the Tour start of a configured shift (409 `TOUR_SLOT_NOT_ALLOWED`), at least 72 hours ahead (409 `TOUR_LEAD_TIME_TOO_SHORT`); a run without a measurement basis returns 409 `ROUTE_TEST_REMEASURE_REQUIRED`. Creates a SCHEDULED Tour on one exact tested revision and holds the robot for the whole shift (`docs/lich-tour-theo-ca.md`); 409 `ROUTE_TOO_LONG_FOR_SHIFT`, `SHIFT_BLOCKED`, `ROUTE_TEST_PASS_REQUIRED`, `ROBOT_RESERVATION_CONFLICT`, `OPERATOR_REQUIRED` or a map-evidence code otherwise (ADR-0034). |
| PUT | `/api/staff/manage/tours/{id}` | `{requestId, expectedRowVersion, expectedRouteVersion?, configuration}`; metadata-only eligible edits remain available; schedule or route changes return 409 `TOUR_DURATION_UNAVAILABLE`; cancel and recreate instead. Cancelling releases the reservation. |
| POST | `/api/staff/manage/tours/{id}/cancel` | `{requestId, expectedRowVersion, reason}`; cancel SCHEDULED/READY before Start, revoke invitation access and close sessions atomically. The commit also queues one notice for representatives of SUBMITTED/APPROVED registrations; the email worker sends it after commit and audits `TOUR_CANCEL_NOTICE_SENT`/`TOUR_CANCEL_NOTICE_FAILED`. Email outcome never changes the response, and a replay queues nothing. |
| POST | `/api/staff/manage/tours/{id}/ready` | `{requestId, expectedRowVersion}`; any Staff (Admin/TechnicalStaff/Representative 403). SCHEDULED → READY when every READY condition of §3.2 passes under the Tour lock, then the map preparation, robot deployment and robot reservation locks (Tour create order). Otherwise 409 `READY_PRECONDITION_FAILED` with `errors.blockers` listing every failing condition; `STALE_VERSION`, `IDEMPOTENCY_CONFLICT`. Commits a `TOUR_READY` TourEvent and receipt. No robot claim, `CurrentTourId`, Start or command. |
| POST | `/api/staff/manage/tours/{id}/reopen` | `{requestId, expectedRowVersion, reason}`; any Staff. READY without execution state → SCHEDULED, else 409 `TOUR_STATE_INVALID`; blank reason 400. Commits a `TOUR_REOPENED` TourEvent (actor, reason) and receipt; reservation, registrations and invitations unchanged. READY/Reopen events do not count as operational history. |
| GET | `/api/staff/manage/tours/{id}/start-checks` | Any Staff. `{checks: [{id, passed, source, detail}], canStart, blockedBy}`: the Start conditions of §3.2 evaluated now without locks (`source` DB, TELEMETRY, CONFIG, CONSOLE), with `callerIsOperator` and without the on-site confirmations. `canStart` = every returned check passed, so it is the caller's own answer (false for any Staff who is not the Operator); `blockedBy` lists root causes only. |
| POST | `/api/staff/manage/tours/{id}/start` | `{requestId, expectedRowVersion, confirmation: {robotPlaced, areaClear, attendantPresent, previewChecked}}`; only `Tours.OperatorUserId` (other Staff 403). Re-runs every Start check under the READY lock order. Any failing check: 409 `START_PRECONDITION_FAILED` with `errors.checks` and `errors.blockedBy`; all pass but `FleetCommands:Enabled = false`: 409 `COMMAND_TRANSPORT_DISABLED` with the checks and nothing written; `STALE_VERSION`. Enabled and all pass: one transaction claims the robot (409 `ROBOT_CLAIM_FAILED` if it just changed), moves READY to RUNNING, inserts the first GoTo as PENDING, writes `TOUR_STARTED`, `LEG_DISPATCH_REQUESTED` and the receipt. A repeat with the same `requestId` replays; the same id with other content is `IDEMPOTENCY_CONFLICT`. |
| POST | `/api/staff/manage/tours/{id}/next` | `{requestId, expectedRowVersion}`; only the Operator. RUNNING, NORMAL and OBSERVING, else 409 `TOUR_STATE_INVALID`; an open command is 409 `TOUR_COMMAND_OPEN`; a failed movement check is 409 `MOVE_PRECONDITION_FAILED` with `errors.checks` and `errors.blockedBy`. Closes the visit once, then a new GoTo to the next stop, or to the end pose (`EndMode = POSE`), or COMPLETED and robot release (`EndMode = LAST_POI`, no command, no movement check). `VISIT_CLOSED` event and receipt. |
| POST | `/api/staff/manage/tours/{id}/end-early` | `{requestId, expectedRowVersion, reason}`; only the Operator, while RUNNING (`TOUR_STATE_INVALID`). CANCELLED with `EndedAt`/`EndReason`, `Robots.NeedsInspection = 1`, `CurrentTourId` kept. A PENDING GoTo becomes EXPIRED (`WITHDRAWN`); a DELIVERED/ACCEPTED one gets a PENDING Cancel; an UNKNOWN one waits for Reconcile. The leg's real result is still recorded (arrival beats cancel). **Nothing in this flow is evidence that the robot stopped.** FR-48 revocation and notices are a follow-up. |
| POST | `/api/staff/manage/tours/{id}/retry-leg` | `{requestId, expectedRowVersion}`; only the Operator, while NEEDS_ASSISTANCE with the current GoTo FAILED (`NavigationFailed`) or REJECTED (`CommandRejected`), else 409 `TOUR_RETRY_NOT_ALLOWED`. Movement checks (with `executionIdle`, `mapContextMatches`), then a new GoTo with a new leg to the same target and `NORMAL`. |
| POST | `/api/staff/manage/tours/{id}/commands/{commandId}/reconcile` | `{requestId, reason}`; only the Operator, for an UNKNOWN GoTo of this Tour (else 409 `COMMAND_STATE_INVALID`). RECONCILED with `Resolved*`, `NeedsInspection = 1`; the Tour stays NEEDS_ASSISTANCE and only End Early remains. Works on an ended Tour too, because its UNKNOWN command blocks release. |
| POST | `/api/technical/physical-robots/{id}/release-inspection` | `{requestId, expectedRowVersion, reason}`; Technical Staff. The Tour holding the robot has ended (`ROBOT_TOUR_ACTIVE`), no open command (`ROBOT_COMMAND_OPEN`), robot held or needing inspection (`ROBOT_NOT_HELD`). Clears `CurrentTourId` and `NeedsInspection`, audit `ROBOT_INSPECTION_RELEASED`. |
| POST | `/api/technical/physical-robots/{id}/dispatch` | `{requestId, expectedRowVersion, enabled, reason, evidenceRef}`; Technical Staff (ADR-0049). Turning off always works, even from a stale page. Turning on needs `evidenceRef` (the GATE A record), an active robot (`ROBOT_DEACTIVATED`) with a key (`ROBOT_CREDENTIAL_REQUIRED`), an assigned map (`ROBOT_MAP_REQUIRED`), a passing latest deployment check on that map (`ROBOT_DEPLOYMENT_CHECK_REQUIRED`) and no pending inspection (`ROBOT_NEEDS_INSPECTION`); `STALE_VERSION`. Audit `ROBOT_DISPATCH_CHANGED`; same `requestId` replays, other content is `IDEMPOTENCY_CONFLICT`. Returns `{robotId, isDispatchEnabled}`. It does not stop a robot already moving. The physical-robot list, the Technical dashboard and the robot diagnostics read return `isDispatchEnabled`. |
| POST | `/api/staff/routes/{id}/deactivate` | Staff only. `{requestId, expectedRowVersion}`; `expectedRowVersion` is the route view's opaque `rowVersion`. Stops new Tours on a VERSIONED route (ADR-0037); returns `{routeId, isActive, scheduledTours}`. 409 `STALE_ROUTE` or `IDEMPOTENCY_CONFLICT`; 404 for a legacy or missing Route. |
| POST | `/api/staff/routes/{id}/activate` | Same body and result. Only lifts the stop; Tour create still requires an effective PASS. |
| GET | `/api/staff/routes/{id}/scheduled-tours` | Staff only. SCHEDULED/READY Tours on a VERSIONED route, shown before deactivating. |

`configuration` is `{name, description?, routeId, scheduledStartAt,
fallbackVideoUrl?}`. Name <=150, description <=1000, fallback URL <=1000 and
absolute HTTP(S) without embedded credentials. Schedule is a DateTimeOffset,
normalized to UTC, with millisecond precision. A new Tour names one tested Route
revision, and changing a Tour's schedule/route fails closed (ADR-0034). Changing
a legacy Tour's Route requires its current opaque version,
active Route, active POIs and valid data/map/pose/stops/head configuration.
Metadata corrections on an unchanged Route do not reactivate/reconfigure it.

List returns PagedResponse with Tour summaries: id, name, description, routeId,
routeName, activeRouteId, scheduledStartAt, state, createdByUserId, createdAt,
updatedAt, base64 SQL rowVersion, registrationCount and invitationCount. Detail
is BaseResponse data `{tour, route, activeRoute, fallbackVideoUrl, startedAt,
endedAt, endReason, usage, permissions}`. Permission fields are canEditMetadata,
canChangeScheduleAndRoute, canCancel and canDelete (always false). Responses
are advisory until rechecked under locks. Writes return BaseResponse `{id}`;
reload detail for the committed RowVersion. No DELETE endpoint is provided;
append-only audit and relationship history are preserved even for unused Tours.

Any registration (including terminal history), allowed branch, operational
history or runtime ownership blocks schedule/Route changes. Metadata still
needs SCHEDULED and no execution. Registered rescheduling requires the deferred
notification/coordination/expiry workflow, rather than silent schedule changes.
Route replacement before registration updates both route IDs and appends a
configuration-only `TOUR_ROUTE_CHANGED` event with RouteId = old Route, retaining
its ADR-0017 protection without claiming an arrival or sending robot commands.

Cancel retains registrations/approval history and all relationships. Pending
SUBMITTED registrations become CANCELLED with timestamps/audit; prior decisions
stay unchanged, keeping cancelled pending work out of the existing review queue. It stores
CANCELLED, EndedAt, EndReason; revokes invitations and uses existing invitation
session closure semantics. StartedAt stays null and no fallback entitlement is
created. Existing pending email claims recheck access and cannot grant new
rights; an already claimed external send may finish with a now-invalid code.
Cancellation notification email is not implemented in this slice.

Mutation requestIds are durable and scoped to (Staff, requestId) across these
Tour actions. A transaction-owned SQL application lock serializes a key; an
AuditLog receipt contains action, Tour ID and canonical payload SHA-256, never
raw descriptions, cancellation reason or invitation secrets. Committed matching
retries replay before current version/state/time checks; changed payload,
resource or action conflicts. Expected Tour RowVersion is excluded from the
payload hash, but Route version is included. No-op updates do not consume a
receipt or change the RowVersion. All other update/cancel attempts require
the current SQL RowVersion. Create has a server-generated Tour ID.

Tour transactions are read committed and acquire the same Tour UPDLOCK used
by registration, review, invitation and Student admission writers. Selected
Routes and POIs are held with update locks through commit via the existing
Route repository. Detail queries use the shared Tour read-lock snapshot and
do not save. Route/Tour/audit/access changes commit together through UnitOfWork;
SQL deadlock/key-lock conflicts return 409, and audit/storage failures roll back.
Errors use BaseResponse: 400 validation, 401/403 auth/role, 404 missing Tour/Route,
409 STALE_VERSION, STALE_ROUTE, IDEMPOTENCY_CONFLICT, TOUR_LOCKED,
TOUR_CONFIGURATION_LOCKED, ROUTE_VERSION_REQUIRED, ROUTE_UNAVAILABLE or
TOUR_CONCURRENT_CHANGE. Data-valid/active configuration is not physical
commissioning or readiness for robot operation.

## Versioned Route authoring and legacy Tour read boundary

The former Route catalog create/update/availability/delete operations under
`/api/staff/manage/routes` and its `/api/admin/routes` alias are retired. New
authoring uses `GET /api/routes`, `POST /api/staff/routes`, revision creation,
submission and Technical Staff manual test evidence described in
`backend/docs/route-revisions.md` and ADR-0023. Technical Staff picks the
participating Staff account from the read-only
`GET /api/technical/route-verifications/participants`. Route stops carry exact
`PoiRevisionId` and the corresponding effective verification evidence; they do
not pass legacy `PoiId` values. Each stop view (route revision reads and the Tour detail's
`routeRevision.stops[]`) also returns its own `id`, the `RouteRevisionStops.Id` that Tour
`execution.currentRevisionStopId` and `lastArrivedRevisionStopId` name (additive). Saving or submitting a revision requires the
exact map version to have current technical evidence, otherwise 409
`TECHNICAL_CHECK_PENDING` or `TECHNICAL_CHECK_NOT_PASSED` (ADR-0033). The two remaining Staff Route GET operations
serve existing Tour records only. Versioned Route to Tour selection,
creates and reserves under ADR-0034; READY/Reopen follow ADR-0042 (§3.2); these APIs do
not imply a schedulable Tour or hardware acceptance.

How the pieces of CampusTour DT-AMR fit together. This file covers what
crosses a folder boundary. Anything internal to one folder is documented
inside that folder.

- Robot internals: [`robot/README.md`](../robot/README.md)
- Digital Twin research tooling: [`digital-twin/README.md`](../digital-twin/README.md)
- Backend internals: [`backend/AGENTS.md`](../backend/AGENTS.md)
- AI tour-guide internals: [`ai-assistant/README.md`](../ai-assistant/README.md)
- Frontend internals: [`web/AGENTS.md`](../web/AGENTS.md)
- Business requirements: [`requirements/README.md`](requirements/README.md)

This is the cross-system technical source. For business actors, scope, and
acceptance rules, follow the status in `docs/requirements/campus-tour-scope.md`;
the UI flow does not override that scope. Public technical contracts and
implementation status remain governed here and by the relevant ADR.

The backend persistence baseline has advanced through v1.14; the current snapshot
includes row-registration/email-request schema in
`backend/database/smart-campus-tour-schema-v1.4.sql` and first accepted robot
connection context in `backend/database/smart-campus-tour-schema-v1.5.sql`,
plus credential lifecycle in `backend/database/smart-campus-tour-schema-v1.6.sql`
and versioned POI narration content/route-stop snapshots in
`backend/database/smart-campus-tour-schema-v1.7.sql`, with database-owned physical robot map assignments in
`backend/database/smart-campus-tour-schema-v1.8.sql`, Tours on a tested revision in
`backend/database/smart-campus-tour-schema-v1.9.sql`, scheduling inputs in
`backend/database/smart-campus-tour-schema-v1.10.sql`, POI pose-capture import in
`backend/database/smart-campus-tour-schema-v1.11.sql`, and robot area and deactivation columns in
`backend/database/smart-campus-tour-schema-v1.13.sql`, and robot commands with versioned Tour stops in
`backend/database/smart-campus-tour-schema-v1.14.sql` (ADR-0042, ADR-0043).
See [ADR-0026](decisions/0026-row-level-registration-and-email-change.md),
[ADR-0029](decisions/0029-robot-connection-confirmation-before-map-pass.md),
[ADR-0030](decisions/0030-robot-credential-lifecycle.md), and
[ADR-0031](decisions/0031-versioned-poi-narration-content.md). The
developer's local `SmartCampusTourV11` remains an older database and is not
altered by this branch. [ADR-0006](decisions/0006-demo-first-tour-schema.md)
records the superseded v1.0 baseline. This document also
records decided **planned** boundaries; a diagram or flow below does not imply
that its API, dispatch, bridge, or realtime implementation already exists.

The group-selected business decisions are recorded in
[ADR-0009](decisions/0009-review-1-tour-business-scope.md); see the detailed
scope for their status and user-facing rules. Those decisions do not change the
public fleet contracts here or the research requirements.

[ADR-0010](decisions/0010-personal-access-code-entry.md) supersedes the earlier
secret-link entry choice. Planned browser entry is: approved Excel row -> email
with ordinary Tour page URL and personal access code -> code validation -> one
active browser session per invitation. A valid existing session avoids repeated
code entry; the URL alone grants no access. Resending sends the same valid code
without terminating the session; revoke/reissue invalidates the old code and
session and sends a new code to the approved email, retaining invitation identity
and expiry. The SRS target limits Representative support to owned rows and permits Staff
support for managed tours. Email changes use Representative request + Staff review;
unchanged accepted rows keep credentials while new rows await review. Wave C
implements the row-specific registration and email-request APIs; legacy direct
Admin email correction is disabled. Media-relay authorization and broader
Staff/Representative support migration remain separate gaps.

[ADR-0011](decisions/0011-student-data-use-for-tour.md) limits student data to
registration, invitations and aggregate Tour operational statistics. V1 excludes
post-Tour admissions contact, CRM and per-person consent workflows. Invitation
records remain operational data; aggregate counts must not be presented as
attendance, individual interest or the number of people in a shared viewing room.
Retention configuration for real deployments remains an operational requirement;
this decision does not define a new endpoint or schema.

---

## 1. Components and ownership

```text
   Student browser                 Campus staff browser
      |                                 |
      v                                 v
   +----------------------+   +--------------------------+
   | web/ student + staff |   | web/ Staff Operations   |
   | browser experiences |   | and operational Twin    |
   +----------+-----------+   +------------+-------------+
              ^                            ^
              | livestream media path      | backend projections
              +------------------+---------+
                                 |
                                 v
                     +-------------------------+
                     | backend / tour services |
                     +-----------+-------------+
                                 ^
                                 | fleet/navigation state
                                 |
                     +-----------+-------------+   +----------------------+
                     | Physical AMR             |   | Fleet Emulator      |
                     | ROS 2 + fleet_bridge    |   | digital-twin/ (WP4) |
                     +-------------------------+   +----------------------+

Student browser -> Backend / cloud AI -> private STT / LLM / TTS Q&A
Approved, pre-generated narration assets -> browser playback
```

This is a conceptual boundary only; livestream and browser/cloud AI transport
details remain for their integration work. Students join remotely in the
browser. A School Representative registers the group and uploads its roster;
student self-booking is not part of the current product baseline.

The backend schema currently models `Route`, `RouteStop`, `Poi`, `Tour`,
`GroupRegistration`, `RosterRow`, `Robot`, and `TourEvent`, alongside user,
token, and audit data. Backend ownership of POI targets, tour progression,
and robot assignment is a decided boundary; the dispatch use cases are not
implemented yet. A robot is intended to execute one navigation leg at a time
without owning the tour workflow. The web app owns the 3D Operational Digital
Twin UI, while `digital-twin/` owns the Fleet Emulator scaffold and future
load experiments, not the 3D frontend. M0/B1 robot telemetry uses HTTPS
report-and-reconcile under [ADR-0019](decisions/0019-https-fleet-sync.md).
SignalR remains the Staff-facing operations projection and the development
SimulationPreview transport. Per-leg commands remain M2 work.

---

## 2. Robot subsystem

Sensor hierarchy is settled by
[ADR-0001](decisions/0001-lidar-primary-astra-supplementary.md):

```text
RPLiDAR A3M1        -> /scan                 -> local + global costmap, AMCL, SLAM
STM32 STEP counts   -> /wheel/odom -\
BNO085 orientation  -> /imu/data   -> EKF -> /odom + odom -> base_footprint TF
Astra Pro (depth)   -> /camera/depth/points  -> LOCAL costmap ONLY
4x SR04T sonar      -> /ultrasonic/sonarN/range -> LOCAL costmap ONLY
Astra Pro (RGB)     -> person detection      -> Nav2 speed limit
                       (`robot_perception`, not the AI tour guide)
```

Wheel odometry is derived from the STEP pulses the STM32 generated, not from
encoder feedback: the HBS57H closes its encoder loop internally and ROS never
reads encoder position. The EKF fuses `vx`, the nonholonomic `vy = 0`
constraint and wheel-derived `vyaw` from `wheel/odom`, plus BNO085 **orientation
yaw** from `imu/data`. Firmware publishes no raw gyro rate, so nothing in this
stack fuses gyro yaw-rate.

IMU availability is reported, not hidden: `stm32_bridge` publishes
`/diagnostics` (`DiagnosticArray`, status `<node>: imu`, OK/WARN) and warns when
the STM32 feedback carries `yaw_valid=0` for longer than `imu_stale_timeout`;
the EKF then runs on wheel odometry only. The firmware re-requests the BNO085
report on its own and counts it in feedback fields 17-18
(`robot/docs/PROTOCOL_FB.md`).

### 2.0 Navigation baseline

Planner `nav2_smac_planner/SmacPlanner2D`, controller
`RegulatedPurePursuitController`, autonomous reverse disabled in
both the controller and the behaviour tree -
[ADR-0007](decisions/0007-smac2d-rpp-no-autonomous-reverse.md).

ADR-0007 records the original 0.20 m/s baseline. The current supervised speed
trial sets RPP/smoother forward to 0.24 m/s and RPP heading/Spin/smoother
rotation to 0.45 rad/s. Acceleration, braking, wheel caps and safety mechanisms
are unchanged; combined forward/turn commands can still be wheel-pair scaled.
On the robot 0.24 m/s made the bridge scale 39–50 % of the wheel pairs, so the
real-robot baseline runs 0.20 m/s (Nav2 V2,
[robot/docs/robot-baseline-2026-11-02.md](../robot/docs/robot-baseline-2026-11-02.md));
`nav2_params.yaml` keeps the trial values as the simulation/auto-explore default.

RPP does path tracking plus collision checking against the local costmap. It is
not a local trajectory planner and does not search for detours. So: an obstacle
the LiDAR sees reaches the global costmap and the planner can route around it;
an obstacle only the depth camera or sonar sees reaches the local costmap only,
and the baseline requirement is that the robot **detects it and stops safely** -
an automatic detour is not guaranteed and is not claimed.

The four SR04T sonars are mounted diagonally at the chassis corners with poses
that are schematic rather than measured. They are not 360-degree coverage, they
do not constitute rear safety coverage, and `RangeSensorLayer.no_readings_timeout`
is a single shared timer rather than a per-sensor health watchdog.

`mode_manager` provides manual override, E-stop and command timeouts. It is
**not** an independent collision monitor; `nav2_collision_monitor` is a later
phase. Early runs are supervised, in a controlled area, at low speed.

### Person perception contract (MVP)

`robot_perception` pairs RGB and depth cloud observations by header timestamp
(ApproximateTimeSynchronizer, 50 ms maximum delta), projects the cloud into the
raw RGB image with validated CameraInfo K/D, and uses the latest available TF
for rigid camera/robot extrinsics. `people` remains a `PoseArray` in
`base_frame`, stamped with the cloud observation time and without tracking
IDs. It is published only for a valid fused observation; an empty array means
the detector produced no person boxes in that observation and is not proof
that the area is safe.
Unknown/stale/error observations do not publish an empty `people` array.

The node publishes `person_perception/diagnostics` (`DiagnosticArray`) with
state/reason, source stamps, synchronization delta, observation age, inference
latency and drop/error counters. Additional cumulative `rgb_received` and
`cloud_received` counters count Python input callback deliveries;
`pairs_accepted` counts pairs queued after timestamp/delta/order validation.
`fusion_p50_ms` and `fusion_p95_ms` summarize elapsed worker time around the
last 100 actual `_locate()` calls with nonempty boxes, including failed calls
and results later rejected as stale or replaced. Empty boxes and paths that
do not call `_locate()` add no samples; metrics are unknown before any sample.
Breakdown metrics use `{phase}_p50_ms` / `{phase}_p95_ms` for `cloud_decode`,
`transform` (TF lookups plus cloud transform/Z filter), `projection`
(projection plus in-image mask), and `roi` (the entire bbox fusion loop).
Each has an independent last-100-attempt window; a phase that raises is
included, unentered phases add nothing, and no samples means unknown.
Completed phases remain recorded if later processing fails or the result is
rejected/replaced. Empty boxes add no samples.
Normal RGB-D inputs use DDS KEEP_LAST(1) and are sampled before rclpy takes
messages at configured `rate_hz`; the synchronizer retains at most one
message per stream. Accepted pairs require increasing timestamps from both
streams. DDS overwrites and unmatched sync samples are excluded from
`dropped`, which counts pending/result mailbox replacements.
Bbox-only mode retains its ungated RGB subscription and publishes
`person_perception/debug_image` with the RGB source stamp and cannot enable
SpeedLimit. The optional `speed_limit` publisher is disabled by default. If
explicitly enabled after hardware gates, startup/UNKNOWN/stale use 50%, a
clear valid sequence can use 100%, and zero is never sent because Nav2 Humble
defines zero as NO_SPEED_LIMIT. The policy is a slowdown only; it does not
provide a protective stop or cover node/executor failure.

The STM32G431 owns real-time stepping. ROS 2 sends wheel-speed commands over
USB CDC serial and does not reach below that line.

The current `go_to_stop` ROS 2 action (`bus_manager` / `bus_interfaces`)
resolves a named stop through `bus_stops.yaml`. That is retained for local ROS
development and manual test fixtures. It is not the production source of truth
for POI coordinates or a production transport fallback. The selected production
mapping is directly to Nav2 `NavigateToPose`, as described in Section 3.5 and
[ADR-0008](decisions/0008-production-fleet-transport.md); it is not implemented
by this documentation change.

### 2.1 Robot identity and ROS namespace

The canonical robot ID format is `robot_NN`, starting with `robot_01`. The
same value is used by backend/twin identity, `BusStatus.bus_id`, and the ROS
namespace. Do not introduce parallel names such as `bus1`, `amr1`, or
`robot1` for the same vehicle.

Robot-owned ROS topics, actions, and services use relative names. With no
namespace they retain the original single-robot names such as `/cmd_vel`; with
`robot_id:=robot_01` the same interface resolves below `/robot_01`:

| Relative interface | Namespaced example |
|---|---|
| `cmd_vel`, `cmd_vel_manual`, `cmd_vel_nav` | `/robot_01/cmd_vel`, `/robot_01/cmd_vel_manual`, `/robot_01/cmd_vel_nav` |
| `wheel/odom`, `imu/data`, `odom`, `scan` | `/robot_01/wheel/odom`, `/robot_01/imu/data`, `/robot_01/odom`, `/robot_01/scan` |
| `robot_mode`, `robot_mode_state` | `/robot_01/robot_mode`, `/robot_01/robot_mode_state` |
| `emergency_stop`, `emergency_stop_state` | `/robot_01/emergency_stop`, `/robot_01/emergency_stop_state` |
| `go_to_stop`, `bus_status` | `/robot_01/go_to_stop`, `/robot_01/bus_status` |

The global campus frame remains `map`. Per-robot frames must use the canonical
ID as a prefix when multi-robot TF is implemented:

```text
map -> robot_01/odom -> robot_01/base_footprint -> robot_01/base_link
map -> robot_02/odom -> robot_02/base_footprint -> robot_02/base_link
```

The current milestone supports one namespaced real robot or one namespaced
Gazebo robot. Multi-entity Gazebo and prefixed TF frames are not a core fleet
validation requirement. Until both are implemented and hardware-tested, do
not run multiple robot stacks in one ROS domain: topic isolation alone is not
enough to prevent TF and Gazebo controller collisions.

This is deliberate and explicit in the launch files. Nav2's own
`navigation_launch.py` remaps `/tf -> tf` on every node, which under a pushed
namespace would give Nav2 a private `/robot_01/tf` while AMCL, the EKF and
`robot_state_publisher` keep broadcasting on the global `/tf`. The Nav2 group
therefore inserts identity remaps `/tf -> /tf` and `/tf_static -> /tf_static`
to shadow nav2's and keep one global TF tree. **ROS namespace-ready topics are
not multi-robot TF isolation.** Frame prefixing is a separate, cross-stack
change and is not implemented.

Two further namespace notes, both load-bearing:

- Nav2 nodes are placed in the robot namespace by `PushRosNamespace(robot_id)`
  in each launch file. `nav2_bringup/navigation_launch.py` on Humble uses its
  own `namespace` argument only for `RewrittenYaml(root_key=...)`, so without
  that push the servers start at the ROS root and match none of the rewritten
  parameters.
- Costmap sensor topics cannot be plain relative names: costmap plugins
  subscribe on the costmap node, whose namespace is `<robot_ns>/local_costmap`.
  They are written as `$(var robot_ns)/scan` in `nav2_params.yaml` and
  substituted at launch time.

### 2.2 R3 remote debug boundary (opt-in, hardware rollout in progress)

R3 keeps laptop DDS separate from robot DDS. The robot's read-only debug bridge
listens on `127.0.0.1:8765`; a separate initial-pose guard listens on
`127.0.0.1:8766`. A dedicated SSH connection forwards both ports. The laptop
adapter republishes only the documented downlink allowlist into a localhost-only
graph (default domain 42); TF remains global and frame IDs are unchanged.
Nav2 actions, services, parameters and velocity commands do not cross this
debug boundary. This does not change the production fleet contract.

Guard request protocol v2 requires `sent_at` (Unix seconds at the laptop send)
alongside the existing initial-pose JSON fields. Requests older than 2 seconds
or more than 0.5 seconds in the future are rejected, including after sampling
motion. This bounds delayed TCP delivery and requires reasonably synchronized
clocks; AMCL still receives a new robot-clock stamp. Concurrent requests are
rejected rather than queued; disconnected clients are checked before forward.
Deploy adapter and guard together: v1 requests without `sent_at` are rejected.
These checks supplement the existing idle-goal and stationary-window checks;
they do not authorize remote driving or prove localization readiness.

The old direct-DDS viewer remains the operator command's default during rollout.
S0b exercises the SSH data path with existing robot DDS settings; isolation is
only achieved after S1, S2 and S3. See
[`robot/docs/dds-isolation.md`](../robot/docs/dds-isolation.md) for the staged
runtime changes, rollback and hardware acceptance gates.

---

## 3. Backend-owned tour orchestration and fleet contract

### 3.0 User account authentication API (implemented)

The backend implements login and refresh-session endpoints for four persisted
account roles `ADMIN`, `STAFF`, `TECHNICAL_STAFF`, and `SCHOOL_REPRESENTATIVE`. Each account
must have exactly one supported role. An account with no role, more than one
role, or an unsupported role is denied with HTTP 403; a human who needs more
than one application role uses separate accounts. This is an application
authentication rule; the existing `(UserId, Role)` database primary key is
unchanged. [ADR-0013](decisions/0013-single-application-role-per-account.md)
records the single-role invariant; ADR-0020 extends only its supported-role set.
Viewer invitation access uses browser sessions, not an account role. Tour Operator
is assigned Staff; the safety attendant has no separate account/workspace.

| Persisted code | JSON role / JWT role claim | Meaning |
|---|---|---|
| ADMIN | Admin | Administrative account/configuration/audit |
| STAFF | Staff | Business preparation and assigned operation target |
| TECHNICAL_STAFF | TechnicalStaff | Technical Staff account foundation |
| SCHOOL_REPRESENTATIVE | Representative | Own registration and row support |

TechnicalStaff is the exact public value (display label: Technical Staff), with
one role claim and no inherited Admin/Staff/Representative policy. Its login does
not implement map/POI workspaces, technical confirmation or broader AC-08 coverage.
UserRoles.Role VARCHAR(32) has no role-value CHECK; no DDL/re-scaffold is needed.
Integration instructions and separate frontend tasks:
`backend/docs/technical-staff-accounts.md`.

| Endpoint | Request and success | Rejection behavior |
|---|---|---|
| `POST /api/auth/login` | JSON `{ "username": "...", "password": "..." }`; HTTP 200 with `accessToken`, `userId`, `username`, and `role`, and sets the refresh cookie. | Invalid username (empty, over 100 characters, or containing whitespace): 400. Unknown username or incorrect password: 401. Inactive account or invalid role assignment: 403. |
| `POST /api/auth/refresh` | No body; reads the refresh cookie. HTTP 200 returns the same response fields and re-sets the same refresh token with its stored expiry. Tokens are not rotated. | Missing, unknown, expired, or revoked refresh token: 401. Inactive account or invalid role assignment: 403. Rejected refresh clears the cookie. |
| `POST /api/auth/logout` | No body; HTTP 204 and clears the cookie. A matching stored token is marked revoked. Missing, unknown, or already revoked tokens are an idempotent no-op. | An unexpected persistence failure uses the common error response and still clears the cookie. |

Login and account creation require usernames to be non-empty, at most 100
characters, and contain no Unicode whitespace, including leading/trailing
spaces, tabs, and non-breaking spaces. Initial Admin provisioning also rejects
whitespace in its configured username. These entry points reject whitespace
rather than trimming it. Username lookup remains case-insensitive;
passwords are passed unchanged. Existing stored usernames are not migrated by
this change; a username containing whitespace cannot be used in a login request.

Account security hardening (2026-10-19): new account/bootstrap passwords require
12–128 characters and must not be blank; spaces are preserved. Login accepts
existing shorter passwords but rejects passwords over 128 characters. Login has
an IP budget of 30 attempts/minute and a normalized-account budget of 10/minute,
including successful attempts; exhausted budgets return 429 `RATE_LIMITED`.
The bounded account budget is in memory for the single-instance V1 deployment,
resets after its minute window and does not persist a permanent account lockout.

Login, refresh and logout reject an explicit Origin unless it matches the API
origin or an exact `Cors:AllowedOrigins` entry. `Origin: null` is rejected.
With no Origin, browser requests declaring `Sec-Fetch-Site: same-site` or
`cross-site` are rejected; non-browser probes without either header remain
supported. A rejected origin returns 403 before credential/cookie state changes
and does not clear the existing refresh cookie. The same origin policy applies
to Student cookie endpoints. CORS alone is not the CSRF control.

Account commands and refresh use a read-committed account transaction. Login
verifies the initial password snapshot, then locks/re-reads the User and roles
before issuing credentials; deactivate/reactivate and token reads use that same
User-first order through commit. Deactivate therefore revokes a winning login's
token or rejects a later issuance, without reviving revoked tokens on reactivate.
Username creation reserves its unique-index range. Refresh remains read-only
and has no UnitOfWork save. Missing-cookie refresh rejects without opening SQL,
preserving the hosting-only health probe. SQL deadlock/lock conflicts map to 409
`ACCOUNT_CONCURRENT_CHANGE`, without automatic mutation retries.

Application exceptions and automatic `[ApiController]` model-binding
validation errors use the same JSON envelope with `success: false`, a message,
null data, and optional errors. `AddProblemDetails()` remains registered for
framework support; these API error paths return `BaseResponse`, not a second
ProblemDetails shape. Conflict responses that use a feature code expose
`errors` as `{ code, fields }`; legacy generic conflicts keep `errors: null`
for existing clients. Login failures do not create a refresh token. Login
creates a cryptographically random refresh token and stores only its SHA-256
hash in `RefreshTokens`; it lives for 7 days. Refresh does not rotate or mutate
the stored token: it returns the same refresh token and stored expiry while
issuing a new access token. Logout revokes a matching stored token. The cookie
is named `campustour.refresh`, with `HttpOnly`, `Secure`, `SameSite=None`, and
`Path=/api/auth`. Access tokens are 15-minute HS256 JWTs with configured issuer
and audience (defaults `SmartCampus.Api` and `SmartCampus.Web`); their user
identity claims are `sub` (GUID) and `role` (`Admin`, `Staff`, `TechnicalStaff`, or
`Representative`), alongside registered issuer/audience/time claims. They
contain no username, full name, email, or other personal data.

Normal API startup requires `Authentication:Jwt:SigningKey` from environment,
User Secrets, or another external configuration source. It must contain at
least 32 UTF-8 bytes. The explicit initial-admin seed command exits before
starting HTTP and does not require the signing key. Isolated development
SimulationPreview also skips JWT middleware and persistence setup. Repository-
dependent Application handlers fail service validation before the host starts
in this mode, so it does not serve Auth or account API controllers; use normal
API mode for those endpoints. In Development, CORS allows the explicit
`http://localhost:5173` origin with credentials; production origins must be
configured explicitly, with no wildcard.

### 3.0.1 Admin account management (V1)

The following endpoints require the `Admin` role. Create accepts exactly one
application role string: `Staff`, `TechnicalStaff` or `Representative`
(case-insensitive input, canonical output). List/deactivate/reactivate support
TechnicalStaff through the existing flow; role reassignment is not an existing
endpoint and is not introduced here. Persisted codes are not create-request values.


| Endpoint | Request and success | Rejection behavior |
|---|---|---|
| `GET /api/admin/accounts` | Optional `search`, `sort`, `page`, and `size` query parameters; HTTP 200 with safe account summaries and pagination metadata. | Invalid page, size, sort, or non-empty `expand`: 400. Anonymous: 401. Non-Admin: 403. |
| `POST /api/admin/accounts` | JSON `{ "username": "...", "fullName": "...", "role": "Staff", "initialPassword": "..." }`; HTTP 200 with the created account summary. | Invalid input or unsupported role: 400. Anonymous: 401. Non-Admin: 403. Duplicate normalized username: 409. |
| `POST /api/admin/accounts/{id}/deactivate` | No body; HTTP 200 after a state change or idempotent no-op. | Anonymous: 401. Non-Admin or forbidden target: 403. Missing target: 404. |
| `POST /api/admin/accounts/{id}/reactivate` | No body; HTTP 200 after a state change or idempotent no-op. | Anonymous: 401. Non-Admin or forbidden target: 403. Missing target: 404. |
| `POST /api/admin/accounts/{id}/reset-password` | JSON `{ "newPassword": "...", "expectedRowVersion": "..." }` (ADR-0058); HTTP 200 with `data: null`. Revokes every refresh token of the account; audit `PASSWORD_RESET_BY_ADMIN` without password material. | Policy failure, malformed version or unknown field: 400. Anonymous: 401. Non-Admin or Admin target: 403. Missing target: 404. Version no longer current: 409 `STALE_VERSION`. |

For example: `GET /api/admin/accounts?page=1&size=20`. The response pagination
metadata calls this value `pageSize`.

Account listing searches only username and full name. It accepts one sort key:
`username`, `fullName`, `role`, `isActive`, `createdAt`, or `updatedAt`; prefix
the key with `-` for descending order. `page` defaults to 1; `size` defaults to
20 and is limited to 1–100. The default ordering is `createdAt` ascending, then
`id` ascending. Every explicit sort also uses `id` ascending as a tie-breaker;
role sorting uses the stored role code. A non-empty `expand` is rejected with
400. Fields/select, expansion, and OData are not supported.

Each valid account has exactly one supported role. If a stored role assignment
is missing, has multiple roles, or contains an unsupported role code, listing
still succeeds and returns `role: null` for that row. Lifecycle operations on
such a row fail closed with 403. Admin accounts are provisioned only through
`InitialAdminSeeder`; the API does not create or lifecycle-manage Admin
accounts. The initial password is entered by Admin and handed off outside the
system. Admin password reset (ADR-0058) also hands the new password off outside
the system; forced change at next sign-in (needs a new column), forgot-password,
and email provisioning are not provided.

Each list item also carries `rowVersion`, an opaque account version: base64 of
the 8-byte big-endian UTC ticks of the stored `UpdatedAt ?? CreatedAt`. `dbo.Users`
has no SQL rowversion column, so this token stands in for one; reset-password
checks it under the User row lock and stores a strictly newer `UpdatedAt`.

Deactivation blocks future login and refresh and revokes active refresh tokens.
Authenticated requests do not query account state: an already-issued access
JWT may remain usable until its natural expiry (about 15 minutes plus validation
clock skew). This is the accepted V1 limitation; no token version or blacklist
is used.

### 3.0.1a Account update, self-service profile and password change

All responses use the `BaseResponse` envelope. The account row has only
`Username` (login identity) and `FullName`, so these are the only fields in play.

- `PUT /api/admin/accounts/{id}` (Admin) body `{ "fullName" }`. Edits a managed
  (non-Admin) account's full name; audit `ACCOUNT_UPDATED`. Username and role are
  immutable after creation: roles gate role-owned data (registrations, assigned
  Tours), and the username is the login identity with no recovery channel to
  protect a change. Unknown body fields (for example `role`) return 400. Admin
  accounts return 403, which also prevents self-deactivation and Admin escalation.
  Deactivate/reactivate (above) already exist and are unchanged.
- `GET /api/account/me`, `PUT /api/account/me` body `{ "fullName" }` (any of the
  four account roles). No `{id}` exists: the subject is always the token's `sub`,
  so another account cannot be addressed. Inactive accounts get 403 even with an
  unexpired JWT. Audit `PROFILE_UPDATED`. Unknown fields (`role`, `isActive`,
  `username`) return 400.
- `POST /api/account/me/password` body `{ "currentPassword", "newPassword" }`.
  Verifies the current password with the existing hasher, applies
  `AccountPasswordPolicy` (12-128 characters, not blank) and rejects a new password
  equal to the current one (400 with a per-field error). Guesses share the login
  per-account budget (429). On success it stores a new hash, **revokes every
  refresh token of the account**, and audits `PASSWORD_CHANGED` (no password
  material is logged). Access tokens already issued remain valid until expiry
  (about 15 minutes), the same accepted limitation as deactivation; the web client
  signs out locally and sends the user to `/login`. Self-service forgot-password is
  still not provided; an Admin can reset a managed account (§3.0.1, ADR-0058).

`GET /api/admin/infrastructure/health` (Admin) is read-only and never fabricates
values: a metric the platform cannot provide is `null` (`host.memory` may be
null; `cpuPercent` is null until two `/proc/stat` samples exist), each section
fails independently, and `collectedAt` is the measurement time. `docker.status`
is `NOT_MONITORED` because the API container has no Docker socket by design.
`backup.status` is `HEALTHY`/`STALE` only from a well-formed marker written by
`backend/deploy/backup-sqlserver.sh` after `RESTORE VERIFYONLY` and SHA-256
checks; otherwise `UNKNOWN` (marker not visible to the API) or `INVALID`. The API
reads the marker only from `Monitoring:BackupStatePath`; the compose file does not
mount it, so enabling it needs a read-only, API-readable copy of that file.

### 3.0.2 Retired POI catalog API and retained legacy data

The legacy POI catalog API (/api/staff/manage/pois and /api/admin/pois) has
been removed from routing and OpenAPI under owner-authorized ADR-0027. New
Staff POI work uses the immutable map-version/proposal/revision workflow in
§3.0.3. The legacy POI rows and their SQL tables remain intact because
existing legacy Route/Tour records still reference them; HTTP API retirement
does not delete or migrate that data. The old Route authoring API must not
consume proposal IDs as legacy POI IDs.

### 3.0.3 Versioned map package and per-POI technical verification (ADR-0021, ADR-0028)

The additive v1.2 schema and new `/api/technical/map-versions` and
`/api/staff/poi-proposals` contracts implement map package versioning, manual
deployment evidence, Staff proposals/revisions/submission, and TechnicalStaff
per-revision checks. The complete endpoint/request/role/error/audit contract is
in [`backend/docs/map-poi-versioning.md`](../backend/docs/map-poi-versioning.md).
The new endpoints do not grant Admin access. Existing legacy POI rows are not
migrated or deleted; only their old HTTP catalog interface has been retired.

Under ADR-0051 (schema v1.20), Staff `POST /api/staff/poi-proposals/{id}/discard`
soft-discards a proposal that never had a PASS on any revision; it leaves the
Staff list and verification queue but no row is deleted. Proposal views add
`canDiscard` and `discardedAt`; later writes to it return 409
`POI_PROPOSAL_DISCARDED`.

Under ADR-0028, a valid uploaded package alone is not selectable for new POI
work. Map list/detail return backend-calculated `technicalCheckStatus`,
`canUseForPoiPreparation`, a block reason code/text, and the evidence record
(robot, time and check) used by that calculation. For each exact map-version /
physical-robot pair, the newest record is effective; a matching-checksum
localization+display pass on any one robot makes that exact version eligible.
A newer failure for the same pair supersedes the older pass, and a new map
version inherits no evidence. This gate is checked in the same transaction by
create proposal, create revision (including map changes), and submit. An
ineligible state returns 409 before proposal/revision/submission or success
audit writes. A transaction-owned per-map preparation lock serializes these
mutations with deployment-check inserts. A committed idempotent retry still
returns its committed result.
Eligibility remains historical to its map version when a robot later moves
elsewhere; POI verification retains ADR-0021's stricter latest cross-map
deployment check for the robot used to verify it. See
[`ADR-0028`](decisions/0028-map-technical-check-before-poi-preparation.md).
Map list/detail responses additionally expose read-only `currentlyDeployedOn`
entries for physical robots whose latest cross-map deployment check points to
that exact version with matching checksum and localization/display passing.
This is operational context only: absence does not change eligibility or
selection. The Staff POI picker warns when a PASSED version has no such robot.

The supported upload is a bounded ZIP of root ROS trinary YAML and referenced
8-bit PGM. Upload is not robot deployment; TechnicalStaff records exact package
checksum plus localization/display observations after manual robot work. POI
coordinates are ROS `map` frame meters/radians; current robot map examples have
zero origin yaw, and the API rejects non-zero yaw. Staff submits world poses;
the API validates map bounds/free occupancy. Technical verification records
reach/stop/localization/camera observations against that exact version and
physical robot. These operator-entered records do not prove backend-executed
hardware tests. POI verification does not test or certify a complete route.

TechnicalStaff map upload offers new-area and existing-area modes. The complete
read-only `/api/technical/map-areas` catalog reads `MapAreas` directly, so its
contents do not depend on the capped map-version list. Existing-area mode shows
and locks the stored key/name; a duplicate key in new-area mode directs the
operator to select the existing area. The server allocates each version inside
the existing transaction-owned area lock and returns the assigned version.
The physical-robot picker uses `/api/technical/physical-robots`, filtered only
by the existing `SourceType=PHYSICAL` condition. GET returns ID/code/display
name, persisted first accepted sync context, and a connection status derived
from the in-memory latest report and existing freshness threshold. It also
returns credential lifecycle status, safe hint/issue/revocation metadata and a
rowversion for credential changes, never the credential hash or plaintext.
TechnicalStaff
POST registers the same safe identity fields and appends actor/time audit in
the robot save transaction. Registration remains available offline and the
unique RobotCode constraint protects concurrent duplicates. The write command
revalidates the robot and exact checksum. A new deployment-check PASS additionally
requires a persisted first accepted Fleet Sync report for the current credential;
FAIL remains allowed before confirmation. The check locks the Robot row in its
transaction, so credential rotation cannot race through the gate. Replaying an
already committed check returns it before this new-PASS condition. Offline state
or backend restart does not erase confirmation; credential provisioning resets
it. Runtime SQL can SELECT/INSERT Robots and update only credential lifecycle
and confirmation columns plus the three map-assignment columns, never DELETE or update the whole table. Technical
Staff issues/rotates credentials through the web; Admin can revoke and inspect
credential audit, while Staff sees only connection status. The separate CLI
provisioner shares the lifecycle service, is attributed as `CLI`, and retains
column-scoped Robot and append-only AuditLogs grants. TechnicalStaff assigns a valid uploaded MapVersion to a physical robot; Fleet Sync projects MapKey and FrameId from that row. The bridge and database RobotCode must match. This connection confirmation does not prove the named map
was loaded, localization succeeded, or operation is safe; the manual check
remains a human observation. Report timestamp age/skew validation does not
prove fleet-wide NTP. The stored map/frame values are historical context. A
confirmation-write failure leaves accepted sync successful but keeps PASS
blocked until a later new report can persist confirmation. Upload and
deployment-check requests that expose requestId keep that ID stable for retries;
physical robot registration has no requestId or receipt and duplicate code is
409 via the unique constraint.

The TechnicalStaff robot list exposes the database-assigned MapKey/FrameId and the latest deployment-check map key/frame. It exposes no credential or other configuration values. The UI warns without blocking work when the assignment is absent or differs from the latest check. After reassignment, operators update the MiniPC bridge context and rerun the Fleet Sync probe; this is not a deployment or readiness gate.

When a current POI map version falls outside the normal version-list page, the
Staff screen fetches that exact version by ID for preview. If backend eligibility
has since failed, its map/pose/revision/history remains readable in a
non-editable pose view with the backend block reason. A 409 caused by a changed
technical check refreshes eligibility metadata without changing local form
values or the selected map.

TechnicalStaff imports robot pose-capture files through multipart
`POST /api/technical/poi-imports/preview` (no writes) and `POST /api/technical/poi-imports`
(`requestId`, `mapVersionId`, `robotCode`, `evidenceNote`, `files`; all-or-nothing, 409
`POI_IMPORT_INVALID` with per-file errors). Verification views add `verificationMethod` and
`sourceFileSha256`, their four observation fields are null for `POSE_CAPTURE`, revisions add the
effective `verificationMethod`, and proposals add `sourcePoiId`. Route save returns 409
`POI_NARRATION_REQUIRED` for a stop without narration. See ADR-0038.

Map and pose input limits (ADR-0040): `POST /api/technical/map-versions` returns 409
`MAP_PACKAGE_DUPLICATE` for a package already in that area. POI create and draft return 422
`POI_CAMERA_PRESET_INVALID` unless the preset is `FRONT`, `LEFT`, `RIGHT`, `NONE`, `SWEEP`, `SWEEP:<10..170>` or `ANGLE:<pan>,<tilt>` (pan −170..170, positive left; tilt −18..18, positive up; at most one decimal), any case, stored canonical
(ADR-0045 addendum 10/11/2026: the preset is what the VR camera head does at the POI). A newly
written POI or route pose returns 422 `POSE_CLEARANCE_INSUFFICIENT` unless every cell within
`Maps:PoiClearanceMeters` (default 0.30) is inside the map and free, and import preview reports it
per file. Both 422s carry the Vietnamese message in `message` and the code in `errors.code`.
`GET /api/maps/versions` and `/{id}` add `poiClearanceMeters`, `routeMinStops` and `routeMinStopSeparationMeters` (`docs/lich-tour-theo-ca.md`).

Robot integrity (ADR-0039): map assignment returns `affectedTours` and 409
`MAP_AREA_ALREADY_ASSIGNED`; TechnicalStaff `POST /api/technical/physical-robots/{id}/deactivate`
(`requestId`, `expectedRowVersion`, `reason`), `/activate` and `GET .../affected-tours?mapVersionId=`;
`GET /api/technical/physical-robots` hides deactivated robots unless `includeDeactivated=true` and adds
`deactivatedAt`, `deactivationReason`; it also returns `needsInspection`, `currentTourId`, `currentTourName` and
`currentTourState` (ADR-0043 D13) so the Technical robots page can offer release-inspection only for a
held robot. Staff `GET /api/staff/manage/tours/robots?routeRevisionId=` lists
robots with `usable` and `blockReason`; create and slots return 409 `ROBOT_NOT_READY_FOR_ROUTE`. Writers
refuse a deactivated robot with 409 `ROBOT_DEACTIVATED`.

Project POI YAML templates/frame mapping, route revision/test tuple, scheduling/READY,
robot deployment control, frontend workspaces and physical acceptance remain
pending/not implemented. v1.1 remains immutable; v1.2 has an additive upgrade
patch and empty-database snapshot. The runtime grants for these tables are
separate and least privilege in `backend/database/smart-campus-tour-map-poi-permissions.sql`.
Do not run the patch on a shared or production database as part of this feature.

### 3.1 Fleet contract

**M0/B1 telemetry implementation; command/runtime work remains pending:** the
backend does not speak ROS. [ADR-0005](decisions/0005-backend-authoritative-poi-per-leg-orchestration.md)
defines ownership; [ADR-0019](decisions/0019-https-fleet-sync.md) selects
**HTTPS report-and-reconcile** for robot telemetry. The S2/S2B SignalR harness
is historical compatibility evidence and does not block the HTTPS sync path.

```text
Physical fleet_bridge -- HTTPS POST /api/fleet/v1/sync --> Backend Application
Fleet Emulator -------- (future client) --------------->          |
                                                     operations projection
                                                              |
                                                      /hubs/operations
                                                              |
                                                      Staff Web / 3D Twin

Separate development path (already exists):
Gazebo -> gazebo_preview_bridge -> /api/simulation/pose
                               -> /hubs/simulation -> preview browser
```

| Boundary | Clients and purpose |
|---|---|
| `/api/fleet/v1/sync` | HTTPS robot-to-backend telemetry report and empty-command reconciliation response. |
| `/api/fleet/v1/diagnostics` | Authenticated robot hardware/ROS diagnostics report; separate from sync and does not carry commands. |
| `/api/admin/infrastructure/health` | Admin-only read of backend-host/runtime, database connectivity, Docker and backup-marker status. |
| `/api/technical/dashboard`, `/api/technical/robots/{robotCode}/diagnostics` | TechnicalStaff-only fleet overview and per-robot diagnostic view. |
| `/hubs/operations` | Staff-only SignalR projection, including latest fleet telemetry. |
| `/hubs/simulation` | Existing development-only SimulationPreview; unchanged. |

The robot sync API uses per-robot machine credentials. Staff use account JWTs
for the operations Hub; robot credentials cannot join it. The HTTPS endpoint
does not keep a robot socket open, and browsers never submit robot reports.

A previous temporary pose prototype (`POST /api/robots/telemetry`) was removed.
Fleet Sync v1 is a separate, versioned contract; it writes latest state only to
process memory and does not add a persistent pose table.

Application owns sync validation and the transient state-store boundary. The
Operations Hub and thin SignalR projection adapter belong in Api, without an
Infrastructure-to-Api reference. Application stays independent of SignalR and
ROS types. A future bridge translates telemetry and later commands; it owns no
booking, scheduling, assignment, or tour state machine.

The following GoTo/Cancel and result shapes are reserved for M2. They are not
Fleet Sync v1 DTOs or implemented endpoints. `?` denotes an
optional/nullable value. Fleet Sync v1 request/response binding and validation
are documented in [`docs/contracts/fleet-sync/v1/`](contracts/fleet-sync/v1/).

```text
GoTo { legId, mapKey, frameId, x, y, yaw, stopId? }
Cancel { legId }

ReportState {
  robotId, streamId, seq, reportedAt,
  mapKey, frameId,
  pose?: { x, y, yaw, capturedAt },
  status, legId?, localized?, faultCode?, batteryPercent?
}

ReportCommandResult {
  legId, commandKind, phase, outcome?, reason?
}
```

`GoTo` carries the resolved target, never a route to execute locally. `stopId`
is optional metadata, not a robot-local lookup key; no SQL `stop_id` column or
mapping to `Poi`/`RouteStop` is introduced. End/return legs need not have a stop.

The navigation MVP has no manual drive, raw `/cmd_vel`, cloud E-stop, or Head
command. Head support remains separate despite the existing frontend/schema
references; this MVP does not complete the full remote-tour feature set.

#### 3.1.2 Fleet Sync v1 (implemented telemetry slice)

The backend exposes `POST /api/fleet/v1/sync` over HTTPS. Each request uses a
per-robot bearer credential plus `X-Robot-Code`; the code is resolved from
`dbo.Robots` and JSON `robotId` must match that authenticated identity.
`Robot.CredentialHash` stores SHA-256 of a 32-byte random Base64URL secret and
is nullable: NULL means no active credential. Technical Staff can issue when
none is active, rotate an active key, and revoke; Admin can revoke and read
safe metadata/audit, while Staff has connection-status read access only. The
secret is returned once with no-store headers, never included in a GET or audit
data. Request IDs make mutations replay-safe: a duplicate returns 409 without
returning the secret. A unique filtered AuditLogs index backs that boundary.
The separate least-privilege CLI calls the same lifecycle service with a null
actor and `source=CLI`; each invocation issues or explicitly rotates the
existing PHYSICAL robot key. Issue, rotate and revoke reset the three
confirmation fields in the same conditional update and write an audit entry in
the same transaction. Rotation invalidates the previous key. Schema v1.6 adds
nullable hash and lifecycle metadata; old non-empty hashes remain active with
legacy/null metadata. No key expires, and no last-used DB write is performed.

Request fields, response/error examples and shared fixtures are in
[`docs/contracts/fleet-sync/v1/`](contracts/fleet-sync/v1/). Reports carry
`streamId`, browser-safe increasing `seq`, UTC `reportedAt`, configured
`mapKey`/`frameId`, nullable pose and its distinct `capturedAt`, execution
status, nullable localization, nullable motion readiness, and observed fault
or battery data. Payloads are validated against the configured robot context.
Exact duplicate reports are ACKed without refreshing liveness; sequence reuse
with different content, out-of-order reports, and retired streams are rejected.
A new bridge stream must begin at sequence 1 while another stream is current; a
non-retired stream with another starting sequence receives
`STREAM_START_REQUIRED`. The last 16 replaced stream IDs are rejected with
`STALE_STREAM` while they remain in this process's history. A bridge process
restart uses a new stream when its `reportedAt` is not older than current state.
If the API process restarts, its store and tombstones are empty: the bridge
preserves its current stream ID and sequence, and the API accepts any valid
positive sequence as the first observed report. This creates a fresh ordering
baseline and does not replay reports missed during the outage. A 400 validation
rejection happens before storage; after correcting the payload, the bridge may
retry the same stream and sequence. If a response is uncertain, it retries the
exact same report; a still-latest report is acknowledged as a duplicate, while
a report superseded by a later sequence receives `OUT_OF_ORDER`. Reports older
than the age window return 400 before duplicate detection. Bridge retry actions
are specified in the shared contract.
Once a stream ID falls outside the bounded last-16 history, a delayed process
using that ID can qualify for a new ownership change with sequence 1 and a
recent timestamp. Keep one bridge process per robot identity.

The backend keeps one latest report per robot and a bounded replaced-stream
history in a thread-safe in-memory store. Credential authentication reads
Robot data from SQL, but telemetry causes no SQL pose writes. The store clears
on backend restart, after which the next authenticated report at any valid
sequence rebuilds its ordering baseline. This is a single-instance B1 baseline,
not a durable or shared multi-instance cache. Initial configurable age/freshness
defaults are listed in the contract and backend runbook; operations must validate
them against the bridge and network. Accepted reports signal a coalescing
background broadcaster; HTTP success does not wait for a Staff client, and
failed/time-limited sends are retried.

Staff-only `/hubs/operations` emits `FleetUpdated` with a current snapshot on
connect, after accepted reports, and when sync/pose freshness crosses a
threshold. It refreshes age values at the configured interval; freshness flags
can lag by one interval. Hub connections close when the Staff-role JWT expires.
Account deactivation does not immediately revoke an already-issued JWT; it
remains valid until expiry under current API authentication. Its legacy
`connectionState: Live|Stale` describes recent HTTPS sync, not an open socket.
`TourUpdated` (no payload, since 2026-11-07) follows any committed command of the Tours feature, robot command reports included. It is a hint to re-read Tours, coalesced to at most one send per second and possibly lost; clients keep polling as the fallback and re-read after reconnecting. A `tourId`/revision payload remains planned.
`syncFresh`, `poseFresh`, execution status, `localized`, and `motionReady`
remain separate. Neither a new sync nor a pose sample implies localization or
motion readiness. No command is emitted by v1.

#### 3.1.3 Fleet and infrastructure diagnostics (implemented monitoring slice)

`POST /api/fleet/v1/diagnostics` accepts a report from the authenticated robot
identified by the Fleet Robot credential. The body carries `robotId`, UTC
`reportedAt`, and optional `miniPc`, `ros2`, and `sensors` snapshots. The
reported robot ID must match the authenticated identity; report age is limited
to two minutes in the past and 15 seconds in the future, with CPU and
temperature bounds validated. The latest report is held in process memory and
clears on restart. This endpoint reports observations only: it does not change
Fleet Sync v1, ROS ownership, map assignment, readiness, or command transport.
The robot-side sender is the `fleet_bridge` node (`diagnostics_enabled`, on by
default): every 10 s it reports Mini PC resources from `/proc` and `/sys`, sensor
topic arrival rates, the `stm32_bridge` IMU diagnostic and its own TF sample on
a separate HTTPS thread. Values it cannot measure are null; it reports no ROS
node list or Nav2 state (see `robot/ros2_ws/src/fleet_bridge/README.md`).

`GET /api/technical/dashboard` and
`GET /api/technical/robots/{robotCode}/diagnostics` require the
`TechnicalStaff` role. They combine persisted physical-robot/map/deployment
records with the latest in-memory Fleet Sync and diagnostics snapshots. Missing
or stale telemetry and diagnostics remain independently visible. The dashboard
includes action items and counts for robot connection state, inspection holds,
POI verification and route-test queues.

`GET /api/admin/infrastructure/health` requires the `Admin` role and reports
the API process host/runtime, a bounded database connectivity check, Docker
availability, and the last-backup marker. Docker container details are
currently a fixed two-container projection when the Docker socket is present;
they are not queried from the Docker API. Host metrics depend on the runtime
environment and may be unavailable on unsupported hosts. Backup health reads
`/var/lib/campustour/backup-last-success`; absence of that marker is
`NOT_RECORDED`, not proof that no backup exists.

#### 3.1.1 POI target invariant

Production target poses belong to backend-managed `Route` and `Poi` data.
`Route` stores its map key/frame and start pose, plus an end mode and optional
end pose. `Poi` stores its map key/frame, `X`, `Y`, `Yaw`, and narration data.
`RouteStop` links one `Route` to one `Poi` with `StopOrder`, `DwellSeconds`,
and `HeadStepsJson`. Coordinates must be interpreted in their stored
map/frame context; robot-local `bus_stops.yaml` is not the production source.

A navigation leg (called `TourLeg` in ADR-0005) is a **conceptual runtime
operation**, not a table or scaffolded entity. A future use case can derive
its target from the tour's route/stop and POI, or the route's end pose.
`Tour.CurrentLegId` and `TourEvent.LegId` identify execution attempts without
a leg foreign key. `TourEvent` can retain a target pose and map/frame snapshot
for history. This invariant does not introduce a MapVersion subsystem.

### 3.2 Current persistence model and planned tour flow

The current v1.1 SQL relationships include:

```text
Route --< RouteStop >-- Poi          Tour --> Route
Tour --< GroupRegistration --< RosterRow
RosterRow -- Invitation -- BrowserSession
Tour --< TourAllowedBranch           Tour --< BranchRequest
RouteVariant -- TourAllowedBranch    RouteVariant --< BranchRequest
Tour --< TourEvent                   User --< UserRole
User --< RefreshToken               User --< AuditLog
Tour -- AssignedRobotId --> Robot    Robot -- CurrentTourId --> Tour
```

`GroupRegistration.TourId` references a **Tour**, not a Route.
`RosterRow.RegistrationId` references its `GroupRegistration`; roster rows
represent invited students without individual user accounts. An invitation
references one roster row; browser sessions reference invitations. A
registration also references a representative `User` and optionally a reviewing
`User`. A branch request references a Tour, its selected TourAllowedBranch, its
branch-point RouteStop and optionally a registration.
`Tour.CreatedByUserId`, `TourEvent.ActorUserId`, and `AuditLog.ActorUserId`
link their records to users. The diagram omits other optional event links to
`Robot` and `Poi` for readability.

`Tour.State` stores the `SCHEDULED`, `READY`, `RUNNING`, `COMPLETED`, or
`CANCELLED` business state; `GroupRegistration.State` stores `SUBMITTED`,
`APPROVED`, `REJECTED`, or `CANCELLED` review state. These are string columns
whose allowed values are described by schema comments, not database `CHECK`
constraints or implemented state machines. `Tour` also stores
`OperationalStatus`, `CurrentStep`, leg/stop identifiers, hold/dwell
information, and a SQL `RowVersion` concurrency token.
The current schema has no visitor capacity or participant-count column and no
individual `Booking` table. It does not establish a capacity policy.

`Tour.AssignedRobotId` records the assigned robot, while
`Robot.CurrentTourId` records the tour currently holding that robot. Both are
nullable foreign keys, and `Tour.AssignedRobotId` may remain after a tour
ends. A UNIQUE filtered index on `Robot.CurrentTourId` enforces at most one
current robot holder for each Tour, and the single scalar field lets one Robot
hold at most one Tour. The database does not enforce agreement between these
two assignment fields, readiness, or safe release.
`Robot.NeedsInspection` and `IsDispatchEnabled` are persisted dispatch inputs.
Filtered unique indexes limit each Tour to one current robot holder, one
accepted branch request, and each invitation to one open browser session while
allowing multiple other request/session records. EF initially inferred
singular Tour-to-BranchRequest and Invitation-to-BrowserSession navigations
from the filtered indexes; both mappings are corrected to one-to-many.
Fleet Sync v1 keeps live pose, sync liveness, battery, localization, motion
readiness, and reported execution state as transient telemetry, separate from
persisted tour business state and `TourEvent`.

**Robot commands and versioned stops (schema v1.14).**
`dbo.RobotCommands` persists every navigation command under ADR-0042 §3–§4
and ADR-0043: `Id` is the wire `commandId`; `RobotId`, `TourId`, `LegId`,
`LegKind` (`TO_POI`/`TO_END`), `Kind` (`GoTo`/`Cancel`, the wire values) and the
target snapshot (`MapKey`, `FrameId`, `X`, `Y`, `Yaw`, `RouteRevisionStopId`) are
written once; `State`, `IsOpen`, `Outcome`, delivery/acceptance/completion times,
`ReasonCode` and the RECONCILED resolution change with the lifecycle. A Cancel
points at its GoTo through `TargetCommandId`. CHECKs keep `IsOpen` equal to "open
for this kind" (GoTo PENDING/DELIVERED/ACCEPTED/UNKNOWN, Cancel
PENDING/DELIVERED/ACCEPTED), `Outcome` equal to `State` only for
ARRIVED/FAILED/CANCELLED, delivery columns present exactly from DELIVERED on,
resolution columns only for RECONCILED, and a Cancel without target pose.
Filtered unique indexes allow one open GoTo per robot (UNKNOWN included), one
open Cancel per leg and one GoTo per leg (a retry is a new leg). The runtime
role may INSERT and SELECT commands and UPDATE only the lifecycle columns; it
never updates the target or deletes a command. It also gains column UPDATE on
`Robots.CurrentTourId`, `LastAssignedAt` and `NeedsInspection` for claim and
release. `Tours.CurrentRevisionStopId`/`LastArrivedRevisionStopId` reference
`RouteRevisionStops` for versioned Tours, and a CHECK keeps legacy Tours on the
`RouteStop` columns and versioned Tours off them (ADR-0043 D9). Start and Next
write these rows (M2.2-b); the robot reads them through Fleet Commands v1 (M2.2-d), and
Fleet Sync v1 still returns `commands: []`.

**Planned, not implemented:** an Application dispatch use case selects an
eligible robot for a ready `Tour`, sends one conceptual navigation leg through
the fleet gateway, handles arrival and the configured POI dwell/interaction,
then decides whether to send another leg or complete the tour. The selected
operational rules below are not backend implementations. Ignoring stale or
duplicate results, eligibility checks and reconciling release still need
application enforcement beyond the claim uniqueness indexes.

Fleet Sync and the Operations projection are not tour orchestration. The later
Application work owns:

```text
Tour/dispatch -> derive current leg -> persist execution intent/current leg
             -> external send -> reconcile result -> TourEvent / dwell
             -> decide next leg
```

The current `UnitOfWorkBehavior` commits after a handler returns. Sending an
external `GoTo` and assuming the subsequent commit is atomic with robot
execution is incorrect. Persist intent before sending, then reconcile ambiguous
results in the later orchestration design; no distributed transaction or
pipeline implementation change is introduced here.

Physical and emulated robots share external schema, command/reconnect semantics,
and identity model, without referencing backend implementation projects. Each
emulated robot has its own identity/connection. Keep `Robot.SourceType` and
eligibility checks so synthetic robots cannot be dispatched into real tours;
shared transport does not erase source or validation boundaries.

#### Remote Tour operational rules (planned Application behavior)

SRS v0.2/ADR-0020 governs target authorization, incidents and End Early. Only the
assigned Operator may operate. Movement requires telemetry age <=2s, no incident,
no unresolved command, console connection and an attendant. End Early revokes
live/fallback/Q&A including copied URLs, preserves Result, expires branch requests,
requests active mission cancellation, prevents later Tour motion, and notifies
accepted groups with audit (FR-48/BR-21/AC-11). No state or ACK proves physical stop.
Historical FRONT/head sequencing below is supporting M2 design, not selected
command transport; FR-49/50 require a checked POI camera preset and approved
narration delivery/receipt and guide cue. No new command transport is enabled here.

These rules make explicit the existing remote-tour intent in
`backend/database/smart-campus-tour-schema-v1.1.sql`,
`web/docs/staff-operations.md`, `web/src/api/contracts/staff.ts`, and
`web/src/features/staff/reason.ts`. The web mock illustrates the flow; it is not
an implemented persistence/concurrency guarantee. Backend evaluates allowed
actions and records operator actions, leg intent/results, visit closure, and
recovery as meaningful events.

Head/pan preset support is a V1 requirement. The specific sequencing
`Next -> confirmed FRONT -> next leg` (and FRONT before the first leg) is a
**current Remote Tour orchestration decision**, reflected in the schema/web
contract and mock. No independently verified business source establishes this
specific sequence as a Capstone requirement; do not attribute it to scope.
The decision remains the implementation baseline unless explicitly revised.

| Operation | Application behavior | Robot interaction |
|---|---|---|
| Start | Only from READY after device/business checks and on-site confirmations. Atomically claim an eligible physical robot and transition the tour, so concurrent Starts cannot share it. No automatic mid-tour reassignment. | Confirm head FRONT before the first GoTo; one current leg. |
| Hold | Only during observation at a POI; set `IsHeld` to prevent automatic departure when dwell ends. Reject it during a navigation leg. | No navigation command; this is not pause/resume of motion. |
| Next | Close the current visit exactly once, resolving races with dwell completion/Hold through persisted concurrency checks and `StopVisitClosedAt`. | Wait for confirmed FRONT, then send a new leg to the next POI/end point. |
| End Early | Record reason and tour CANCELLED; stop further progression. Set `Robot.NeedsInspection` and retain `Robot.CurrentTourId` until terminal execution is reconciled and on-site release is confirmed. | Cancel an active leg; send completion or `IDLE` alone does not release the robot. Not an E-stop. |
| System auto-cancel (implemented, ADR-0047) | `TourAutoCancelWorker` (Api, every 60 s) cancels a SCHEDULED/READY Tour with no operational trace once its robot hold has ended: the active reservation's `EndsAt`, never before `ScheduledStartAt + StartLateLimit` (15'), which alone applies without a reservation. One command and transaction per Tour, under the Tour root lock Start/Cancel take, then rechecked; it runs the shared Cancel core with actor NULL: `EndReason` "Không bắt đầu trong khung giờ, hệ thống tự huỷ.", receipt `TOUR_CANCELLED`/`SYSTEM_NO_START`, reservation released with `ReleasedByUserId` NULL (schema v1.17 `CK_TourRobotReservations_Release_Actor`), cancel notice queued unless the hold ended more than 24 h before the run (backlog: no email). RUNNING/COMPLETED/CANCELLED are never touched; reruns change nothing. No public API change. | None; no command is sent. |
| Retry leg | Require authorized recovery, live/readiness checks, and confirmed end of the old leg; unknown execution blocks retry. | Use a new `legId`; never blindly resume a previous goal. |
| Re-run POI / Retry FRONT | A new visit or head-command attempt; preserve history and gate subsequent progression on its result. | Head contract/controller work is required; not a new navigation command. |
| Backend restart | Reconcile active tours as needing assistance (`BackendRestarted`); do not restore a dwell timer or automatically continue navigation. | Reconcile actual execution before any recovery action. |

Do not copy the mock's early clearing of its transient robot `tourId` into SQL:
the schema explicitly retains `Robot.CurrentTourId` through End Early until
release confirmation. `NeedsInspection` additionally prevents redispatch.
`Tour.AssignedRobotId` may remain as history after release.

#### READY and Start conditions (ADR-0042)

Accepted in [ADR-0042](decisions/0042-m2-command-transport-and-start-readiness.md).
The READY table is implemented (Tour Management API, M2.1-a); the Start preflight
is implemented, and refuses without writing while `FleetCommands:Enabled = false` (the default). Every condition is evaluated on the server, fail-closed: a
condition without a data source fails. "Design" means an ADR-0042 design
decision, not an SRS requirement. Data source: `DB`, `TELEMETRY` (in-memory Fleet Sync store),
`OPERATOR_CONFIRMATION` (Start request body), `CONFIG`, `CONSOLE` (operator console presence).

**READY conditions.** Any Staff may mark READY (SRS §2). Failure returns
`409 READY_PRECONDITION_FAILED` with every failing blocker, not only the first.

| Condition | Source | Data | When null / no source | Blocker code |
|---|---|---|---|---|
| `State = SCHEDULED`, no execution state (`Tour.HasExecutionState = false`) and no operational use: `TourUsage.HasOperationalHistory = false` and `TourUsage.HasRobotOwnership = false` (no `Robots.CurrentTourId` pointing at the Tour); the same test Cancel/Edit use. READY/Reopen events are not operational history | SRS §4 | DB | fail | `TOUR_STATE_INVALID` |
| Versioned Tour: `RouteRevisionId` and `OperatorUserId` set | ADR-0034 | DB | fail | `ROUTE_VERSION_REQUIRED` |
| Operator is an active Staff account with exactly one role | SRS §2, ADR-0034 | DB | fail | `OPERATOR_REQUIRED` |
| Revision still schedulable: effective PASS run, POI evidence, map gate | ADR-0034 ("READY must recheck") | DB | fail | existing codes, e.g. `ROUTE_TEST_PASS_REQUIRED`, `POI_VERIFICATION_STALE` |
| Active reservation (`ReleasedAt IS NULL`) for this Tour on its robot | SRS §4, ADR-0034 | DB | fail | `RESERVATION_MISSING` |
| Robot passes the ADR-0039 usable-robot rule for the revision's map version/SHA | ADR-0039 | DB | fail | `ROBOT_NOT_READY_FOR_ROUTE` |
| No pending row or email-change decision | SRS §4 (FR-16) | DB | fail | `PENDING_DECISIONS` |
| At least one active ACCEPTED roster row; reported only when no decision is pending | ADR-0054 | DB | fail | `NO_ACCEPTED_ROWS` |
| `ScheduledStartAt > now` | Design | DB + clock | fail | `START_TIME_PASSED` |

Only root causes are reported. Fail-closed applies to the READY decision (any
blocker is 409), not to listing checks that could not be evaluated: a check B
that needs the input of check A runs only when A passed. A Tour without
`RouteRevisionId`/`OperatorUserId` (legacy; `CK_Tours_VersionedTarget_Complete`
keeps both null together) reports only `ROUTE_VERSION_REQUIRED`, skipping the
Operator, revision, reservation and robot rows. A Tour without an active
reservation reports only `RESERVATION_MISSING`, skipping the robot row. The
independent rows (`TOUR_STATE_INVALID`, `PENDING_DECISIONS`, `START_TIME_PASSED`)
always run and are all reported. `NO_ACCEPTED_ROWS` runs only when `PENDING_DECISIONS` passed.

A deactivated route does not block READY: ADR-0037 §5/§7 stops only Tour create
and slots, and existing Tours keep their route.

**Start conditions (preflight).** Only the assigned Operator may Start (SRS §7);
another Staff gets `403`. Any failing check returns
`409 START_PRECONDITION_FAILED` with the full checklist. If every check passes
while `FleetCommands:Enabled = false`, Start returns
`409 COMMAND_TRANSPORT_DISABLED` and writes nothing.

| Condition | Source | Data | When null / no source | Check id |
|---|---|---|---|---|
| Tour is READY | SRS §4 | DB | fail | `tourReady` |
| Caller is `Tours.OperatorUserId` | SRS §7 (FR-36/46) | DB | POST: `403`, not a check; GET start-checks: a check telling the viewer | `callerIsOperator` |
| `now` in `[ScheduledStartAt - StartEarlyLimitMinutes, ScheduledStartAt + StartLateLimitMinutes]`, defaults 10 and 15; the early limit is at most the 15-minute reservation buffer. A short-notice Tour opens when its robot hold opens (a quick Tour: at creation) | Lower bound ADR-0050, ADR-0053; upper bound Design (D2, ADR-0042 §7) | DB + CONFIG | fail | `withinStartWindow` |
| Information only (never blocks): before `ScheduledStartAt` how many accepted active rows hold a live browser session. From `ScheduledStartAt`: not applicable | ADR-0050, ADR-0057 | DB | before the window: not evaluated | `allViewersJoined` |
| Active reservation for this Tour on the same robot | SRS §4, ADR-0034 | DB | fail | `reservationActive` |
| Revision still schedulable: effective PASS run, POI evidence, map gate (the READY check, `TourTarget.RequireSchedulableRevisionAsync`); route deactivation not considered (ADR-0037) | ADR-0034 | DB | fail; detail carries the code, e.g. `ROUTE_TEST_PASS_REQUIRED` | `revisionStillSchedulable` |
| Robot still passes the ADR-0039 rule | ADR-0039 | DB | fail | `robotEligibleForRoute` |
| `Robots.AssignedMapVersionId = RouteRevisions.MapVersionId` | Design (§3.5 map binding) | DB | fail | `robotMapMatchesRoute` |
| `Robots.NeedsInspection = 0` | §3.2 / schema | DB | fail | `robotNotNeedsInspection` |
| `Robots.CurrentTourId IS NULL` | SRS §4 (atomic claim) | DB | fail | `robotNotHeldByOtherTour` |
| `Robots.IsDispatchEnabled = 1` (set by Technical Staff with GATE A evidence, ADR-0049) | Design (ADR-0042 §6) | DB | fail | `robotDispatchEnabled` |
| No pending row/email decision (recheck) | SRS §4 | DB | fail | `noPendingDecisions` |
| At least one active ACCEPTED roster row (recheck); needs `noPendingDecisions` | ADR-0054 | DB | fail | `hasAcceptedRows` |
| No open incident: no Tour holding this robot (`Robots.CurrentTourId`, or a RUNNING Tour with `AssignedRobotId` = robot) has `OperationalStatus = NEEDS_ASSISTANCE`. `NeedsInspection` is the separate `robotNotNeedsInspection` check (refined 03/11/2026, no duplicate report); replace when an incident store exists | SRS §7 (FR-36/46); definition is Design (ADR-0042 open decision 3) | DB | missing data fails | `noOpenIncident` |
| No unresolved command for the robot: no `RobotCommands` row with `IsOpen = 1` (an UNKNOWN GoTo counts) | SRS §7 | DB | fail | `noUnresolvedCommand` |
| Latest telemetry received by server ≤ `FleetCommands:MaxTelemetryAgeSeconds` (default 2) ago; not Fleet Sync `SyncFreshness` | SRS §7 | TELEMETRY + CONFIG | fail ("robot chưa báo") | `telemetryFresh` |
| Reported `mapKey`/`frameId` = revision's MapVersion | Design (§3.5) | TELEMETRY + DB | fail | `mapContextMatches` |
| Reported `executionStatus = IDLE` | Design | TELEMETRY | fail | `executionIdle` |
| Reported `localized = true` | Design (D4) | TELEMETRY | null fails | `robotLocalized` |
| Reported `motionReady = true` | Design (D4) | TELEMETRY | null fails | `motionReady` |
| Operator console connected: the Operator holds an open `/hubs/operations` connection (in memory, per API instance, ADR-0042 open decision 4) | SRS §7 | CONSOLE: `IOperatorConsolePresence` | no connection fails | `operatorConsoleConnected` |
| `robotPlaced = true` | web StartConfirmation | OPERATOR_CONFIRMATION | missing fails | `robotPlaced` |
| `areaClear = true` | web StartConfirmation | OPERATOR_CONFIRMATION | missing fails | `areaClear` |
| `attendantPresent = true` (not yet in web) | SRS §7 | OPERATOR_CONFIRMATION | missing fails | `attendantPresent` |
| `previewChecked = true` | web StartConfirmation | OPERATOR_CONFIRMATION | missing fails | `previewChecked` |
| `FleetCommands:Enabled = true` | Design (ADR-0042 §6) | CONFIG | false → `COMMAND_TRANSPORT_DISABLED` | `commandTransportEnabled` |
| Battery (shown only, never blocks) | Design (D3, §3.4) | TELEMETRY | informational | `batteryInfo` |

Start reports the whole checklist (`checks`, passed rows included) and root causes
(`blockedBy`), with the READY root-cause rule: a check that needs another check's
input runs only when that check passed, otherwise it is `passed: false` with detail
"Chưa kiểm tra vì <id> chưa đạt" and is not in `blockedBy`. Dependencies: every
robot, incident, command and telemetry row needs `reservationActive`;
`robotEligibleForRoute`/`robotMapMatchesRoute` also need the Tour's revision;
`mapContextMatches`, `executionIdle`, `robotLocalized` and `motionReady` need
`telemetryFresh`; `hasAcceptedRows` needs `noPendingDecisions`. Independent rows (`tourReady`, `withinStartWindow`,
`revisionStillSchedulable`, `noPendingDecisions`, console, confirmations,
transport) always run. `NeedsInspection = 1` fails only `robotNotNeedsInspection`;
`noOpenIncident` fails only for a holding Tour in NEEDS_ASSISTANCE. `callerIsOperator`
is independent: a non-Operator viewer gets every other check evaluated in full, and
`canStart` answers whether the caller can Start now.
`batteryInfo` always passes and never enters `blockedBy`. Configuration section
`FleetCommands`: `Enabled` (default false),
`MaxTelemetryAgeSeconds` (2), `StartLateLimitMinutes` (15), `StartEarlyLimitMinutes` (10) (startup refuses either
limit above the 15-minute reservation buffer), and initial values not
measured yet: `AcceptWindowSeconds` (30), `LegResultTimeoutSeconds` (600),
`SweepIntervalSeconds` (5).

The second half of the `noOpenIncident` holder test (a RUNNING Tour with
`AssignedRobotId` = robot) is a guard, not a test convenience: the database does not
force `Tours.AssignedRobotId` and `Robots.CurrentTourId` to agree, so a robot can be
in use by a Tour that `CurrentTourId` does not name.

A real Start stores its `requestId` receipt (`TourRequestReceipt`) against repeated
Start, SRS §4 (ADR-0042 §5 step 1). A refused Start commits nothing, so it leaves no
receipt.

**Demo Tour flow (ADR-0059, proposed 14/11/2026).** `POST …/start` with `holdAtStart: true` opens the Tour at
`CurrentStep = INITIALIZING` with no command (`robotLocalized`/`motionReady` shown, not required; `GET …/start-checks?holdAtStart=true`);
`POST …/next` from `INITIALIZING` is the departure and takes the four on-site confirmations. `POST …/pause` withdraws an
undelivered GoTo or queues a Cancel; the leg's CANCELLED/FAILED/REJECTED end then sets `OperationalStatus = PAUSED` (ARRIVED
still opens the POI), and `POST …/retry-leg` resumes it as a new leg. `POST …/skip` passes over the POI the robot would go to
next while it stands still (`STOP_SKIPPED`). `PUT …/auto-advance {enabled}` (Operator, in memory, off by default) lets a worker
make one attempt per visit to leave a POI whose dwell ended, with every movement check. End Early with no open GoTo releases
the robot. A quick Tour needs no accepted row for READY or Start. GET Tour adds `allowedActions.open/pause/skip`,
`execution.command.cancelRequested` and `execution.autoAdvance {enabled, blockedReason}`.

**Tour runtime (M2.2-b, ADR-0043).** `ReportCommandResultCommand` is the Application
use case the robot results endpoint will call; it locks the Tour, then the command.
A result is valid only from `DeliveredStreamId` with the command's `legId` and an
allowed ADR-0042 transition (`RESULT_STREAM_MISMATCH`, `RESULT_CONFLICT`,
`RESULT_PHASE_NOT_ALLOWED`). Each recorded phase is one `LEG_ACCEPTED`, `LEG_REJECTED`
or `LEG_TERMINAL` event carrying the command and leg; an exact repeat returns
`duplicate: true` with no effect. Only a GoTo result for the Tour's current leg, on a
RUNNING NORMAL Tour and not after UNKNOWN, moves the Tour: ARRIVED `TO_POI` to
OBSERVING with a new visit and a display-only `DwellDeadlineAt`; ARRIVED `TO_END` to
COMPLETED and release; FAILED to `NEEDS_ASSISTANCE` (`NavigationFailed`); REJECTED to
`NEEDS_ASSISTANCE` (`CommandRejected`, reason in the event). Any other result is
recorded and changes nothing. `RobotCommand` writes `State`, `IsOpen` and `Outcome` in
one place. Release skips a robot with `NeedsInspection = 1` (D13). FRONT is not part of
this flow until M2.5 (ADR-0043 D8).

**Failure paths (M2.2-c, ADR-0043).** A hosted sweeper applies the ADR-0043 timeout
rules, one transaction per transition, decided again under the Tour and command locks
so two sweepers make one transition. A GoTo that becomes UNKNOWN on the current leg
moves a NORMAL Tour to `NEEDS_ASSISTANCE` (`CommandUnknown`); one that EXPIRES
undelivered does so with `CommandExpired` (fresh telemetry) or `RobotDisconnected`
(stale telemetry), and Retry leg is allowed from either because the robot never received
it. Before the server accepts requests, restart recovery moves every RUNNING Tour to
`NEEDS_ASSISTANCE` (`BackendRestarted`, keeping an existing reason), clears the dwell
deadline and expires PENDING GoTos. Delivered commands wait for their result or the
sweeper, and nothing continues by itself. Both run whatever `FleetCommands:Enabled` says;
a recovery failure stops startup only while it is true. End Early with an UNKNOWN GoTo
queues a best-effort Cancel and leaves the GoTo UNKNOWN for Reconcile; that is no evidence
the robot stopped. A Cancel closes with its GoTo (reason `LEG_ENDED`) so a robot can be released.

Not in this preflight, still required before a full Tour (ADR-0042 open
decisions 1 and 5): head FRONT (ADR-0008), live stream, FR-49 camera preset and
FR-50 guide narration receipt.

Persisted intent is necessary but insufficient for safe retries: a bridge
restart may lose in-memory idempotency state. Reconcile before replay. Late
results for an old leg may be recorded, but must not advance a new leg or
restart a canceled tour. End Early racing with a send requires coordinated
send/cancel reconciliation, not only a check before the send. Publish business
notifications after the corresponding state/event commit. Define tour revision
semantics across backend restart before wiring the frontend revision guard.

**Robot-local head interface (draft, 23/10/2026).** The STM32 firmware and
`stm32_bridge` expose the PAN/TILT head on the robot's ROS graph: action
`head/set` (`bus_interfaces/action/SetHead`: absolute angle or HOME against
the mechanical stop), topics `head/jog`, `head/step` (operator buttons),
`head/state`, services `head/stop`, `head/off`, `head/zero`, plus
`contactor/set` / `contactor/state` (separate module, needs only
`std_msgs`/`std_srvs`, stays up when the head interface is disabled). A goal succeeds only when the firmware
feedback reports that command's sequence number as accepted **and** the head
idle; the position is open-loop (step counting, no encoder). Serial contract:
`robot/docs/PROTOCOL_FB.md`; interface details:
`robot/ros2_ws/src/stm32_bridge/HEAD_CONTROL.md`. This does **not** define
presets; Fleet Sync v1 still carries no robot commands.

**Operator head control (ADR-0045, proposed 05/11/2026; flags off by default).**
Only `Tours.OperatorUserId` of a `RUNNING` Tour turns that Tour's robot head, with
buttons on the Operator console:

| Method | Path | Notes |
|---|---|---|
| POST | `/api/staff/manage/tours/{id}/head-commands` | `{kind: STEP\|JOG\|STOP\|ANGLE\|SWEEP, panSteps?, tiltSteps?, panDir?, tiltDir?, panDeg?, tiltDeg?, sweepDeg?}` (ANGLE within pan ±170, tilt ±18; `sweepDeg` 10..170, SWEEP only); 200 `{seq, robotCode, issuedAt}` (queued, not executed). 403 not the Operator; 409 `HEAD_CONTROL_DISABLED`, `TOUR_STATE_INVALID`, `HEAD_ROBOT_NOT_CONNECTED`; 429 `FleetHead` policy. |
| PUT | `/api/staff/manage/tours/{id}/head-mode` | `{mode: AUTO\|MANUAL}`, Operator only, until the Tour ends. AUTO (default) turns each POI's camera preset into one command at arrival (ANGLE, SWEEP with its `sweepDeg`, nothing for NONE) and queues `ANGLE 0/0` when Next starts the following leg (ADR-0045 addenda); MANUAL skips both. In memory. |
| GET | `/api/staff/manage/tours/{id}/head` | Any Staff: `{enabled, mode, robotCode, connected, lastPollAt, head}` from the robot's last poll. |
| POST | `/api/fleet/head/v1/poll` | Robot scheme. Long poll `{epoch, afterSeq, waitMs, head}` → `{epoch, commands[]}`. |

Wire: `docs/contracts/fleet-head/v1/`. Commands live only in API memory per robot
(epoch + seq, last 32, never older than `FleetHead:MaxCommandAgeMs`); no
`RobotCommands` row, TourEvent or audit row per press. A `JOG` carries `ttlMs` and
the robot releases it at its own receipt time + `ttlMs`, so a lost network or a
closed tab stops the head. On the robot, `fleet_bridge` (`head_enabled`) maps
`STEP`/`JOG` to topics `head/step`/`head/jog`, `STOP` to service `head/stop`,
`ANGLE` to action `head/set`, `SWEEP` to service `head/sweep` (`bus_interfaces/srv/HeadSweep`, `amplitude_deg` =
`sweepDeg` or 0 for the default 135°: left, right, back to the start at 30°/s; any button stops it), and reports
`head/state` on its next poll. Same
single-API-instance limit as Fleet Sync (ADR-0019).

**Quest camera on demand (ADR-0052, proposed 09/11/2026; robot side opt-in).**
The robot's Quest stream runs only while a Tour assigned to it is `RUNNING` or a Staff
lease has not expired:

| Method | Path | Notes |
|---|---|---|
| POST | `/api/staff/manage/robots/{robotCode}/camera-lease` | Staff role, no body. Extends the lease to now + `FleetCamera:LeaseSeconds` (120); 200 `{robotCode, wanted, reason, robotListening, lastPollAt, leaseUntil, stream}`; `stream` (ADR-0055) is `{whepUrl, token, expiresAt}` for this Staff user when the public relay carries this robot, else null; 404 unknown or deactivated robot; 400 invalid code. The pre-start check page renews it every 30 s while visible, which also renews the token. |
| POST | `/api/fleet/camera/v1/poll` | Robot scheme, optional `{headset}` body (ADR-0056), `FleetSync` rate-limit policy. 200 `{wanted, reason: TOUR_RUNNING\|STAFF_WATCHING\|IDLE, pollSeconds, headsetCommand}`. |

**Quest headset status (ADR-0056).** The camera poll may carry `{headset: {connection, batteryPercent,
charging, stream}}` (normalised, never rejected). `GET /api/staff/manage/robots/{robotCode}/headset` (Staff) returns
`{robotCode, reported, connection, batteryPercent, charging, stream, reportedAt, stale, screen}` from memory; 404 unknown
robot, 400 invalid code.

**Quest headset wake/sleep (ADR-0056 addendum).** The report also carries `screen` (`awake|asleep|unknown`).
`POST /api/staff/manage/robots/{robotCode}/headset/commands` (Staff) with `{action: WAKE|SLEEP}` queues one press in
memory (a later press replaces one not yet delivered; dropped after `FleetCamera:RobotListeningWithinSeconds`) and
returns `{robotCode, commandId, action, expiresAt}`; 409 `HEADSET_ROBOT_NOT_LISTENING`, `HEADSET_NOT_REPORTED`,
`HEADSET_NOT_CONNECTED`, `HEADSET_CONTROL_UNSUPPORTED` (no `screen` reported) or `HEADSET_TOUR_RUNNING` (SLEEP while a
Tour runs). The next camera poll answer carries it once as `headsetCommand: {id, action}` (otherwise null);
quest-stream runs it over adb. There is no power-off: a powered-off headset has no adb and cannot be turned on again
from the web.

Leases and last polls live only in API memory (single instance, ADR-0019); nothing is
written to SQL. `robot/quest-stream` (`QUEST_CONTROL_URL=auto`) polls with the Fleet Sync
identity, pauses capture when not wanted (`/status` state `paused`, `/device` stream
`paused`) and keeps capturing after 60 s without an answer unless `QUEST_CONTROL_FAILSAFE=off`.

**Who may watch the public relay (ADR-0055, proposed 11/11/2026).** The public MediaMTX relay
uses `authMethod: http`: it asks the backend about every publish and read. The relay URL is
`QuestRelay:WhepUrl` and is not in the web bundle; a page gets it with a token:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/student/tours/{tourId}/stream-access` | Student session cookie (allowed origin). 200 `{whepUrl, token, expiresAt}` while the session is open, unexpired and unrevoked on an active ACCEPTED row and the Tour is `RUNNING` with `AssignedRobotId` = `QuestRelay:RobotCode`, or `SCHEDULED`/`READY` with an unreleased reservation on that robot. 401 without a valid session; 409 `STREAM_NOT_AVAILABLE` otherwise (ended or cancelled Tour, another robot, no relay configured). `no-store`. |
| POST | `/api/internal/stream-relay/auth?key=` | Anonymous; only the relay knows `QuestRelay:Key`. Body is MediaMTX's `{user, password, token, ip, action, path, protocol, id, query}`. 204 allows `publish` with `QuestRelay:PublishUser` and a password whose SHA-256 is `QuestRelay:PublishPasswordSha256`, or `read` of `QuestRelay:Path` (`quest`) with an unexpired token in the `token` query parameter whose holder may still watch; 403 refuses; 401 wrong key or relay not configured. `StreamRelay` rate limit (1200/min/IP). |
| POST | `/api/internal/stream-relay/recheck?key=` | Same key. Body `{path, query}` of an open WebRTC session, sent every 5 s by `mediamtx-relay-reaper` on the relay host. 204 while the holder may still watch (the token's expiry is ignored), 403 when not, and the reaper then kicks the session through the MediaMTX API on `127.0.0.1:9997`; 401 wrong key. |

Token: `v1.<S|T>.<session or user id>.<robot>.<expires>.<HMAC-SHA256>`, key derived from
`QuestRelay:Key`, life `QuestRelay:TokenSeconds` (120, 30..300). A Student token holds while the
rule above holds; a Staff token while a camera lease on that robot is live. The browser adds it as
`?token=` to the WHEP URL and fetches a new one at half its life; a refused renewal closes the
player. All `QuestRelay` values unset: no token is issued and the relay refuses every reader.

Rotating head/pan presets remain a V1 requirement outside the navigation wire
MVP. FRONT gating is the current orchestration decision described above, not a
separately established Capstone requirement. A separate patch must define presets,
command/result correlation, timeout/fault/retry behavior, and the actuator's
ROS interface. Do not invent a completed FRONT report or make a navigation leg
proceed merely because a head command was sent. This document does not yet
select a `SetHead` method or add head fields to the current navigation DTO.

The older `TourRoute` / `TourSlot` / `Booking` / `TourInstance` flow is
historical and is not the current persisted model. No `Mission` entity exists.
See [ADR-0006](decisions/0006-demo-first-tour-schema.md) for the schema change
and `backend/AGENTS.md` for the command/query implementation flow.

The SQL file is the Database First source: it was scaffolded into Domain
entities and Infrastructure `ApplicationDbContext`. There is no normal EF
migration flow. See `backend/AGENTS.md` for the re-scaffold procedure.

#### v1.1 snapshot and historical operation target (ADR-0012)

ADR-0020 supersedes the business-role/row-access portions for the SRS v0.2 target.
The schema and existing APIs below describe current persistence and implementation.

`backend/database/smart-campus-tour-schema-v1.1.sql` is the current empty-DB
snapshot for invitation/session/branch storage. It is applied to the local
SQL Server database `SmartCampusTourV11` on `localhost,1433` and scaffolded to Domain entities and
Infrastructure `ApplicationDbContext`. It does not migrate existing v1.0 or
production data. Database setup/scaffolding were exercised locally. The current
backend also implements Representative submission/pre-approval registration,
Staff registration review, Auth V1, Admin account management, Staff legacy POI
catalog management, and development-only SimulationPreview; the relevant HTTP contracts
are described in Sections 3.0–3.0.2 and 3.2.1–3.2.2. Tour execution/orchestration,
invitation/session product APIs, branch-request use cases, fleet
dispatch, and production fleet/operations Hubs remain unimplemented.

Under ADR-0012 and the original CRUD slice in `docs/decisions/0017-admin-route-management.md`,
dwell is fixed in RouteStops and Staff can edit unreferenced Route configuration
through CRUD under current ADR-0020 ownership. Technical staff still verify physical execution; there is no
per-Tour dwell editor. The old all-Staff/all-Tours rule is superseded: target
operation requires an explicitly assigned Staff Operator. Current schema has no
assignment field; CreatedByUserId is attribution only. Staff target invitation
support is separate from current Staff/Representative endpoints. All state,
readiness, time and robot-claim checks still apply. RowVersion must be checked on writes;
only a committed winning decision may lead to robot dispatch.

In v1.1, CurrentRouteStopId replaces CurrentStopOrder and must belong to the
active route. Accept maps it to the verified equivalent VariantBranchStopId.
LastArrivedRouteStopId replaces LastArrivedStopOrder but retains the last actual
arrival, potentially on the old route, until another arrival is confirmed.
These are SQL fields, not changes to public navigation DTOs or ROS interfaces.
BranchRequests stores BranchPointRouteStopId derived from the allowed variant;
the backend must validate Tour/route/stop consistency and expire old requests
atomically on visit closure or NEEDS_ASSISTANCE before recovery. No future-visit
GUID allocation is required; CurrentStopVisitId still correlates execution attempts.

Unique keys protect one invitation per roster row, one open session per
invitation, one accepted branch per Tour and one pending request per
Tour/requester/branch point. HMAC-SHA256 access-code hashes are globally unique,
with the key outside SQL; code lookup still verifies the Tour. Expired sessions
must be closed transactionally before replacement. Every roster-changing path,
including approval and single-email correction, must lock the parent Tour with
UPDLOCK before normalized-email duplicate checks and hold it through commit.
These application transactions are not implemented by the snapshot's indexes.

Narration activation records AudioUrl/NarrationText/NarrationSeconds snapshots
in TourEvents.DataJson with POI/visit context; replacement uploads use new assets
and preserve old assets needed for history. Each email attempt uses its own
CorrelationId: append EMAIL_SEND_REQUESTED/PENDING and subsequent
EMAIL_SEND_RESULT/ACCEPTED, FAILED or UNKNOWN evidence. No in-place audit update;
statistics count confirmed attempt outcomes rather than rows. Retry sends are new
attempts. `backend/database/smart-campus-tour-permissions.sql` supplies the
restricted log role; it does not provision production users or make an owner/admin
account append-only. Retention/identity cleanup remains application work under
ADR-0011/0012, not an implemented background job.

#### 3.2.1 Representative registration HTTP boundary (implemented)

The Representative submission slice integrates `backend/` and `web/` using
schema v1.1 without migrations. It implements pre-approval registration only:

| Method | Path | Behavior |
|---|---|---|
| GET | /api/representative/tours | SCHEDULED Tours, paginated |
| GET | /api/representative/tours/{id} | SCHEDULED or a Tour with an owned registration |
| GET | /api/representative/registrations | Owned registrations; optional tourId/state |
| GET | /api/representative/registrations/{id} | Owned details and active roster |
| POST | /api/representative/tours/{id}/registrations | Create SUBMITTED; UUID Idempotency-Key required |
| PUT | /api/representative/registrations/{id} | Replace SUBMITTED details and roster |
| POST | /api/representative/registrations/{id}/resubmit | REJECTED/CANCELLED -> SUBMITTED, retaining ID |
| POST | /api/representative/registrations/{id}/cancel | SUBMITTED/REJECTED -> CANCELLED |

All routes require the Representative role. Ownership comes exclusively from
JWT sub, never the request body. Unowned resources return 404. Collections use
BaseResponse/PagedResponse with page/size/search/sort; expand is unsupported.
Tour sort supports scheduledStartAt/name (optional '-' descending);
registration sort supports updatedAt/submittedAt/groupName. State strings are
the SQL uppercase values. There is no visitor capacity or one-group-per-Tour
restriction. Dashboard counts use pagination.totalItems, not the page length.

Create/replace JSON contains schoolName (200), groupName (200, required),
contactName (150), contactEmail (254), expectedTourRowVersion, and roster rows
{rowNumber, rowType, displayName (150), email (254), className (100, optional)}.
Rows identify an INDIVIDUAL or SHARED_VIEWING invitation; a shared row identifies
its responsible person, not all viewers. At least one row is required, including
shared-only groups. The browser imports LoaiDong/HoTen/Email/Lop from Excel/CSV,
with CA_NHAN/DIEM_XEM_CHUNG mapping to those row types. Technical upload limits
are 2 MB and 1000 rows, not Tour capacity; worksheet preview also bounds XML
expansion to 8 MB per part and 10002 source rows / 256 columns. JSON writes
are limited to 4 MB and reject unknown properties. The API independently validates rows
and source row numbers. Old two-column/group-code mocks are not this contract.

Update/resubmit additionally require expectedRowVersion; cancel requires both
versions. Tokens are opaque base64 SQL rowversions. Writes require SCHEDULED.
APPROVED and registrations with invitation history are read-only in this slice;
approved replace/cancel remains a future capability requiring atomic access
revocation. Details return allowedActions with reasons. Clients retain the
version of the draft they opened; refreshing does not authorize stale edits.
Mutation responses carry an ID (create) or null; clients refetch committed data.
400 reports input errors, 409 conflicts use `errors.code` values
`STALE_VERSION`, `TOUR_LOCKED`, `STATE_CONFLICT`, `INVITATION_BOUNDARY`, or
`EMAIL_RESERVED`; email conflicts also return `errors.fields` keyed by the
incoming `Roster[i].Email` property without naming another registration.
401/403 report auth failures.

Registration transactions acquire an update lock on the Tour before locking a
registration, checking effective emails and saving roster/registration/audit
through the existing UnitOfWork. Active roster rows reserve normalized
(trimmed, case-insensitive) emails across SUBMITTED/APPROVED registrations in
the same Tour. REJECTED/CANCELLED release that reservation; resubmit rechecks.
No alias canonicalization or name matching is applied. Conflicts do not expose
another group's data. Replaced rows become inactive; no invitation is created.
Staff review and Tour-state writers must follow the same Tour-first lock
order and recheck effective emails before APPROVED.

Create idempotency is durable: AuditLogs.CorrelationId is scoped by actor,
Tour and REGISTRATION_SUBMITTED action, saved with the registration under the
same lock/transaction. Replaying a committed key returns its original ID,
even after a state change; it never edits the original registration. A fresh
key creates another group. Audit contains identifiers/actions only, no roster
PII. Invitation/email/session, branch runtime and voting are
outside this slice. Staff review is implemented separately below; Admin/Staff
Tour preview mocks continue to use their own simulation records.

#### 3.2.2 Staff registration review HTTP boundary (per-row workflow)

This integrates `backend/` and `web/` against the current schema. Review
list/detail and per-row accept/reject require the Staff JWT role under
`/api/staff/manage/registrations`; former Admin aliases and aggregate decisions
are retired under ADR-0027. Email changes use the Representative request and
Staff review workflow in §3.2.3; direct Admin correction is no longer routed.

| Method | Path | Behavior |
|---|---|---|
| GET | /api/staff/manage/registrations | Paginated registrations across Representatives; optional tourId/state/from/to |
| GET | /api/staff/manage/registrations/{id} | Details, active roster, reviewer ID/time, opaque versions and review gate |
| POST | /api/staff/manage/registrations/{id}/rows/{rowId}/accept | Accepts one pending row after row, registration and Tour version checks |
| POST | /api/staff/manage/registrations/{id}/rows/{rowId}/reject | Rejects one pending row with a reason after version checks |

Collections use BaseResponse/PagedResponse and page/size/search/sort; expand is
unsupported. Search covers school, group, Representative full name and Tour name.
Sort supports submittedAt (default, oldest first), updatedAt and groupName, with
optional '-' descending and ID tie-breaker. State uses the SQL uppercase values.
from/to are offset-qualified instants filtering Tour scheduled time, inclusive
lower/exclusive upper bound; the web converts calendar dates using UTC+7.
Unknown IDs return 404. Anonymous/non-Staff requests return 401/403.

Both decisions accept {expectedRowVersion, expectedTourRowVersion, reason?};
versions must be 8-byte base64 SQL rowversions, reason is required for rejection
(nonblank, at most 1000 characters) and absent/blank for approval. Unknown JSON
properties are rejected. Actor comes only from JWT sub. No roster is accepted in
a review write: the decision always concerns the stored active rows.

The existing RegistrationTransactionBehavior wraps the UnitOfWork commit.
Shared registration persistence takes the Tour UPDLOCK first, then registration
UPDLOCK, checks both versions, SCHEDULED/SUBMITTED and invitation history.
Approval independently validates persisted contact/roster data and rechecks
normalized effective emails against SUBMITTED/APPROVED groups under the same
lock as Representative writes. Rejection can release an invalid roster for
correction; Representative resubmit revalidates and clears review metadata.
Review does not replace or deactivate roster rows, change Tour state or release
an APPROVED email reservation. Concurrent review/edit/cancel of the same
version has one winner; retries of a successful decision return 409 and cannot
append a second review audit. Refetch committed detail to reconcile a lost reply.

The decision, ReviewedByUserId/ReviewedAt/UpdatedAt and one append-only
REGISTRATION_APPROVED or REGISTRATION_REJECTED audit commit atomically. Audit
contains only actor/Tour/registration/action/result/time, no reason or roster
PII. A failed audit rolls back the decision. Conflict codes match Section 3.2.1;
EMAIL_RESERVED reports only indexed incoming roster fields. Detail queries
retain a short read-only Tour UPDLOCK while projecting
registration/version/roster, so a version cannot be paired with an older roster
under read-committed isolation. They use the same Tour-first order as writers.
Details expose a review gate with a reason; browser focus/reconnect cannot
replace the review
snapshot, and a 409 requires explicit reload before another decision.

Approval is persisted eligibility for access issuance. When invitation support
is enabled, Section 3.2.3 issues invitations and queues email in the same commit.
Any
invitation history (including inactive/revoked rows) blocks review with
INVITATION_BOUNDARY to avoid changing existing access without atomic revocation.
APPROVED roster stays read-only to Representative; invitation support is separate.
Admin email correction is implemented in Section 3.2.4. Approval reversal and
READY/runtime remain outside this review slice.

Live routes `/admin/registrations` and `/admin/registrations/pending` use only
this HTTP contract, with no mock fallback. Owner-keyed live query caches are
separate from demo caches. Existing Admin Tour/dashboard review drawers,
invitation demos, Staff/Student simulations and legacy contracts remain mock;
their links use the mock Tour review consumer rather than sending fixture IDs
to live SQL endpoints. A SQL review does not change demo Tour counts/readiness.
The Staff sidebar "Chờ duyệt" badge links to the live queue, so it reads
`pagination.totalItems` of the same SUBMITTED query; the dashboard and bell stay
simulated. Representative lists/details refetch from SQL and show committed review state.

`backend/src/SmartCampus.Application/Features/Registrations/` owns the shared
registration invariants: state values, the SCHEDULED write window and conflict
codes, rowversion tokens, email normalization/reservation, input validation and
audit. `IRegistrationRepository.LockRegistrationAsync` is the single Tour-first
lock entry for Representative, review and invitation writers. Each actor policy
sits at its feature root because commands enforce it and detail queries project
it: `backend/src/SmartCampus.Application/Features/Representative/RepresentativeRegistrationPolicy.cs`
and `backend/src/SmartCampus.Application/Features/RegistrationReview/ReviewPolicy.cs`.
Approve and reject are separate commands sharing
`backend/src/SmartCampus.Application/Features/RegistrationReview/Commands/ReviewDecision.cs`; Representative
draft replacement stays with its commands; read models stay in their query
`Dtos/`. The roster display and SQL registration-state vocabulary shared by live
Admin and Representative are under `web/src/features/registrations/`.

#### 3.2.3 Invitations, Resend and Student entry (implemented, opt-in)

ADR-0015 defines code protection, expiry, queue claims and session semantics.
The full configuration/transport contract is in
backend/docs/invitations-resend.md. This integrates backend and web without a
schema change. Enabled approval atomically issues/queues one private invitation
per active approved row; failed mail never reverses approval or changes Tour state.

Staff or owner Representative GET /api/registrations/{registrationId}/invitations
returns enabled/canIssue and items with approved row identity, version, expiry,
revocation, latest email status and action gates. Codes/hashes/ciphertext/session
credentials are never returned. Staff has organization-wide support; a Representative can access only their own group's invitations; Admin is denied.
POST the same path + /issue with requestId (UUID), expectedRowVersion
(registration), expectedTourRowVersion to fill missing invitations of previously
approved groups. POST + /{invitationId}/resend, /reissue or /revoke with requestId
and expectedRowVersion (invitation). All use BaseResponse; writes return null.
Retain requestId for uncertain retries; identical committed operations cannot
enqueue/rotate twice. Another operation with that ID conflicts.

Tour-first locks serialize issuance/support/admission. Resend keeps code/session;
reissue keeps invitation ID/expiry, replaces code and closes open sessions;
revoke invalidates code and sessions. Send/reissue require active APPROVED rows,
unexpired access and SCHEDULED/READY/RUNNING; revocation also supports valid
post-Start End Early fallback. A one-minute per-invitation send cooldown applies.
Expiry defaults to scheduled start +24 hours, configurable for future issuance.
Codes have 100 random bits, HMAC-SHA256 hashes and AES-256-GCM protected values
bound to ID/version with separate external keys; no secret/PII appears in URLs.

AuditLogs is the durable delivery queue: EMAIL_SEND_REQUESTED/PENDING, one
EMAIL_SEND_STARTED claim, and one EMAIL_SEND_RESULT per CorrelationId.
External Resend HTTP happens after commit, using the attempt UUID as its
idempotency key. Interrupted attempts become UNKNOWN after two minutes;
manual resend is a new attempt. No automatic uncertain retry. ACCEPTED means
provider acceptance, not inbox delivery/read. Audit includes only IDs, version,
sanitized outcome and timestamps; never code, ciphertext, PII or provider bodies.

Student POST /api/student/tours/{tourId}/join accepts JSON {accessCode}.
POST /session (empty body) restores/heartbeats; POST /leave closes the session.
All use BaseResponse with minimal Tour name/state/schedule, invitation expiry,
row type and eligible fallback URL. No account JWT/token response/roster identity.
The per-Tour cookie is HttpOnly, Secure, SameSite=None and scoped to that API
path; SQL stores only its HMAC. Exact browser-origin checks protect cookie
mutations. Join is limited to 60 requests/minute/IP. A shared Tour lock and SQL
filtered UNIQUE enforce one active session; expired sessions close before INSERT.
The same cookie/tabs reuse it; competing browsers get 409 INVITATION_IN_USE.
Wrong-Tour/invalid/expired/revoked access gets a generic 401. Heartbeats retain the
session for configured SessionIdleMinutes (default 10), bounded by invitation
expiry. Reconnect/heartbeat is a separate two-minute grace from the active
session's `LastSeenAt`: both the session and device cookies may be presented,
or a matching device cookie alone may recover that browser by rotating the
session token. A stale session cookie does not bypass the grace, and the
10-minute idle lease does not enlarge it. The Tour-scoped device token is a
browser credential, never an IP-derived identity. First successful entry
records INVITATION_ENTERED once per invitation.

Student GET /api/student/tours/{tourId}/view (same cookie and exact-origin check,
no body, `Cache-Control: no-store`) returns the read-only route for the session's
Tour: `{ stops: [{ order, poiId, name, description, narrationText, audioUrl,
narrationSeconds, dwellSeconds }], progress }`. Stops are the active route's
RouteStops in StopOrder with their POI's approved fields; `audioUrl` is null
unless it is an https URL without credentials or a same-site path. `progress` is
null unless the Tour is RUNNING, then `{ step, currentPoiId, lastArrivedPoiId,
needsAssistance, isHeld }` copied from Tours.CurrentStep (null until the first
dispatch writes it), CurrentRouteStopId/LastArrivedRouteStopId (as POI IDs),
OperationalStatus = NEEDS_ASSISTANCE and IsHeld. Any state with a valid session is
allowed; no session/invitation/Tour → generic 401. No roster, invitation or
account data. Implementation: `Features/StudentTour/GetStudentTourViewQuery.cs`,
`EfStudentTourViewReader`, `Api/Controllers/StudentTourController.cs`.

Live Staff review and owner Representative detail share real invitation support.
SQL GUID /tour/{tourId} links use code/cookie entry and committed Tour state, then
show the same waiting-room, live and end screens as the demo, filled only from
join/session and /view (polled every 5 s while RUNNING, 30 s otherwise). The page
shows no student identity, hides the 2D map (no pose feed yet) and says so when
there is no livestream; a fallback video plays inline only when it is an
https/same-site .mp4/.webm file, otherwise it is a link. Non-GUID fixtures retain
the labelled demo. No simulated stream/AI/robot state
is inserted into a SQL room. Tour preparation scheduling and text Q&A are now
implemented; runtime/readiness, livestream, roster replacement after issuance
and retention remain separate. Admin email
correction is implemented below.
HTTPS and browser cookie/local-network permissions still apply to local BE use.

#### 3.2.4 Historical Admin roster email correction (retired)

This section records the historical contract only. The Admin-only correction
endpoint is retired under ADR-0027; the current path is the request/review
workflow in §3.2.3. Business authority described below belongs to the prior
baseline and is not a current routable operation.

Former route `POST /api/admin/registrations/{id}/roster/{rowId}/email` required
the Admin JWT role. It is no longer mapped. Its historical body was
{requestId, email, expectedRowVersion, expectedTourRowVersion,
expectedRosterRowVersion, expectedInvitationRowVersion?}. UUID requestId and
8-byte base64 version tokens are required; the invitation token is null only
when the selected row has no invitation. Unknown JSON properties are rejected;
actor comes from JWT sub. BaseResponse returns null on committed success;
clients refetch detail and invitation support.

Staff GET detail includes correctEmail {allowed, reason}; each active roster row
adds id, rowVersion and nullable invitationRowVersion. These tokens and the
roster are read under the existing Tour snapshot lock. Representative input and
detail contracts are unchanged. Row ID, never row number/name, selects the write.

The command uses the existing registration transaction/UnitOfWork. It takes the
Tour lock, then registration lock, checks Tour/registration/row/invitation
versions, requires SCHEDULED, and checks the normalized email against other
active rows in the same registration and the existing SUBMITTED/APPROVED
Tour-wide reservations. Normalization/format/length match registration input;
no alias canonicalization. The selected active row retains ID, name, type and
class; only Email/UpdatedAt change. Registration UpdatedAt/version advances so
opened Representative replacements and Staff decisions become stale. Review
metadata and registration state are preserved.

SUBMITTED and REJECTED may be corrected without sending or granting access;
REJECTED retains its reason/reviewer and still needs Representative resubmit and
Staff approval. CANCELLED/unknown states are refused. Any invitation history on
a non-approved registration blocks correction, consistent with existing review
and Representative boundaries. READY requires reopening; RUNNING and terminal
Tours are refused. Staff reopens a READY Tour with
`POST /api/staff/manage/tours/{id}/reopen` (Tour Management API); the web drawer
is not wired to it yet and still only explains the restriction.

For APPROVED, enabled invitation configuration is required. Existing selected
invitation keeps its ID/expiry, increments AccessVersion, replaces hash/protected
code, clears revocation and closes every open browser session via the same
invitation reissue implementation. Expired invitations cannot be revived. If
the approved row has no invitation (e.g. approval while support was disabled),
only that row is issued using the configured initial expiry. Other rows,
invitations and sessions are untouched. Correction queues one new email attempt
atomically with the email/access change. It does not apply the old recipient's
send cooldown: a correction must replace access immediately; later manual resend
uses the existing one-minute cooldown and current code.

External email stays in the existing post-commit worker. Old pending requests
fail the AccessVersion check at claim; an already claimed old email may still
reach its former recipient, but its code is invalid after correction commits.
FAILED/UNKNOWN delivery keeps the new email/code and APPROVED state; ordinary
invitation resend retries the current code without another rotation.

ROSTER_EMAIL_CORRECTED audit records actor/Tour/row/request/time/result and
opaque opened snapshot versions/registration ID. No email (including email
hash), names, access code, ciphertext or session token is added to audit. Audit,
row, registration, invitation, session revocation and queue writes commit or
roll back together. Durable receipts are scoped to Tour plus correction action
and request UUID. A replay by the same actor for the same row/snapshot and
normalized current recipient returns success before stale/state checks without
rotating/enqueuing again, including after restart. A reused UUID with different
actor/row/snapshot/recipient returns IDEMPOTENCY_CONFLICT. After any later
correction of the same row, replay returns that conflict and requires reload
(even if the email was subsequently changed back). It never reinstates the
earlier email. This avoids retaining recipient PII in
append-only receipts. Equivalent email case/whitespace is treated identically.

400 reports invalid email/tokens/body; 404 reports missing/inactive/wrong-group
row; 409 uses STALE_VERSION, TOUR_LOCKED, STATE_CONFLICT, INVITATION_BOUNDARY,
EMAIL_RESERVED, EMAIL_UNCHANGED, INVITATIONS_DISABLED, INVITATION_UNAVAILABLE,
INVITATION_EXPIRED or IDEMPOTENCY_CONFLICT. Conflicts do not expose another
group's identity/email. 401/403 enforce authentication/role.

The Admin drawer confirms the selected row/old email/new email and access
consequences. It retains the exact request UUID/body on uncertain network/5xx
outcomes; confirmed validation/duplicate errors allow a new attempt. Stale,
state and authorization failures block further writes until explicit successful
reload. Focus/reconnect cannot replace an opened snapshot. Live calls never
fall back to fixtures; existing Tour/demo consumers remain intact.

### 3.2.x Capacity, Operator change, T-24h expiry and the code guard (ADR-0048, schema v1.18)

Public contract added by this batch. Held seats are the Tour's active PENDING and ACCEPTED rows, counted under the Tour root lock.

| Surface | Contract |
|---|---|
| `POST /api/staff/manage/tours` | `configuration.capacity` is required, 1..`Tours:MaxCapacity` (default 20, ceiling 40 by `CK_Tours_Capacity`). |
| `POST /api/staff/manage/tours/{id}/capacity` | Staff. `{requestId, expectedRowVersion, capacity}`. SCHEDULED/READY before Start. 409 `CAPACITY_BELOW_HELD`, 409 `TOUR_LOCKED`. Audit `TOUR_CAPACITY_CHANGED`. |
| `POST /api/staff/manage/tours/{id}/operator` | Staff. `{requestId, expectedRowVersion, operatorUserId}`. SCHEDULED/READY before Start; READY stays READY. 409 `TOUR_LOCKED`, 409 `ROUTE_VERSION_REQUIRED` for a legacy Tour. Audit `TOUR_OPERATOR_CHANGED`. |
| Tour reads (`GET /api/staff/manage/tours`, `/{id}`) | `tour.capacity`, `tour.heldSeats`, `tour.registrationClosesAt`; `permissions.canChangeCapacity`, `canChangeOperator`, `maxCapacity`. `/slots` adds `maxCapacity`. |
| Representative create, add rows, replace roster | 409 `TOUR_CAPACITY_EXCEEDED`, `errors.fields.remainingSeats`. A write that adds no seat is never refused. |
| `GET /api/representative/tours` | Only SCHEDULED Tours before the 48-hour close. Tour responses add `capacity` and `remainingSeats`. The detail stays reachable for a Tour the Representative registered for. |
| `POST .../roster email change request` | 409 `EMAIL_CHANGE_CUTOFF` from T-24h. |
| Roster row `participationState`, email change `state` | New value `EXPIRED`: set by `RosterExpiryWorker` (every 60 s, one transaction per Tour under the Tour lock) at T-24h on SCHEDULED/READY Tours. It returns the seat and does not count as a pending decision for READY. Email change responses add `expiresAt`. |
| `POST /api/admin/accounts/{id}/deactivate` | 409 `ACCOUNT_IN_USE`, `errors.blockers[]` (`TOUR_OPERATOR`, `ACTIVE_REGISTRATION`). `TOUR_OPERATOR` covers SCHEDULED, READY and RUNNING Tours. |
| Registration state at T-24h | For each registration with a row expired by the job: any ACCEPTED row keeps APPROVED; otherwise any PENDING row keeps SUBMITTED; otherwise REJECTED with `rejectionReason` exactly `Hết hạn duyệt trước giờ tham quan 24 giờ.`, no reviewer, `reviewedAt` set to the run time. The Representative list's `group=closed` includes it even while the Tour is SCHEDULED. Audit `REGISTRATION_EXPIRED` (`ActorUserId` null, `DataJson` `{"expiredRows":n}`). |
| `POST /api/representative/registrations/{id}/resubmit` | 409 `REGISTRATION_REVIEW_CLOSED` for a REJECTED registration at or after `ScheduledStartAt - 24h`. `allowedActions.resubmit` returns `allowed:false` with the same message as `reason`. |
| Representative Tour responses, `register` gate | `allowed:false` with reason `Đã hết hạn đăng ký.` at or after the 48-hour close, then `Tour đã đủ chỗ.` when `remainingSeats` is 0. `TOUR_LOCKED` is checked first. |
| `GET /api/representative/registrations`, `GET /api/representative/registrations/{id}` | Items and `summary` add nullable `tourEndedAt`, from `Tours.EndedAt`. It is set for any ended Tour, so read it together with `tourState`. |
| `POST /api/student/tours/{tourId}/join` | 429 `INVITATION_CODE_LOCKED` after `Invitations:CodeGuard:MaxFailures` (5) wrong codes per (code, IP) in `WindowMinutes` (10), for `LockMinutes` (15). In memory, one API instance. The 60 requests/minute/IP limiter stays in front. |
| `GET /api/technical/route-verifications/rerun-queue` | TechnicalStaff. Current revisions whose effective PASS has no `measurementBasis`. `GET /api/technical/dashboard` adds `kpis.routeRerunsCount` and action type `ROUTE_RERUN`. |

Audit actions `ROSTER_PENDING_EXPIRED`, `REGISTRATION_EXPIRED` and `ROSTER_EXPIRY_NOTICE_{REQUESTED,STARTED,SENT,FAILED}` carry ids and counts only. The notice uses the delivery shape of the cancellation notice: one email per registration, claimed once, an uncertain send never repeated.

### 3.2.y Early Start and short-notice Tours (ADR-0050, schema v1.19)

| Surface | Contract |
|---|---|
| `GET .../tours/{id}/start-checks`, `POST .../tours/{id}/start` | Check `allViewersJoined` (table in §3.2; information only since ADR-0057). The read adds `opensAt`, the first instant Start is accepted. An early Start records `ReasonCode = EARLY_START` on `TOUR_STARTED`, with the waiting-room count in `ReasonNote`. |
| `POST /api/staff/manage/tours` | A quick Tour (ADR-0053) is created through the same call: `configuration.shortNoticeReason` (at most 500 characters, not blank) with `scheduledStartAt` null. The server sets `scheduledStartAt` to the latest Start (now + `Tours:ShortNoticeMinLeadMinutes`, 30 when unset, next whole minute), holds the robot `[now, latest Start + expected + 15 min]` with no shift, and records `TOUR_CREATED_SHORT_NOTICE` with the reason. A reason with a start, or no reason and no start, is 400. 409 `SHIFT_BLOCKED` when the hold reaches a closed day or shift, `ROBOT_RESERVATION_CONFLICT` on any other hold. Always available. |
| `GET .../tours/shifts`, `GET .../tours/slots` | Shifts read adds `quickTourWaitMinutes`. Slots are for Tours on a shift only: `shortNotice` and `shortNoticeMinLeadMinutes` are removed. |
| Staff Tour reads | `tour.isShortNotice` (a quick Tour); `tour.registrationClosesAt` is its latest Start. |
| Representative Tour and registration reads | Tour adds `registrationClosesAt`; registration summary adds `tourIsShortNotice` and `tourRegistrationClosesAt`. |

A short-notice Tour replaces the 72-hour lead, the 48-hour close and the 24-hour review close. Its list closes with READY, the T-24h job skips it, and undecided rows still block READY and Start. Since ADR-0053 every new short-notice Tour is a quick Tour with no shift: Start, and `opensAt`, open when its robot hold opens (creation), `allViewersJoined` is shown before its latest Start (information only, ADR-0057), and every other Start check is the same as for any other Tour. The late limit and automatic cancellation run from its latest Start.

### 3.3 State storage and realtime delivery

When the backend receives robot pose/state, it is transient latest-state data
and belongs in memory or a suitable cache at the architecture level. This
does not select or add Redis. SQL Server stores meaningful business events
and state transitions; it
must not receive every pose update. A controlled benchmark may write telemetry
to a dedicated experiment log/file.


Backend-to-browser realtime uses the Staff-authorized `/hubs/operations`
boundary. `FleetUpdated` now carries the current fleet telemetry projection on
connect, after new sync reports, and when freshness changes. The backend
projection matches the existing `AmrStatus` shape and adds explicit sync/pose
freshness and readiness fields. `TourUpdated` is sent without payload as a re-read hint (§3.1.2); its
`(tourId, revision)` payload and `AssistanceRequired` remain planned. The web still selects its mock
realtime provider; wiring production auth, reconnect/refetch, and Staff data
flows is separate work. This decision does not approve or implement the
proposed staff/admin HTTP APIs in `web/src/api/contracts/staff.ts` and
`web/src/api/contracts/admin.ts`, nor their error/version contracts.

Fleet Sync v1 has initial configurable age/freshness defaults; R1 must validate
report rates and thresholds against the bridge/network, independently of ROS
internal rates. Keep network I/O off ROS callbacks. M2 terminal results require
separate retention/retry from latest-state pose delivery. The SimulationPreview
10 Hz limit remains local to preview. Research implementation and benchmark
execution are deferred under Section 5. Research requirements impose no
constraints or acceptance gates on this production milestone; the Capstone
scope remains unchanged.

The backend implements development SimulationPreview, user JWT login/session
authentication, Representative-owned registration management, Admin account management,
Staff POI, Route and Tour preparation management and registration review,
invitation support, Student access, authenticated Fleet Sync v1, and the
Staff-authorized Operations Hub projection. Admin role authorization is
enforced for Admin APIs; invitation support grants Staff-wide support and owner-Representative access.
Student access applies invitation/session rules. Runtime branch-request,
command/result, dispatch, and Tour runtime APIs remain unimplemented. Latest
fleet state is single-process memory; multiple instances need shared-state and
routing design.

### 3.4 M2 execution and command-result semantics

[ADR-0042](decisions/0042-m2-command-transport-and-start-readiness.md)
(Accepted 2026-11-03, implemented from M2.2) selects a separate robot-polled
command contract (`docs/contracts/fleet-commands/v1/`), a persisted command
lifecycle and the `RobotCommands` table. It refines this section: results correlate
by `commandId`, and a leg's terminal outcome is reported on its GoTo command.

Fleet Sync v1 implements telemetry state reporting as described in §3.1.2.
The per-leg result/command rules below are retained for M2 design; no
`ReportCommandResult` endpoint, navigation command, or tour runtime is
implemented by this backend slice.

| Field | Requirement and meaning |
|---|---|
| `robotId` | Required canonical code such as `robot_01`; maps to `Robot.RobotCode`, not the SQL GUID `Robot.Id`. Must match authenticated identity. |
| `streamId` | Required process-start identifier; retained across network reconnect, changed on process restart. |
| `seq` | Required positive sequence increasing within a stream; ordering key is `(robotId, streamId, seq)`. |
| `reportedAt` | Required UTC wall-clock report creation time. Backend adds its own receipt time for liveness. |
| `mapKey`, `frameId` | Required loaded-map context; `frameId` is currently `map`. Targets must match that context, not just the same frame name. |
| `pose` | Optional/nullable when unavailable; if present, requires finite `x`, `y` in metres, `yaw` in radians, and `capturedAt`. |
| `pose.capturedAt` | UTC wall-clock time of the represented pose sample, distinct from report creation time. Never refresh it just because a heartbeat is new. |
| `status` | Required execution status: `IDLE`, `NAVIGATING`, `ARRIVED`, `FAILED`, or `UNKNOWN`. |
| `legId` | Required for active-leg state and leg-specific results; otherwise nullable. Correlates an execution attempt, not a whole tour. |
| `localized` | Optional/nullable localization assessment; missing/null means unknown, not ready. TF existence alone cannot establish `true`. |
| `faultCode` | Optional stable fault identifier when available; do not fabricate a fault merely from connection loss. |
| `batteryPercent` | Optional/nullable measured percentage; the physical robot is not assumed to provide it and it is not a mandatory dispatch rule. |

Numeric JSON `seq` must stay within `1..9007199254740991` for exact representation
in the browser; a backend int64 type alone does not guarantee this.

Use `reportedAt` and `pose.capturedAt` to distinguish a recent sync from a stale
pose. R1 must document ROS-time-to-wall-clock conversion. Sequence ordering is
per stream; timestamps are used for freshness and new-stream reconciliation.
Server-side source metadata comes from `Robot.SourceType`; no per-sample
source/version field is required by this MVP.

Execution status is separate from both `Tour.State` and connection/freshness.
`UNKNOWN` means the bridge/robot cannot determine execution, for example after
losing goal information. Backend loss of contact marks its connection view
stale/disconnected; it does not turn a known robot execution report into a new
robot-reported `UNKNOWN` or prove that navigation stopped.

For `ReportCommandResult`, `commandKind` is `GoTo` or `Cancel`, and `phase` is
`ACCEPTED`, `REJECTED`, or `TERMINAL`. `outcome` is required only for `TERMINAL`
and is `ARRIVED`, `CANCELLED`, or `FAILED`; `reason` is optional explanatory
context. Robot identity is supplied by the authenticated current connection.
Correlate by robot, leg, and command kind, distinguishing acceptance from the
later terminal phase. Deduplicate repeated terminal reports while reconciling
one actual terminal leg outcome if both GoTo and Cancel reports arrive.
One logical outcome may be transmitted repeatedly until acknowledged; do not
interpret it as "send TERMINAL only once". Completion of a result invocation is
an acknowledgement only when the handler waits for required processing and
state/event commit. A transport-level send or receipt does not establish that.

```text
Cancel(legId) -> ACCEPTED -> Nav2 terminal result
             -> ReportCommandResult(legId, Cancel, TERMINAL, actual outcome)
             -> IDLE
```

`CANCELLED` is a terminal result, never a `ReportState.status` value. Neither
SignalR send completion, `ACCEPTED`, nor later `IDLE` proves a cancellation.
If arrival precedes effective cancellation, report `ARRIVED`. A result timeout
without a confirmed Nav2 outcome requires reconciliation, not a fabricated
`FAILED`/`CANCELLED`. Retain and resend terminal results until backend processing
is acknowledged; an idle heartbeat cannot replace the result of the exact leg.

### 3.5 ROS mapping and navigation ownership

Production pose uses TF `map -> base_footprint`, combining AMCL global
correction with EKF odometry; `/amcl_pose` is not the sole fleet pose source.
Check transform availability and freshness. Good localization still needs an
explicit readiness criterion, not merely a present TF. The current global TF
tree and multi-robot limitations in Section 2.1 are unchanged.

`GoTo` maps directly to the robot's namespaced Nav2 `NavigateToPose` action
using the backend target pose/map/frame. `Cancel` targets that leg's goal.
`GoToStop.action` and `bus_stops.yaml` stay local/manual development fixtures.
There is exactly one production navigation-goal owner: fleet bridge, local
stop navigator, and RViz must not send competing goals. Keep the existing
Nav2 -> mode manager -> motor path; the backend/bridge never publishes raw
`/cmd_vel`. No ROS interface, Nav2, AMCL, or EKF implementation changes here.

Bind the robot's `mapKey` to its deployed, loaded map through explicit
configuration/validation. Do not copy the requested key from GoTo or derive map
identity merely from the frame name `map`. Reject a mismatched map/frame before
creating a Nav2 goal; `MAP_MISMATCH` is the proposed reason to finalize with DTO
binding. Readiness also requires live/fresh state, no active unresolved leg,
localization readiness, available Nav2, and locally permitted motion (including
E-stop/manual ownership checks). A missing `faultCode` is not positive evidence
of readiness. Proposed diagnostic codes such as `NAV2_UNAVAILABLE`, `TF_STALE`,
and `ESTOP_ENGAGED` need actual local evidence and a mapping contract.

Before physical end-to-end testing, define the initial-pose/operator procedure
and readiness evidence. `set_initial_pose: false` is deliberate; neither an
RViz initial-pose message nor `Route.StartX/Y/Yaw` proves the robot is localized
at that position. This prerequisite does not block the transport-only spike.

### 3.6 HTTPS report lifecycle and M2 command idempotency

- R1 must retry HTTPS report failures with bounded backoff and retain the exact
  report, `streamId`, and sequence until the response is known. A 400 validation
  rejection occurs before storage; after correcting its payload, the same
  sequence may be retried. When a response is uncertain, retry the same body.
  If it is still the latest report, Fleet Sync v1 acknowledges it as a duplicate
  without refreshing liveness. If a later sequence already replaced it, the
  older retry receives `OUT_OF_ORDER` and must be dropped. Idempotency history
  is process-local: if the API restarts first, an uncertain retry may be
  accepted as the first observation with `duplicate: false`. Keep one report in
  flight and retain its exact body until a response arrives; v1 has no durable
  exactly-once delivery.
- A robot bridge process restart creates a new stream at sequence 1 when
  `reportedAt` is at least as new as the previous stream. Sequence values are
  not compared across stream IDs. An API backend restart clears its
  process-local projection and tombstones; a robot bridge that is still running
  keeps its stream and continues at N+1, which the empty store accepts as its
  first observed report. This establishes a fresh ordering baseline and does
  not recover telemetry missed during downtime. While a current stream exists,
  a new non-retired stream must start at sequence 1 (`STREAM_START_REQUIRED`),
  and a stream in the retained retired history remains rejected (`STALE_STREAM`).
  V1 does not replay commands.
- Duplicate `GoTo` with the same leg and target returns existing execution/result
  information without creating a new goal. The same leg with a different target
  is rejected. A busy robot rejects other legs, without automatic preemption or
  an implicit queue.
- `Cancel` is idempotent and leg-specific. A late duplicate GoTo, including one
  arriving after Cancel for that leg, must not revive canceled execution.
- Keep terminal results through reconnect until backend processing is confirmed;
  backend result handling is idempotent and must not advance a tour twice.
- Reconnect sends current execution state for reconciliation before new dispatch.
  Lost execution information after restart requires `UNKNOWN`/reconciliation,
  not blind replay. Backend restart or connection loss must not be mistaken for
  robot-reported execution failure. The robot-local connectivity-loss stop and
  no-auto-resume requirement is in Section 6; its detection budget, crash
  coverage, and recovery mechanism must be validated before physical operation.
  Replaying a persisted intent after bridge restart is not automatically safe:
  in-memory idempotency history may be gone. Reconcile first.

These are M2 application guarantees, not exactly-once delivery or distributed
consensus supplied by HTTPS or SignalR.

**Fleet Commands v1 (implemented, M2.2-d).** `POST /api/fleet/commands/v1/poll` and
`POST /api/fleet/commands/v1/{commandId}/results` follow
[`docs/contracts/fleet-commands/v1/`](contracts/fleet-commands/v1/README.md), with the robot
scheme and the shared `FleetSync` rate limit. Poll needs the robot's current stream heard
within `MaxTelemetryAgeSeconds` (else 409 `STREAM_NOT_CURRENT`); a command delivered to
another stream becomes UNKNOWN and is not redelivered. A new GoTo needs a RUNNING NORMAL
Tour and a dispatchable robot; a Cancel is always delivered, so a robot that lost dispatch
can still be told to stop. `FleetCommands:Enabled = false` gates movement only (M2.2-f):
poll still checks the stream, applies the timeouts and delivers an open Cancel, but hands
out no GoTo; results are always recorded. Neither endpoint answers 503
`COMMAND_TRANSPORT_DISABLED` any more. Backend notes and error codes are in
`backend/docs/fleet-commands.md`.

### 3.7 Fleet authentication and compatibility status

Fleet Sync v1 authenticates each request using the existing
`Robot.CredentialHash` field and a distinct per-robot credential. Credential
verification and the web issue/rotate/revoke lifecycle are implemented in
backend; the one-shot CLI fallback calls the same lifecycle service with a
separate SQL principal. Only the hash is stored; the plaintext is returned once
for issue/rotation, and credential audit records are append-only. TLS is a
deployment requirement. The API runtime does not receive the provisioning
connection string. Full lifecycle and provisioning role instructions and the
client probe are in [`backend/docs/fleet-sync.md`](../backend/docs/fleet-sync.md).
Fleet sync is currently rate-limited before authentication by connection IP.
Before real R1 traffic, configure ASP.NET Core forwarded headers with only the
actual trusted proxy addresses; otherwise robots may all share the proxy's
bucket. Credential failures also consume the pre-auth bucket, so deployments
must test the robot cadence plus retries and separate abuse protection from the
authenticated per-robot reporting budget (or validate an equivalent design).
Until those proxy and capacity conditions are exercised, this limiter is a
blocker for real R1 traffic; controlled single-instance B1 verification can
continue.

`/hubs/operations` accepts Staff-role JWTs at connection time and closes each
connection when its JWT expires. Account deactivation does not immediately
revoke an issued JWT. SignalR browser WebSocket requests may send the JWT as
`access_token` only on that Hub path. `/api/fleet/v1/sync` uses the robot scheme
explicitly and does not accept user JWTs; robot credentials cannot join the
Operations Hub.

The S2/S2B Python SignalR compatibility harness remains evidence about the
tested SignalR clients. It is no longer a gate for HTTP Fleet Sync, and it does
not show that SignalR is impossible. R1 must test the Python HTTPS client,
verified TLS, invalid credentials, retries, process/backend restart, and
sequence continuity. This transport test does not establish physical safety or
a valid robot-local stop budget.


---

## 4. Web-based 3D Operational Digital Twin

The current `web/` project has a React Three Fiber demo canvas and a staff
Digital Twin page; the canvas is not yet connected to a campus model or live
robot poses. The **planned** UI will load the campus model, render robot
models, and visualize backend fleet state: robot identity, pose/heading,
connection and operational state, active tour/leg, fault/health, and battery
only when that telemetry is actually available. Physical, Gazebo, and
synthetic robots should appear through the same backend state view.

Mapping a ROS/backend pose into the Twin world requires an explicit transform
with origin offset, axis conversion, rotation, and scale. Do not scatter a
single hardcoded formula such as `x, -z, yaw` across frontend components. The
campus model should use the same floor-plan/SLAM reference so scale and origin
can be aligned deliberately.

The web twin is not a physics engine, web Nav2 implementation, collision
simulator, LiDAR point-cloud or camera-texture viewer, scenario editor, or
predictive engine.

### Remote viewer and livestream integration boundary

Remote visitors receive a read-only projection of tour progress, robot position,
and POI/narration cues. This is separate from staff control and must not expose
rosters or navigation commands. Audience authorization and exact delivery
endpoint remain to be specified in the viewer integration patch; this decision
does not select group-code authentication or a new Hub.

Livestream is a separate media path, not payload on Fleet Sync or the
operations projection, and is not a camera-texture requirement for the
operational Twin. Staff start/progression checks
need an explicit, testable source of stream availability. Its owner, observation
method, freshness, and manual-confirmation policy must be defined before full
Remote Tour acceptance. A media outage is distinct from loss of the backend
control connection: the existing staff recovery flow can let a navigating leg
finish and hold at the POI on media outage; it does not waive the local
connectivity-loss stop requirement.

The older booking-oriented `web/src/api/contracts/visitor.ts` includes visitor
pause/resume/end calls. Those calls are not an authorized Remote Tour robot
control contract; reconcile that frontend separately without changing it in
this documentation patch. Browser narration/media responsibilities also do not
add audio or head commands to the navigation fleet MVP.

---

## 5. Fleet-scale validation and research

### Local Gazebo display integration

The first executable display integration is a **development-only, read-only,
single-Gazebo-robot** path. It does not use production Fleet Sync v1, implement
fleet commands, dispatch, or provide physical localization evidence.

- Enable backend `SimulationPreview:Enabled=true` in `Development` only.
  Preview endpoints accept loopback connections only; use an SSH tunnel when
  Gazebo/backend run on another computer. They are unavailable by default and
  in Production. No database is required in this explicit preview mode.
- `POST /api/simulation/pose`: JSON fields `robotId` (`robot_01`), `source`
  (`gazebo`), `worldId` (`map3d-preview-v1`), `frameId` (`gazebo_world`),
  `streamId` (bridge-start UUID), `seq` (positive monotonic integer),
  `capturedAt` (UTC wall-clock ISO timestamp), `x`, `y`, `z` (metres),
  `yaw` (radians). This is Gazebo ground truth, **not** AMCL localization.
- `gazebo_preview_bridge` subscribes to `/gazebo/model_states` from
  `libgazebo_ros_state.so`, selects `amr_robot`, and posts at most 10 Hz.
  Its one-slot latest-state buffer bounds memory and keeps HTTP off the ROS
  callback thread. No commands or motor topics are exposed to the browser.
- SignalR `/hubs/simulation` emits `PoseUpdated` with the same fields plus
  backend `receivedAt`. A newly connected client receives the last snapshot.
  Backend rejects invalid, stale (>10 s), future (>5 s), duplicate or reordered
  samples. Sequence order applies within one stream; a restarted stream must
  have a newer capture timestamp. This preview permits one publisher only.
- The web explicitly selects Demo or Gazebo, retries initial connections,
  reconnects, and considers samples stale after 2 s. It never substitutes demo
  poses for missing telemetry. Demo controls cannot command Gazebo.
- Map source: `robot/Map3d/map.obj` + `robot/Map3d/map.mtl`. Deployment copies
  live in `robot/ros2_ws/src/simulation/models/map3d_preview/meshes/` and
  `web/public/models/simulator-map/`. Both use scale `20 / 659.524231`,
  source center X `5.7220155`, source center Z `38.546127`, source floor Y `10`.
  Gazebo is Z-up: `(s*(X-cx), -s*(Z-cz), s*(Y-10))`. The web scene is Y-up:
  `(gazebo.x, gazebo.z, -gazebo.y)` and rotation about scene Y is Gazebo yaw.
  Assets are display-calibrated; this is not measured campus geometry. The
  ground plane fills mesh gaps. The imported mesh supplies static collisions.

Run instructions and behavioral acceptance checks:
`robot/docs/gazebo-web-preview.md`. Ubuntu ROS 2 Humble / Gazebo Classic and
hardware-style physics must still be exercised before claiming behavioral
correctness. The legacy Classic integration is retained, not migrated here.

The external Fleet Emulator belongs in `digital-twin/`; see
[ADR-0004](decisions/0004-external-fleet-emulator.md). Only its executable
scaffold exists today. Its **planned** behavior simulates pose/state
progression toward per-leg `GoTo` targets and supplies controlled multi-robot
load through the same external contract as physical and Gazebo robots. It must
not reference `SmartCampus.Application`,
`SmartCampus.Infrastructure`, or other backend implementation projects. A
shared wire-contract package may be considered later if DTO duplication
becomes a real problem; none is introduced now.

The planned validation environments have distinct claims:

| Environment | Validates | Does not establish |
|---|---|---|
| Physical AMR | Real hardware integration, ROS 2/Nav2, leg execution, and state synchronization | Fleet-scale capacity by itself |
| One Gazebo AMR | Navigation simulation, route testing, and per-leg contract compatibility | Multi-entity fleet load as a core requirement |
| N Fleet Emulator robots | Multi-robot dispatch, concurrent tours, fleet monitoring, and backend/realtime load | Nav2 quality, obstacle avoidance, physical safety, or multi-robot collision avoidance |

Scenario orchestration, what-if analysis, replay engines, predictive
simulation, Isaac Sim, and a stress-test scenario editor are future/stretch
work, not core requirements.

**Research implementation and benchmark execution are deferred until the production
Remote Tour end-to-end path works.** Fleet-scale synchronization research stays
in project scope; it is not a prerequisite for the production transport,
fail-safe, head integration, or tour orchestration work.

The Capstone documents, including the Register's research methodology, remain
authoritative and unchanged. This deferral neither removes nor redefines any
official research requirement. All research-related architecture decisions are
frozen for this milestone: do not reconcile research telemetry rates, latency
metrics or targets, freshness ratio, emulator fleet size, measurement clients,
benchmark SLOs, or the measurement pipeline as part of production work. None
may constrain or block the production end-to-end path. Revisit research
implementation and benchmarking in a separate task after that path works.

---

## 6. Safety boundary

Planned backend/web operations claim a robot at Start and may cancel a tour or
navigation leg; no automatic mid-tour reassignment is part of this flow.
Cloud/web cancellation is not an Emergency Stop and must not be presented as
one. Physical/local emergency-stop and
fail-safe behaviour remain robot-side safety concerns; the real ROS
emergency-stop interfaces are unchanged.

Production physical fleet operation requires a **robot-local stop/inhibit on
backend connectivity loss beyond a validated `T_loss`, with no automatic
resume**. A cloud request cannot provide this guarantee during a partition.
Transport recovery alone must not restart motion; staff recovery requires
reconciled execution, readiness/on-site checks, and a new leg attempt.

Existing layers are insufficient evidence of WAN-loss coverage:

- `robot/ros2_ws/src/robot_control/config/mode_manager.yaml` sets
  `nav_timeout: 0.5` for stale Nav2 velocity input, not backend connectivity.
- The STM32 serial timeout is `CMD_TIMEOUT_MS = 300` in
  `robot/firmware/stm32/motor_controller/Core/Inc/usb_protocol.h`;
  `Protocol_CheckTimeout` calls `Motor_StopAll` after valid serial traffic stops.
  It cannot detect WAN loss while the miniPC continues supplying valid traffic,
  and its constant is not a measured upper bound on physical stopping distance.
- An active Nav2 goal may outlive its fleet action client; bridge crash/orphan
  goal behavior must be tested, not inferred from socket disconnection.

Before the first physical GoTo through the fleet path, a separate robot safety
patch must specify and test the local liveness detector/supervisor, timeout
budget, motion-inhibition path through robot control, and targeted Nav2 goal
cancellation/reconciliation. It must cover silent loss, backend restart, bridge
crash, and startup with unknown goals. A detector inside the bridge alone does
not cover bridge crash. Inhibition must remain effective when action cancellation
is delayed or fails; do not depend solely on a cooperative Nav2 result.
Keep command ownership explicit instead of unconditionally canceling every
goal at bridge startup. No firmware or robot-control implementation changes
are made here.

Choose `T_loss` using transport measurements plus the acceptable stopping budget
and hardware evidence; the Python spike cannot determine safety by itself.
Coordinate backend stale/assistance thresholds with this policy without making
backend stale detection the local safety mechanism. A locally interrupted leg
must retain its cause (connectivity loss, local stop, or navigation fault), not
pretend it received a backend Cancel. Final reason/outcome mapping and recovery
are required in that patch; until termination is known, report uncertainty
rather than manufacturing a terminal result. If ARRIVED occurred before the
interruption took effect, retain that actual outcome. Physical acceptance must
observe motor stopping and no automatic restart, not only successful action RPCs.

`docs/decisions/0049-m2-3-robot-local-safety.md` (accepted, **not implemented**)
specifies that patch. It adds these `robot/`-internal interfaces, all with
relative names under the robot namespace. The existing `emergency_stop` service
and `emergency_stop_state` topic do not change.

| Interface | Type | Publisher / server | Consumer | Step |
|---|---|---|---|---|
| `motion_permit` | `std_msgs/Bool`, RELIABLE, VOLATILE, every 0.2 s | `fleet_bridge`, only when `commands_enabled` | `mode_manager` | 3.1 |
| `motion_gate_state` | `std_msgs/String` (`DISABLED`, `OPEN`, `BLOCKED`, `LATCHED:<reason>`), VOLATILE, 2 Hz | `mode_manager` | `fleet_bridge` | 3.1 |
| `motion_inhibit_reset` | `std_srvs/Trigger` | `mode_manager` | A person on the robot; never `fleet_bridge` or the backend | 3.1 |
| `stm32_link_ok` | `std_msgs/Bool`, RELIABLE, VOLATILE, 20 Hz: `stm32_bridge` may command the wheels | `stm32_bridge` | `mode_manager` (`require_stm32_link`) | Link safety |
| `hardware_estop_state` | `std_msgs/Bool`, from a new field in the FB frame (`robot/docs/PROTOCOL_FB.md`) | `stm32_bridge` | `mode_manager`, `fleet_bridge` | 3.4, input pin not yet confirmed |

New parameters are `require_motion_permit` on `mode_manager` (default `false`)
and `map_package_path` and `map_package_sha256` on `fleet_bridge`. The Fleet Sync
and Fleet Commands contracts do not change: `localized`, `motionReady` and
`faultCode` already exist and start carrying real values.

---

## 7. AI narration and visitor Q&A

POI narration does not require an LLM. The student browser plays approved,
pre-generated narration assets. Private student Q&A follows the browser/cloud
path through STT, LLM and TTS; it is not a robot-to-assistant audio path. V1
uses one project language; multilingual and per-tour language selection are
out of scope.

`robot_perception` and the AI tour-guide assistant remain separate systems:

| Concern | Owner | Runs on | Responsibility |
|---|---|---|---|
| Person perception | WP3, `robot/ros2_ws/src/robot_perception/` | robot miniPC | Timestamped RGB-D person detection; optional, default-off Nav2 SpeedLimit |
| Student AI Q&A | WP4, browser/cloud path and `ai-assistant/` | browser + server/cloud | private STT, LLM and TTS in one project language |

The robot owns navigation, physical sensors, the fleet bridge and rotating-head
hardware. It does not own visitor audio playback or AI narration. The assistant
never publishes `/cmd_vel`, sets Nav2 goals, alters `/speed_limit`, or makes a
movement/safety decision. Student audio/Q&A and livestream use browser/cloud
paths; their final media transports remain undecided.

### 7.1 Student private Q&A contract (implemented; integration verification pending)

Decision record: [ADR-0016](decisions/0016-student-qa-assistant-stack.md).
ADR-0020 supersedes runtime provider/general-answer generation as a target:
Viewer answers must come from the approved bank; providers assist Staff drafting.
Current code below remains the provider-backed implementation contract and is a
gap. StudentQuestionGate is per-session and does not implement the instance-wide
8 executing/20 total admission queue; target latency includes queue waiting.
Target business rules: `docs/requirements/campus-tour-scope.md`, SRS FR-30–34,
BR-18/19, NFR-PERF-04 and NFR-AI-01. The gap register records how the current
text-Q&A contract below differs. Voice/transcript/TTS integration remains later work.

```text
browser --(session cookie)--> backend --(service key)--> ai-assistant --> LLM provider
```

The browser never calls `ai-assistant` or the LLM provider directly. The
backend owns access checks and the POI snapshot; `ai-assistant` is stateless,
has no database access and never receives roster data, email, access codes,
session tokens or account identities.

Implementation: `ai-assistant/` (service), backend
`Features/StudentQuestions/AskStudentQuestionCommand.cs`,
`Infrastructure/Integrations/Assistant/HttpAiAssistantClient.cs` and
`Api/Controllers/StudentQuestionsController.cs`, and the web panel on the invited
Student page (`web/src/features/student/components/LiveStudentAiAssistant.tsx`,
shown only while the Tour is `RUNNING`, in the live view's "Hỏi AI" tab). The labelled demo Tour page keeps its
simulated answers. Voice input is off on the live page until server-side STT
(P1-01).

Backend configuration (opt-in, validated at startup; secrets outside Git):
`AiAssistant:BaseUrl` (absolute http(s) URL of the private assistant) and
`AiAssistant:ServiceKey` (≥ 16 characters, equal to the assistant's
`AI_SERVICE_KEY`). Without `AiAssistant:BaseUrl` the endpoint returns 503
`AI_UNAVAILABLE`. Student sessions also require `Invitations:Enabled` (§3.2.3).

#### Public endpoint (backend)

`POST /api/student/tours/{tourId}/questions`

- Authentication: the per-Tour Student session cookie from §3.2.3. Its path
  scope already covers this URL. The same exact-origin check as the Student
  session mutations applies. No account JWT is accepted or required.
- Request JSON:
  - `questionId`: UUID generated by the browser (idempotency key).
  - `text`: 1–500 characters after Unicode NFC normalization and trimming.
  - `recentTurns`: at most 3 items `{ question, answer }` (each question ≤ 500,
    each answer ≤ 1200 characters), taken only from the same browser session's
    in-memory chat. They are untrusted user text: used only to resolve
    follow-up wording, never as facts, never stored by the server.
- The request has no POI field. The browser cannot choose the context.
- `200` returns `BaseResponse` with
  `{ questionId, answer, outOfScope, poi: { id, name } | null, answeredAt }`.
  `poi` is the POI snapshot taken when the question was accepted; `null`
  means general campus context.
- Errors use `BaseResponse` with `Errors.code` where shown:

| Status | Code | Meaning |
|---|---|---|
| 400 | (validation errors, existing `BaseResponse` format) | Empty/too long text, missing/empty `questionId`, too many or too long turns |
| 401 | — | No, expired, closed or revoked session; same generic body as §3.2.3 |
| 409 | `TOUR_NOT_RUNNING` | Tour is not `RUNNING` at acceptance or at answer time |
| 409 | `QUESTION_ID_REUSED` | Same `questionId` with different text |
| 429 | `RATE_LIMITED` | More than 6 questions/minute or a second in-flight question for this session |
| 503 | `AI_UNAVAILABLE` | Assistant unreachable, overloaded or its circuit is open |
| 504 | `AI_TIMEOUT` | No assistant answer within the backend budget |

Processing order:

1. Validate the request and the session; check invitation not revoked or
   expired and Tour `RUNNING`.
2. Snapshot the current POI from authoritative Tour progress (§3.2): the POI
   of `Tours.CurrentRouteStopId` while the Tour is `RUNNING` and `CurrentStep`
   is `PREPARING_VIEW` or `OBSERVING` (the robot is at the stop); otherwise
   `null` (general context), including while navigating and until the dispatch
   use cases write progress. The snapshot includes the POI's approved `Name`,
   `Description` and `NarrationText` only.
3. Call `ai-assistant` with the backend budget (below).
4. Re-check session, invitation and Tour state. If access ended while the
   assistant was working, discard the answer and return 401/409, never the
   late answer.

Idempotency: a repeat of the same session + `questionId` + text returns the
first result without a second assistant call, from a bounded in-memory
backend cache (10-minute TTL). Nothing is persisted: no question/answer table,
no audit row containing text. One backend instance is assumed for V1; a
multi-instance deployment needs a shared idempotency store first.

Backend hardening (2026-10-19): cache lookup and session reservation are atomic.
Null recent-turn items return validation 400 before mapping; upstream replies
must contain a nonblank answer of at most 1200 characters and an explicit boolean
outOfScope. The backend reads at most 32 KiB of response bytes, even without a
Content-Length, under a 20 s deadline covering headers and body. Invalid/oversized
replies return 503 AI_UNAVAILABLE. Caller cancellation propagates. Safe telemetry
records internal requestId, status, outcome and duration; the
`SmartCampus.Assistant` meter exposes `assistant.duration` in milliseconds.

A `DIEM_XEM_CHUNG` session may ask questions. The answer is private to that
session but visible to everyone in that room; the web labels it as shared.

#### Internal endpoint (ai-assistant)

`POST /v1/answer`, reachable only on the private network (no CORS, no public
route).

- Header `Authorization: Bearer <service key>`. Backend secret
  `AiAssistant:ServiceKey`, assistant environment variable `AI_SERVICE_KEY`.
  Wrong or missing key → 401.
- Request JSON: `{ requestId, question, recentTurns, poi: { id, name,
  description, narrationText } | null, language: "vi" }`. `requestId` is a
  new UUID per backend call, not the browser `questionId`.
- `200` JSON: `{ answer, outOfScope, usedSources: string[], contentVersion }`.
  `usedSources` are content-pack titles or the POI name, for diagnostics and
  evaluation; `contentVersion` identifies the approved content pack.
- Errors: 400 invalid request; 503 provider unavailable, circuit open or
  concurrency limit reached (returned immediately, no unbounded queue); 504
  provider timeout. The backend maps 503/504 to the public codes above.
- `GET /health` returns `200 { status: "ok", contentVersion }` without calling
  the LLM provider.

#### Budgets and limits

| Item | Value |
|---|---|
| Browser wait before showing timeout | 30 s |
| Backend → assistant total budget | 20 s |
| Assistant total budget per request | 18 s |
| One LLM attempt | ≤ 15 s; one retry only for connection errors/5xx when ≥ 5 s budget remains |
| Question length | 500 characters |
| Recent turns | 3 |
| Answer length | ≤ 1200 characters (truncated at a sentence boundary) |
| Per session | 6 questions/minute, 1 in flight |
| Assistant concurrent LLM calls | configurable, default 8 |

Values are current implementation settings to evaluate against SRS NFR-PERF-04
and NFR-CAP-01, not measured
capacity.

#### Answer rules (enforced in `ai-assistant`)

- Answers use only the POI snapshot and the approved content pack in
  `ai-assistant/content/`. Missing information yields `outOfScope: true` with
  a polite "not available" answer and 1–2 suggested in-scope questions.
- No invented numbers, links, names or schedules; links not present in the
  content are removed.
- Requests to move, stop or steer the robot are refused with a fixed answer
  without calling the LLM. The assistant never issues or proxies any robot
  command (§6, §7).
- Instructions inside the question or `recentTurns` never override the system
  rules (prompt-injection resistance).
- Identical questions without `recentTurns` for the same POI and
  `contentVersion` may be served from an answer cache; cache keys and values
  contain no personal data.

#### Failure behavior

Q&A failure only affects Q&A. Livestream, map, narration and robot operation
never wait on the assistant. The web shows a retry action and keeps earlier
answers; it does not retry automatically. V1 configures one LLM provider; when
it fails the public API returns 503/504. A secondary provider can be added by
configuration through the provider adapter without changing this contract.

#### Logging and privacy

Neither backend nor assistant logs question text, answers, `recentTurns`,
cookies, service keys or provider request/response bodies. Logs and metrics
keep `requestId`, latency, status, error class, cache hit and `outOfScope`
only (ADR-0011). The LLM provider is an external processor; see ADR-0016 for
the data-use condition of the provider tier.

---

## 8. Deployment

| Unit | Built by | Deployed how | Target |
|---|---|---|---|
| `robot/` ROS 2 physical runtime | Ubuntu 22.04 + ROS 2 Humble on miniPC | `robot/scripts/install-native`, `robot/scripts/build-native`, then native launch files | robot miniPC |
| `robot/` Docker profiles | GitHub Actions / local Docker | `docker compose --profile debug` or `--profile sim` | development/simulation only |
| `robot/` firmware | GitHub Actions (compile only) | manual ST-Link flash | STM32G431 |
| `digital-twin/` | <!-- TODO(WP4) --> | service/container | simulation workstation/server |
| `backend/` | .NET 10 API (`backend/Dockerfile`); separately versioned DB bootstrap/upgrade tool (`backend/Dockerfile.db-init`) | `backend/docker-compose.yml`: HTTPS API + pinned SQL Server and persistent volume; `backend/docker-compose.db-init.yml` is explicit opt-in only | one x86_64 AWS EC2 |
| `ai-assistant/` | Python 3.11+ / Starlette (ADR-0016); `ai-assistant/scripts/verify` in CI; image TODO(WP4) | container image, private network only | server/cloud, not robot miniPC |
| `web/` | Vercel (git integration) | auto-deploy on push | Vercel, one project |

CI never flashes the STM32 and the miniPC never auto-flashes it; see
[ADR-0002](decisions/0002-manual-stlink-flash-no-can-bootloader.md).

### Backend EC2 deployment

Backend CI smoke-tests and publishes private GHCR digests with a verified release
manifest. A successful push/main Backend Verify automatically triggers Backend
Deploy; superseded automatic releases are skipped. Application delivery also
supports manual dispatch; SQL maintenance remains manual. Both reference
`production` and share deployment concurrency. Authenticated source bundles and
pinned OpenSSH are shared with the trusted-workstation CLI; AWS OIDC/SSM is not required. EC2
receives Compose/operations files and temporary registry auth, without retaining
a GitHub PAT. The deploy identity is root-equivalent; host pins, network access
and GitHub environment eligibility are operator prerequisites. Verified off-host
backups support AWS S3 or a dedicated HTTPS S3-compatible endpoint/profile
independent of AWS IAM. Schema/readiness, ownership and API rollback guards remain.

`backend/docs/ec2-deployment.md` records configuration, TLS, secrets, initial Admin,
backup and smoke-test commands for the single-instance deployment. Kestrel
terminates TLS on container port 8443, published as host 443; the API runs as a
non-root user. SQL Server 2022 Express is the default edition, uses a persistent
named volume and an internal Docker network, and publishes no host database port.
The API has a separate outbound network for invitation delivery.

The API deployment never migrates the schema or changes the SQL Server engine.
It runs the separately versioned `db-init` tool in read-only `--check-only`
mode before promoting only the API container. Fresh bootstrap uses an explicit
`--bootstrap` operation against an empty database. Existing data upgrades use
the separately locked Backend Database Schema Upgrade workflow: it takes and
verifies a full backup, applies ordered additive Database First patches, checks
the resulting v1.4 structure and runtime grants, and retains the original
bootstrap hash while recording the application schema version. Backend Deploy
runs that same step first in `--if-needed` mode: it backs up and upgrades or
regrants only when the release DB tool's read-only check rejects the live
database, and is a no-op otherwise. The distinct
Backend SQL Maintenance workflow changes only the pinned SQL Server engine and
resource settings. All three operations share the production host/deploy lock.
Unknown schemas fail closed. Runtime permissions preserve append-only AuditLogs/TourEvents, grant writes for current
implemented features: Route/RouteStops CRUD, Tour INSERT/UPDATE without DELETE,
and `Robots` SELECT/INSERT plus column-level credential lifecycle and
first-accepted confirmation UPDATE. Runtime has no whole-table `Robots`
UPDATE/DELETE. The separate credential provisioner shares lifecycle logic,
uses its own column-scoped grants, and appends audit rows without rewriting
them. Existing v1.4/v1.5/v1.6 databases require the controlled upgrade/regrant to
v1.7 and read-only check-only gate before an API release that needs this schema.
The check-only gate does not change database state.
The deployment adds two anonymous operational routes: `GET /health/live`
returns 204 when the API process can serve a request; `GET /health/ready`
performs a SQL connectivity check with a three-second timeout and returns 200
with `{ "status": "ready" }` or a generic 503. Neither route returns connection
details. Compose and deployment use readiness; liveness is useful to distinguish
an API process from an API with a database outage. These routes do not change
the database schema, and no migration is run during deployment. Docker smoke
testing and real EC2/browser TLS and resource validation remain separate from
the normal backend verification script.

API documentation is opt-in: `GET /openapi/v1.json` (OpenAPI 3.1) and Swagger
UI under `/swagger` are mapped when `ApiDocumentation:Enabled` is true, which
defaults to Development only; otherwise both return 404. Outside Development
enabling them requires a shared Basic credential
(`ApiDocumentation:Username`/`Password`) that covers only those two paths and
grants no API access. Business authentication, authorization, CORS and rate
limits are unchanged. Configuration and exposure trade-offs are in
`backend/docs/api-documentation.md`.


### Physical robot deployment

The single physical robot has one native ROS 2 runtime owner on the miniPC. Base/odom, STM32 bridge, LiDAR, EKF, localization and Nav2 are built and launched from `robot/ros2_ws` on Ubuntu 22.04. Astra USB setup is a separate native host step, and camera/perception are opt-in after the LiDAR-only baseline. Docker is retained for CI image reproducibility, laptop inspection and Gazebo simulation; the compose file has no hardware service.

**Robot DDS boundary (designed, not yet applied on the robot).** A remote DDS
subscriber can block robot publishers during Wi-Fi roaming (Nav2 Baseline V1,
limit 1), and the robot's DDS graph has no authentication. The planned switch-over
in [robot/docs/dds-isolation.md](../robot/docs/dds-isolation.md) closes the robot's
DDS graph to the network (loopback-only discovery server and nodes). Remote
inspection then goes through an SSH tunnel to two robot-loopback ports: a
read-only `foxglove_bridge` and `initialpose_guard`, the only remote write. That
write is the initial pose, accepted only while the robot is stationary with no
active goal. Laptops render in their own local DDS graph (RViz2). No other work
package uses DDS to reach the robot: the backend and the Twin use `fleet_bridge`
over HTTPS Fleet Sync (Section 3.1), which runs on the robot and is unaffected. Once this
boundary is applied, laptop access by `ROS_DISCOVERY_SERVER`/`remote_rviz` stops
working.

### Route revision and manual verification API (backend)

As of schema v1.3, `Routes` remains the shared identity table and uses
`AuthoringMode` to isolate existing `LEGACY` Route/RouteStops CRUD from new
`VERSIONED` route preparation. Legacy APIs list and load only legacy rows; the
new endpoints are documented in
[`backend/docs/route-revisions.md`](../backend/docs/route-revisions.md).
Staff writes immutable `RouteRevisions` and ordered stops linked to exact map
and POI revisions plus source POI PASS evidence. `GET /api/routes` lists only
current VERSIONED revisions, including drafts, with search, sort, paging and
optional exact map-version and `isActive` filtering; the legacy catalog remains separate.
Each view carries `isActive` and an opaque `rowVersion` (ADR-0037). Tour create and
slots refuse an inactive route with 409 `ROUTE_UNAVAILABLE`. A revision also carries
`scheduleFit` (`UNKNOWN`, `FITS`, `OVER_RECOMMENDED`, `TOO_LONG_FOR_SHIFT`) and
`expectedDurationSeconds`. Saving a revision returns 409 `ROUTE_STOP_TOO_CLOSE` or
`ROUTE_TOO_LONG_FOR_SHIFT` (`docs/lich-tour-theo-ca.md`).
Submission receipts are separate from draft creation. Technical Staff appends
manual whole-route test runs with an explicit distinct active Staff participant
whose single persisted role resolves through `ApplicationRoles`. The technical
test path uses the same transaction-owned robot deployment application lock as
map deployment/POI checks and confirms the robot's latest cross-map deployment
record matches the selected map ID and SHA-256.

The current route navigation fingerprint comprises exact map ID/checksum,
start/end pose, ordered POI navigation fingerprints, camera presets and
head-step configuration. Dwell is excluded from navigation identity but is
recomputed for every revision's incomplete duration projection. Historical
revision/run hashes are preserved; compatibility is established from their
immutable map/pose/ordered-stop/camera/head-step snapshots. The newest
whole-route result for the same navigation configuration is effective, while
unrelated configurations retain their outcomes. Evidence is human-entered, not
automatic physical proof; manual PASS is not tour scheduling, reservation,
READY, or movement authorization. Approved narration/audio duration is not yet
linked to versioned POI content, so API duration is explicitly incomplete and
reports the dwell subtotal only. Branch authoring, branch requests/cutoff,
project POI YAML/frame mapping, Tour runtime and command transport remain staged
or pending. See ADR-0023. ERD, preparation sequence and verification-state
diagrams require member redraw/review and remain pending.
