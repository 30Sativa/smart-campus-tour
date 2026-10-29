# PWA workflow target — SRS v0.2

Updated 2026-10-28 from Report 3 SRS v0.2 aligned to Phiếu v1.9 and ADR-0028.
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
| SCR-ADMIN | Admin | Manage accounts, configuration and administrative audit; one supported role/account |
| SCR-TECH-MAP | Technical Staff | Upload a new or existing area version; use the complete area catalog, then choose any registered physical robot for manual deployment/localization evidence. A new PASS requires first accepted Fleet Sync under its current credential; FAIL remains available before confirmation. Keep upload distinct from check result. |
| SCR-TECH-ROBOT | Technical Staff | Register a physical robot identity using RobotCode and display name; an operator separately provisions/configures its key and RobotContexts, then starts the bridge. Show first accepted connection context and latest in-memory sync. Registration itself does not connect or provision the robot. |
| SCR-TECH-POI | Technical Staff | Import unverified POIs; verify exact POI/route revisions; project YAML/frame mapping pending |
| SCR-STAFF-CONTENT | Staff | Propose POIs, compose route revisions, approve Q&A/narration/fallback; no technical confirmation |
| SCR-STAFF-REVIEW | Staff | Decide pending rows and requested email changes; tour SCHEDULED; ≤2-working-day target |
| SCR-REP | Representative | Own registration/rows, status, email-change/branch requests; server ownership/cutoff checks |
| SCR-INVITATION | Representative / Staff | Own rows / managed tours; accepted row; resend/reissue/revoke semantics differ |
| SCR-SCHEDULE | Staff | Schedule, assign Operator, reserve robot, READY/reopen/reschedule/cancel; exact confirmation and no pending decisions |
| SCR-OPS-TWIN | Assigned Staff Operator | Preflight/Start and guarded operation; role alone is insufficient |
| SCR-VIEWER-QA | Viewer session | Join/wait/live/map/fallback/Q&A/result according to current credential/session/Tour state |

Safety attendant has no separate account/screen. TechnicalStaff account login
alone does not mean SCR-TECH-MAP/SCR-TECH-POI exists. Research produces benchmark
artifacts, not a new research workspace.

## 2. Preparation and tour lifecycle

Technical registers the physical robot identity → operator provisions the key
and matching RobotContexts and configures MiniPC bridge → a valid accepted Fleet
Sync confirms backend contact → creates map externally → uploads immutable
version → manually deploys and verifies localization/display on a selected
registered physical robot → only then Staff proposes/submits POIs /
Technical imports or verifies POIs
(unverified) → Technical verifies POIs → Staff composes route/content →
Technical + assigned Operator test exact tuple → Staff schedules and reserves
15min + longest permitted path +15min → review all row/email decisions →
READY locks route/content/list → preflight at published time → Start while READY
→ validate guards/claim robot/commit RUNNING → dispatch first leg.

**Diagram follow-up:** redraw the workflow diagram to include provisioning and
accepted Fleet Sync before a new map-check PASS, and keep the manual map check
before Staff POI proposal/submission. No editable diagram source is checked in
to this repository; the external workflow illustration still needs redraw.

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
End Early: CANCELLED with actor/time/reason; all Tour media/Q&A revoked; pending
branches expired; active mission cancellation requested; later motion blocked;
accepted groups notified/audited. Robot stop/inspection evidence remains separate.

Pending F-14 cannot appear as a generally enabled Admin action. Branch cutoff
remains conflicting (before Tour departure vs before leaving branch point);
preserve the decision issue rather than drawing one settled guard.

## 6. Integration status and frontend follow-up

Current backend contracts still expose Admin business endpoints and old
whole-registration access rules. The gap register states migration dependencies.
TechnicalStaff is now a canonical JSON/JWT value; frontend must add it to its
role type, label, account creation/listing and role guards, with an honest
workspace-unavailable state until the Technical feature slice ships.
Keep it out of Admin/Staff/Representative guards and do not add Operator/Viewer
account roles. No frontend implementation or diagram completion is asserted.
