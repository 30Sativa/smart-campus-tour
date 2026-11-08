# ADR-0047: The system cancels a Tour that was never started in its window

Date: 2026-11-08
Status: accepted by the owner (schema option chosen 2026-11-08); implements SRS v0.2 BR-24, UC-TOUR-07, BR-27, FR-40, AC-19

## Context

Start is accepted only in [T, T+15'] (`TourStartPreflight`). A Tour that
Staff neither started nor cancelled stayed SCHEDULED/READY forever and kept its
robot hold. SRS v0.2 requires the system to cancel it with the reason "not
started" once its robot hold has ended.

The cancellation must reuse Staff Cancel: revoke invitations, close sessions,
release the reservation and queue the cancel email. Every actor column on that
path accepts NULL (`TourEvents.ActorUserId`, `AuditLogs.ActorUserId`), except
that v1.16 `CK_TourRobotReservations_Release_Complete` requires
`ReleasedByUserId` whenever `ReleasedAt` is set. A background job has no user.

Options weighed: relax that CHECK (chosen); seed a system account in `Users`
(needs per-environment seeding, appears among accounts, fakes an actor); or
attribute the release to the reserving Staff or Tour creator (misattribution).

## Decision

Schema v1.17 replaces that one CHECK with
`CK_TourRobotReservations_Release_Actor`: `ReleasedByUserId IS NULL OR
ReleasedAt IS NOT NULL`. A releaser still implies a release; a release with a
NULL releaser means the system released it. No column, entity, grant or API
changes; the v1.16 snapshot and patches stay immutable. A transactional
v1.16-to-v1.17 patch locks the table, swaps the CHECK and advances the marker;
every existing row satisfies the new CHECK. Deployment requires v1.17 and the
trusted new CHECK, and still recognises historical hashes for upgrades.

Behaviour (`docs/lich-tour-theo-ca.md`, "Tự huỷ Tour quá giờ"):

- `TourAutoCancelWorker` in Api runs every 60 seconds and sends
  `AutoCancelOverdueToursCommand`. It never calls the robot.
- A Tour qualifies when it is SCHEDULED or READY with no operational trace
  (the same pre-Start test Staff Cancel uses), and its robot hold has ended:
  the active reservation's `EndsAt` <= now, or `ScheduledStartAt + 15'` when
  it has no reservation.
- Each Tour is cancelled in its own transaction under the Tour lock that Staff
  Start and Cancel take, then re-checked; a Tour that Staff started or
  cancelled first is skipped. The shared core of `CancelTour` does the work,
  with actor NULL. `EndReason` is "Không bắt đầu trong khung giờ, hệ thống tự
  huỷ." The `TOUR_CANCELLED` event and audit receipt carry ResultCode
  `SYSTEM_NO_START`.
- A Tour whose hold ended more than 24 hours before the run (backlog) is still
  cancelled but no email is queued; the job logs how many.

## Verification

SQL tests on disposable databases: cancel exactly at hold end and not one
minute earlier; skip RUNNING and ended Tours; a second run changes nothing and
queues no second email; a concurrent Staff Start or Cancel leaves exactly one
winner; backlog cancels without email; an on-time cancel queues the email for
approved groups. Schema tests cover the patch rerun, marker/hash retention,
snapshot equality and deployment rejection of a missing, untrusted or old CHECK.
