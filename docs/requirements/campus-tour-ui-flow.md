# PWA workflow target — SRS v0.2

Updated 2026-10-29 from Report 3 SRS v0.2 aligned to Phiếu v1.9, ADR-0028 and ADR-0029.
[Detailed scope](campus-tour-scope.md) governs business rules; this is a workflow
projection, not an implementation or diagram-completion claim. Historical
Review 1 flow is preserved in Git at `e70fb52`. Repo business succession is
[ADR-0020](../decisions/0020-srs-v02-business-baseline-and-technical-staff.md).
The technical map check must pass before Staff can prepare or submit a POI.

## 1. Defined screens and guards

Use the SRS screen IDs exactly; components need not be separate routes.

| Screen | Actor | Target action and guard |
|---|---|---|
| SCR-PUBLIC | Public | Entry information; no registration or invitation/session authority from URL |
| SCR-ADMIN | Admin | Manage accounts, configuration and administrative audit; one supported role/account. The "Lịch vận hành" page closes a day or one shift with a reason, and reopens it (`docs/lich-tour-theo-ca.md`) |
| SCR-TECH-MAP | Technical Staff | Upload a new or existing area version; use the complete area catalog, then choose any registered physical robot for manual deployment/localization evidence. A new PASS requires first accepted Fleet Sync under its current credential; FAIL remains available before confirmation. Keep upload distinct from check result. |
| SCR-TECH-ROBOT | Technical Staff | Register a PHYSICAL identity using RobotCode and display name. Registration can be prepared independently of map creation/upload and does not require an online robot. Show persisted first accepted connection context separately from the latest in-memory sync; refresh while keeping map-check inputs. Credential provisioning and bridge setup remain separate deployment duties. |
| SCR-TECH-POI | Technical Staff | Import robot pose-capture files (ADR-0038); verify exact POI/route revisions; project YAML templates/frame mapping pending. A test run of a voting route (ADR-0065) first records the stop order actually driven (it starts with the first POI and names every POI once); the route view shows how many required legs are covered and lists the missing legs ("Điểm bắt đầu"/"Điểm kết thúc" for the start and end) until PASS runs cover them all, and shows `LEGS_INCOMPLETE` meanwhile. Filter POIs by pending, recheck and passed; a recorded result opens read-only with its history and offers no second result or withdrawal. A rejected revision shows it is waiting for Staff |
| SCR-STAFF-CONTENT | Staff | Propose POIs, compose route revisions, approve Q&A/narration/fallback; no technical confirmation. Narration (ADR-0060): any Staff writes a POI draft, another Staff than its last editor approves it ("Duyệt bởi … lúc …"); route authoring accepts only POIs with approved narration (409 `POI_NARRATION_NOT_APPROVED`). Backend done, screens pending. Route authoring offers only maps with current technical evidence and at least one passed POI (ADR-0033); stop order is explicit and the saved revision states its next step. The route form has the flag "Cho Viewer chọn điểm tiếp theo" (ADR-0065: 3–4 POIs, first POI fixed, dwell ≥30 s) and offers only two end choices, "Dừng tại điểm dừng cuối" and "Quay về điểm bắt đầu"; "Về một vị trí riêng" is no longer offered for a new save, a flagged route must return to the start, and each 409 (`ROUTE_END_POSE_NOT_START`, `ROUTE_VOTE_STOP_COUNT`, `ROUTE_VOTE_DWELL_TOO_SHORT`, `ROUTE_VOTE_END_MUST_RETURN`) shows its Vietnamese message |
| SCR-STAFF-TOUR | Staff | Create a Tour from a tested route revision, one physical robot and one Operator, then chọn ngày rồi chọn một ca còn trống, and review the duration, robot hold and registration close before saving (ADR-0034, ADR-0035, `docs/lich-tour-theo-ca.md`); a locked shift shows why, and a clash at save refreshes the shifts. Time, route and robot change only by cancelling and recreating |
| SCR-STAFF-REVIEW | Staff | Decide pending rows and requested email changes; tour SCHEDULED; ≤2-working-day target |
| SCR-REP | Representative | Own registration/rows, status, email-change requests; server ownership checks. No branch request (replaced by the Viewer vote, ADR-0065) |
| SCR-INVITATION | Representative / Staff | Own rows / managed tours; accepted row; resend/reissue/revoke semantics differ |
| SCR-SCHEDULE | Staff | Schedule, assign Operator, reserve robot, READY/reopen/reschedule/cancel; exact confirmation and no pending decisions |
| SCR-OPS-TWIN | Assigned Staff Operator | Preflight/Start and guarded operation; role alone is insufficient. On a voting route: ballot panel, Next labelled with the server's next target, lock/unlock with reason, "Bỏ qua các điểm còn lại" only when every remaining POI is locked (§5) |
| SCR-VIEWER-QA | Viewer session | Join/wait/live/map/fallback/Q&A/result according to current credential/session/Tour state; on a voting route also the next-POI ballot (§4) |

Safety attendant has no separate account/screen. TechnicalStaff account login
alone does not mean SCR-TECH-MAP/SCR-TECH-POI exists. Research produces benchmark
artifacts, not a new research workspace.

## 2. Preparation and tour lifecycle

Prepare independently: register the physical robot identity and create the map
with robot tools → upload the immutable map version → obtain its `mapKey` → the
responsible technical/deployment operator provisions the current credential,
assigns the map version to the robot in the Technical web console, and configures
the MiniPC bridge from that assignment → send a valid
Fleet Sync report → physically check the map and record manual localization /
display evidence → a new deployment-check PASS is allowed → Staff creates POIs.
Robot registration and map upload can happen in either order; this guide does
not add an API prerequisite to configuration or sync. Do not require the map to
PASS before configuring or syncing. Confirmation records the first accepted
sync in the current credential period; stored map/frame are historical
context. A valid report timestamp does not verify NTP, and confirmation does
not prove the robot loaded the named map file or is safe. Persisted confirmation
and current online freshness are separate. Provisioning responsibility does
not grant Staff Operator any SQL permission.
(unverified) → Technical verifies POIs → Staff composes route/content while the
map keeps current technical evidence (ADR-0033) →
Technical + assigned Operator test exact tuple → Staff schedules and reserves
15min + longest permitted path (on a voting route the longest vote order) +15min → review all row/email decisions →
READY locks route/content/list → preflight at published time → Start while READY
→ validate guards/claim robot/commit RUNNING → dispatch first leg.

**Diagram follow-up:** pending redraw. Add parallel preparation branches for
robot registration and map creation/upload; after upload show `mapKey` passed
to deployment provisioning; add current-key valid-sync guard before a new map
check PASS; show physical map observation before PASS and Staff POI creation
after PASS. Include separate persisted confirmation and live-sync freshness
states. This is guidance, not an API dependency between upload and setup.

Saving or activating catalog data is not physical confirmation. A new
movement-affecting revision requires retest; retained tested configuration stays
eligible. Content-only changes recalculate dwell/duration. Denial explains
failed guards and sends no command; UI disabled controls are not authorization.

## 3. Registration and email changes

Representative selects open Tour (>48h before start) → submits ≤10 individual/
shared-screen rows → pending seat holds → Staff row review → accepted row receives
code/delivery status. One registration per Representative/Tour.

Add/remove/replace uses stable row comparison. Unchanged accepted rows keep
identity, code and current session even while new rows are pending. Removal
revokes only that row and releases its seat. Do not show a blanket
"list replaced, all codes expired" message.

For accepted-row email correction: Representative proposes address →
pending request (old email/code remain usable) → Staff accepts/rejects with
reason → acceptance changes the affected row and rotates/revokes its old
code/session atomically; rejection preserves existing access.
A direct Admin-to-Staff attribute replacement is not this workflow.

## 4. Invitations, Viewer and media

Ordinary URL → valid session restored or enter access code → one browser session
→ waiting room → authorized RUNNING content. Same-device network reconnect
within 2min returns to the current point; second active device is refused.
Wrong-code attempts are limited at server; configured defaults remain TBD.
Resend uses same approved email/code and keeps session; reissue rotates code;
revoke removes access. Delivery failure never creates/removes participation.

Viewer receives shared live/avatar/narration, actual-robot 2D map and private
approved-bank Q&A. No Viewer account, arbitrary destination, robot/head control
or access to another person's Q&A/roster. One shared-screen invitation is one
viewing point, not a count of room spectators.

**Next-POI ballot (ADR-0065).** On a voting route, when the robot arrives at a
POI with at least two open candidates, the Viewer page shows the candidates with
their vote counts and a countdown to `closesAt` (the dwell end). The invitation
row votes once and may change its vote until the ballot closes; the page marks
its own choice and survives reload without losing or adding a vote. A locked POI
is shown as locked with the Operator's reason. When the ballot closes the page
states the decision and why: most votes, a tie or no votes going to the earlier
POI in route order, a re-decision because the chosen POI was locked, or the only
remaining POI. The 2D map marks each POI visited, skipped, current, next or
remaining and shows locked ones. A refused vote (`VOTE_CLOSED`,
`VOTE_CANDIDATE_INVALID`) refreshes the ballot. Viewers cannot skip a POI, choose
one outside the route or end the Tour.

During fallback: label prerecorded media, mute live audio/pause dwell, map keeps
the actual robot; return to live at a waiting POI and replay that guide.
Revoke/reissue must stop existing/copied-URL playback ≤10s.
After End Early: Ended/Result only; no live, fallback or Q&A.

## 5. Staff operation and incidents

Only the assigned Operator operates. Start/Next/recovery movement require
telemetry age ≤2s, no incident, no unresolved command, connected console and
present attendant. Two people and physical safety gate precede outside viewers.
Current creator field is not operator assignment.

Incident: safety stop → fallback → one state-appropriate recovery → End Early
when unsafe/unrecoverable. No automatic resume after restart.
End Early: CANCELLED with actor/time/reason; all Tour media/Q&A revoked; an open
next-POI ballot closed; active mission cancellation requested; later motion blocked;
accepted groups notified/audited. Robot stop/inspection evidence remains separate.

Pending F-14 cannot appear as a generally enabled Admin action.

**Voting route operation (ADR-0065).** The Operator sees the same ballot as the
Viewers with the leading POI. The Next button names the server's next target,
for example "Đi tới C", or the end after the last POI; the Operator never picks
or changes it. With auto-advance on the robot leaves at the dwell end for the decided POI;
turning it off holds the robot until Next. The Operator may lock or unlock a POI
not yet visited, always entering a reason that every Viewer sees; locking during
a ballot removes that POI and its votes. When only locked POIs remain, Next and
auto-advance are refused (`ALL_REMAINING_STOPS_LOCKED`): the Operator unlocks one
or uses "Bỏ qua các điểm còn lại" to go to the end. Skip is refused
(`SKIP_NOT_ALLOWED`) while an unlocked POI remains; a lock or unlock outside the
rules is refused with `STOP_LOCK_INVALID`. The branch-request cutoff question is
closed; there is no Representative branch request.

## 6. Integration status and frontend follow-up

Current backend contracts still expose Admin business endpoints and old
whole-registration access rules. The gap register states migration dependencies.
TechnicalStaff is a canonical JSON/JWT value and the Technical robot/map pages
are implemented, including physical robot registration and refreshing connection
status during a map check. Other migration-dependent account administration and
business endpoints remain as described by the gap register. Keep TechnicalStaff
out of Admin/Staff/Representative guards and do not add Operator/Viewer account
roles. This workflow projection does not claim diagram completion.
