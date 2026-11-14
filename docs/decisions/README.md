# Decision Records

One file per accepted architecture or product decision that someone will later
ask "why is it like this?" about. Requirements, review feedback, and unresolved
proposals belong in `docs/requirements/` or the relevant review artifact, not
in this index.

## Format

```
NNNN-short-slug.md

# ADR-NNNN: Title

## Context      what forced a choice
## Decision     what we chose (present tense, not "we will")
## Consequences positive / negative, honestly
```

## When to write one

Write an ADR when the decision:

- constrains how other people write code (a layering rule, a sensor hierarchy),
- would be expensive to reverse (database choice, deployment model),
- looks wrong at first glance and needs its reason recorded, or
- was argued about.

Do **not** write one for: renaming a function, fixing a bug, adding a button,
adding a test, bumping a patch version.

## Index

Business target succession is scoped by ADR-0020. Original decisions/dates below
are retained; their superseded business portions are historical, while current
API/SQL facts and retained technical decisions remain explicit in each notice.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-lidar-primary-astra-supplementary.md) | LiDAR is the navigation backbone; the Astra Pro is supplementary | accepted |
| [0002](0002-manual-stlink-flash-no-can-bootloader.md) | STM32 firmware is flashed manually over ST-Link | accepted |
| [0003](0003-deploy-robot-via-docker-image.md) | Historical Docker physical deployment (superseded by native runtime) | superseded for physical runtime |
| [0004](0004-external-fleet-emulator.md) | Use an external Fleet Emulator for fleet-scale validation | accepted |
| [0005](0005-backend-authoritative-poi-per-leg-orchestration.md) | Backend owns authoritative POI navigation targets and per-leg tour orchestration | accepted |
| [0006](0006-demo-first-tour-schema.md) | Use the v1.0 demo-first SQL Server schema as the Database First persistence source | superseded for the current schema by ADR-0012 |
| [0007](0007-smac2d-rpp-no-autonomous-reverse.md) | SmacPlanner2D + Regulated Pure Pursuit, with autonomous reverse disabled | accepted |
| [0008](0008-production-fleet-transport.md) | SignalR fleet transport, separate Hubs, and navigation MVP semantics | superseded for robot transport by ADR-0019; M2 semantics retained |
| [0009](0009-review-1-tour-business-scope.md) | Review 1: shared viewing rows, invitations, POI content, branches, Start time, fallback and audit | accepted by team; implementation pending; GVHD review at Review 2 |
| [0010](0010-personal-access-code-entry.md) | Email a Tour page link and personal access code; enter code to create a browser session; resend versus revoke/reissue | accepted by team; supersedes ADR-0009 secret-link entry; implementation pending |
| [0011](0011-student-data-use-for-tour.md) | Use student data only for Tour registration, invitations, and operational statistics; no post-Tour admissions contact | accepted by team; implementation pending |
| [0012](0012-v1-1-schema-and-operation-scope.md) | v1.1 SQL snapshot, fixed seeded dwell, all Staff operate all Tours, stop references and append-only audit | accepted by team; applied/scaffolded locally; use cases pending |
| [0013](0013-single-application-role-per-account.md) | Auth/Web V1 supports exactly one supported application role per account | accepted by team; GVHD review at Review 2 |
| [0014](0014-admin-poi-management.md) | Admin manages POI content and only edits geometry before route/history use | implementation scope authorized; group/GVHD review at Review 2 |
| [0015](0015-invitation-issuance-and-resend-email.md) | Secure invitation codes, Resend queue and minimal Student entry | implementation scope authorized; opt-in configuration required |
| [0016](0016-student-qa-assistant-stack.md) | Backend-mediated Student Q&A; Python/FastAPI assistant; Gemini via provider adapter; approved content pack | accepted by team; implementation pending |
| [0017](0017-admin-route-management.md) | Admin Route CRUD; frozen referenced itineraries; CRUD, bootstrap seed and technical import boundaries | owner-authorized implementation scope; supersedes seed-only Route/dwell portions of 0009/0012 |
| [0018](0018-admin-tour-management.md) | Backend SCHEDULED Tour CRUD, durable retries and pre-Start cancellation with access revocation | owner-authorized implementation scope; no runtime or frontend integration |
| [0019](0019-https-fleet-sync.md) | HTTPS Fleet Sync v1 telemetry with per-robot credentials and Staff operations projection | selected for M0/B1 implementation; group confirmation and physical readiness remain pending |

| [0020](0020-srs-v02-business-baseline-and-technical-staff.md) | SRS v0.2 target adoption, scoped business succession and TechnicalStaff account foundation | owner-authorized; limited account slice implemented; other gaps/pending decisions retained |
| [0021](0021-map-package-and-poi-verification.md) | ROS map package versions, manual deployment records and per-POI Technical Staff verification | owner-authorized backend slice implemented; physical acceptance, route tests and frontend remain pending |
| [0022](0022-staff-owns-tour-preparation-history.md) | Historical group decision assigning Tour preparation to Staff; superseded as target by ADR-0020 | historical; original advisor review remains pending |
| [0023](0023-versioned-routes-and-manual-route-verification.md) | Immutable fixed-route revisions and append-only manual whole-route test evidence | owner-authorized backend slice; physical execution, frontend and remaining lifecycle are out of scope |
| [0024](0024-versioned-tour-scheduling-blockers.md) | Fail-closed boundary for versioned Tour scheduling until duration and readiness evidence sources exist | owner-authorized implementation boundary; no scheduling/reservation/READY endpoint is claimed |
| [0025](0025-web-staff-preparation-routes.md) | Web routes: Tour preparation at `/staff/manage/*`, Admin keeps Accounts/Roles, Technical Staff at `/technical/*`; old `/admin` URLs redirect | implemented in web; backend authorization migration (W1) pending |
| [0026](0026-row-level-registration-and-email-change.md) | Stable per-row participation, review, email change and invitation/session access | owner-authorized Wave C backend slice; global capacity, workday calendar, READY integration and UI remain pending |
| [0027](0027-versioned-map-poi-and-route-api-cutover.md) | Retire replaced Admin aliases and mutable POI/Route authoring APIs; use versioned Map–POI–Route contracts | owner-authorized API cutover; legacy Tour/registration and scheduling migration remain partial |
| [0028](0028-map-technical-check-before-poi-preparation.md) | Require latest exact-version physical robot check evidence before Tour Staff creates/revises/submits POI proposals | owner-authorized business rule; backend/frontend enforcement and tests in this change |
| [0029](0029-robot-connection-confirmation-before-map-pass.md) | Persist first accepted Fleet Sync context per credential and require it for a new map-check PASS | owner-authorized cross-system implementation; v1.5 schema and backend/web enforcement; no hardware acceptance claimed |
| [0030](0030-robot-credential-lifecycle.md) | Web-managed physical robot credential issue, rotation, revoke and append-only audit | owner-authorized implementation; v1.6 schema/API/UI rollout required; no hardware acceptance claimed |
| [0031](0031-versioned-poi-narration-content.md) | Narration and optional HTTPS fallback video on immutable POI revisions, with route-stop snapshots | owner-authorized Part 1; v1.7 schema/API/UI; content-only revisions reuse navigation verification |
| [0032](0032-robot-map-context-assignment.md) | Store physical robot Fleet Sync map context as a Technical Staff-managed MapVersion assignment | owner-authorized; v1.8 schema/API/UI rollout required; no hardware acceptance claimed |

| [0033](0033-map-technical-check-before-route-authoring.md) | Require current ADR-0028 map evidence before saving or submitting a versioned Route revision | owner-authorized; no schema change; physical behavior unverified |
| [0034](0034-tour-from-tested-route-revision.md) | Schedule new Tours from an exact tested Route revision; size the robot reservation from the effective PASS run (interim) | owner-authorized; partly supersedes ADR-0024; v1.9 schema |
| [0035](0035-tour-slots-lead-time-and-measured-reservation.md) | Fixed Tour slots, 72-hour lead time, route test measures the whole run including dwell, reservation adds increased dwell | owner-authorized; amends ADR-0034; v1.10 schema; amended by `docs/lich-tour-theo-ca.md` (fixed shifts replace slots and the robot hold; lead time, measurement, `expected` formula and concurrency stay) |
| [0036](0036-tour-custom-start-time.md) | Staff may type a Tour start inside configured hours; slots become quick choices | superseded by `docs/lich-tour-theo-ca.md` (07/11/2026): Tours start only at a fixed shift |
| [0037](0037-versioned-route-availability.md) | Deactivate and reopen versioned Routes for new Tours through Routes.IsActive; rows never touched stay open | owner-authorized; no schema change |
| [0038](0038-poi-pose-capture-import.md) | Import POIs from robot pose-capture files as honest POSE_CAPTURE evidence; content stays with Staff and the route test stays mandatory | owner-authorized 2026-11-01 |
| [0039](0039-robot-area-tour-readiness-and-deactivation.md) | One robot per map area as a current-phase limit, only usable robots for Tours, and robot deactivation through DeactivatedAt | owner-authorized 2026-11-01 |
| [0040](0040-map-package-uniqueness-camera-enum-pose-clearance.md) | One version per package within a map area, camera preset limited to FRONT, LEFT and RIGHT, and a free radius around every newly written POI or route pose | owner-authorized 2026-11-01 |
| [0041](0041-map-version-retirement.md) | Retire a map version with "Ngừng sử dụng" instead of deleting it; refused while a robot is assigned to it, keeps all history | proposed 2026-11-02, pending owner approval, not implemented |
| [0042](0042-m2-command-transport-and-start-readiness.md) | M2 command transport as a separate robot-polled endpoint, persisted command lifecycle, `RobotCommands` design and READY/Start condition tables | accepted by the repository owner 2026-11-03; implemented from M2.2; dispatch off until M2.3 safety evidence |
| [0043](0043-m2-2-tour-orchestration-scope.md) | M2.2 scope: no FRONT until M2.5, versioned stop columns, fake-bridge testing, manual Next, release rules, End Early without FR-48; schema v1.14 `RobotCommands` | accepted by the repository owner 2026-11-03; storage in schema v1.14 |

| [0044](0044-robot-command-terminal-outcome-check.md) | Close the NULL outcome CHECK hole for terminal robot commands; preserve v1.14 and upgrade through v1.15 | corrective implementation of ADR-0042/0043, 2026-11-04 |
| [0045](0045-operator-head-control.md) | The assigned Operator of a RUNNING Tour turns the PAN/TILT head with buttons over a separate in-memory, long-polled Fleet Head v1 contract; nothing persisted. Addendum 2026-11-09: per-Tour AUTO/MANUAL mode, AUTO sweeps the head left, right and back at every POI | proposed 2026-11-05 (team member Sơn), behind flags off by default; pending owner acceptance |
| [0046](0046-admin-account-password-reset.md) | Admin resets a managed account's password; Admin targets refused, refresh tokens revoked, audited; username and role stay immutable | superseded by ADR-0058 (13/11/2026); never implemented as written |
| [0048](0048-tour-capacity-operator-change-and-t24-expiry.md) | Tour capacity (schema v1.18), Staff changes the Operator before Start, Admin cannot deactivate an account still in use, T-24h expiry of undecided items, and the invitation code guard | accepted 2026-11-08 by the owner, implemented |
| [0047](0047-system-auto-cancel-of-unstarted-tours.md) | The system cancels a SCHEDULED/READY Tour whose robot hold ended without a Start; schema v1.17 lets the system release a reservation with no user | accepted 2026-11-08 by the owner (schema option), implemented |
| [0050](0050-early-start-and-short-notice-tours.md) | Start up to 10 minutes early inside the shift when every viewer is in the waiting room; short-notice Tours (schema v1.19) replace only the 72/48/24-hour marks | accepted 2026-11-09 by the owner, implemented |
| [0049](0049-m2-3-robot-local-safety.md) | M2.3 robot-local safety: motion permit and latched gate in `mode_manager`, real `localized`/`motionReady`, map content check, one goal sender, GATE A checklist | accepted 2026-11-08 by the owner; steps 3.1-3.3 implemented (#228, #230-#232, #270); GATE A evidence and the hardware E-stop input (step 3.4) pending |
| [0051](0051-staff-discard-never-passed-poi.md) | Staff soft-discard a POI proposal that never passed verification; schema v1.20 adds `PoiProposals.DiscardedAt/DiscardedByUserId` and a column-only runtime grant | accepted 2026-11-09 by the owner, implemented |
| [0052](0052-quest-camera-on-demand.md) | The Quest camera runs only while a Tour runs on the robot or a Staff page holds an in-memory lease; the robot polls `/api/fleet/camera/v1/poll`; viewers can pause; fail-safe on backend outage | implemented and deployed 2026-11-09 (#253), proposed by team member Thanh, no separate owner acceptance recorded; robot side opt-in (`QUEST_CONTROL_URL`) |
| [0053](0053-quick-tours.md) | Quick Tours: no date or shift, the robot held from creation, published at their latest Start, Start opens at creation once ready; supersedes the shift-bound short-notice Tour of ADR-0050 | accepted 2026-11-09 by the owner, implemented |
| [0054](0054-ready-needs-an-accepted-row.md) | READY needs at least one accepted roster row (`NO_ACCEPTED_ROWS`), reported only once no decision is pending; Start rechecks it (`hasAcceptedRows`); amends ADR-0042 and ADR-0053 | accepted 2026-11-11 by the owner, implemented |
| [0055](0055-token-gated-quest-stream.md) | Reading the public Quest relay needs a short-lived backend token (Student session on the relay's robot, or a Staff camera lease); MediaMTX `authMethod: http` keeps the NUC's publish password checked; a reaper on the relay host cuts viewers whose access ended; the relay URL leaves the web bundle | proposed 2026-11-11 after the 11/11 review, implemented; relay and NUC need a hardware test |
| [0056](0056-quest-headset-status-via-backend.md) | The Quest headset's battery and adb connection ride on the camera poll; Staff read `GET /api/staff/manage/robots/{robotCode}/headset`; shown in the Robot panel; addendum: Staff wake/sleep button delivered with the camera poll | proposed 2026-11-12 (team member Thanh), implemented |
| [0057](0057-early-start-without-every-viewer.md) | Early Start no longer waits for every viewer: `allViewersJoined` is shown as information and the `EARLY_START` note records X/Y in the waiting room; amends ADR-0050 decision 2 | accepted 2026-11-12 by the owner for the demo, implemented |
| [0059](0059-demo-tour-flow-open-depart-pause-skip.md) | Demo Tour flow: Start can open the Tour without its first leg (`INITIALIZING`), the departure is Next with the on-site confirmations, Pause (Cancel, `PAUSED`), Resume via Retry, Skip, an automatic departure at POIs (off by default), End Early while stopped releases the robot, quick Tours need no accepted row | proposed 2026-11-14 for the demo |
| [0058](0058-admin-password-reset-with-account-version.md) | Admin resets a managed account's password at `POST /api/admin/accounts/{id}/reset-password` with an `expectedRowVersion` derived from `UpdatedAt`; refresh tokens revoked, `PASSWORD_RESET_BY_ADMIN` audit; supersedes ADR-0046; forced change at next sign-in needs a column and is not done | accepted 2026-11-13 by the owner (UX/UI brief WS-H), implemented |

<!-- TODO(Duy): những decision sắp tới đáng viết ADR:
     - chọn database cho backend
     - monorepo vs multi-repo (nếu muốn ghi lại lý do gộp)
-->
