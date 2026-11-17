# ADR-0059: Demo Tour flow: open, depart, pause, skip and automatic departure

- **Status:** Proposed for the course-project demo, 14/11/2026 (PR `feature/claude/tour-demo-flow`). Needs the owner's review.
- **Amends:** ADR-0042 §5 (Start sends the first GoTo), ADR-0043 D12 (no automatic dwell or Hold) and D13 (End Early always
  holds the robot), ADR-0054 (READY needs an accepted row) for quick Tours only.
- **Related:** ADR-0049 addendum of 14/11/2026 (a new leg clears a BOOT or PERMIT_LOST latch; PR `feature/claude/fleet-latch-new-leg`).
- **Schema:** none. `Tours.CurrentStep` and `Tours.OperationalStatus` are strings without a CHECK.

## Context

On 13/11 a Tour ran from the web for the first time. The Operator wanted to look at the Quest camera, the map and the robot
before anything moved, but Start sent the first GoTo at once and the head buttons only work on a RUNNING Tour. During a
leg the only control was End Early, which cancels the Tour and holds the robot for an inspection. At a POI the dwell is
shown but nothing leaves by itself. A quick Tour for people already in the room still needed a Representative to register
and Staff to accept a row before it could be marked READY.

## Decision

1. **Open, then depart.** `start` takes `holdAtStart: true`: the Tour becomes RUNNING at `CurrentStep = INITIALIZING`
   with no command. `robotLocalized` and `motionReady` are shown, not required, when opening; every other Start check
   still blocks. The departure is `next` from `INITIALIZING`, which sends the first leg after the movement checks and the
   four on-site confirmations (moved here from Start, since the Operator now sees the live camera first). `start`
   without the flag keeps the old behaviour. The student view already shows `INITIALIZING` as "preparing to move".
2. **Pause is a real stop request.** `pause` on a leg withdraws a GoTo the robot never took and sets
   `OperationalStatus = PAUSED` at once; a delivered one gets a Cancel and the Tour stays NORMAL until the robot reports
   the leg's end: CANCELLED, FAILED or REJECTED make it PAUSED, ARRIVED opens the POI as usual. An UNKNOWN leg cannot be
   paused (on-site check first). Nothing is resumed by itself.
3. **Resume is Retry.** `retry-leg` from PAUSED sends a new leg (new `legId`) to the same target after the movement
   checks, so the cancelled goal is never resumed. A restart keeps PAUSED.
4. **Skip.** `skip`, while the robot stands still (at the start, at a POI, or after a paused or failed leg Retry could
   resume), passes over the POI it would go to next (`STOP_SKIPPED` event) and goes to the one after, the end pose, or
   completes the Tour when that was the last POI of a `LAST_POI` route.
5. **Automatic departure, off by default.** `PUT auto-advance {enabled}` (Operator, in memory like the head mode, lost on
   restart). Once a POI's dwell ends, a worker makes one attempt per visit, as the system, with every movement check
   including the Operator's console connection. A blocked attempt moves nothing, is recorded (`TOUR_AUTO_ADVANCE_BLOCKED`)
   and is never repeated for that visit.
6. **End Early while standing still releases the robot.** With no open GoTo the robot is stopped where its last result
   said, so End Early releases it like a normal end; with an open GoTo it is held for inspection as before.
7. **Quick Tours need no accepted row.** A quick Tour (ADR-0053) can be marked READY and opened with nobody registered;
   standard Tours keep ADR-0054.

## Consequences

- No schema change; new endpoints `pause`, `skip`, `auto-advance`; `start` and `next` take optional fields; GET Tour adds
  `allowedActions.open/pause/skip`, `execution.command.cancelRequested` and `execution.autoAdvance`.
- The web opens from the Tour page or the opening page in one press and departs from the console. Pause, Resume, Next
  and Skip keep one confirmation (web hard constraint: no leg control without an explicit confirmation step).
- A web build ahead of the backend fails closed: an older backend ignores `holdAtStart` and refuses the Start for its
  missing confirmations. Deploy the backend first.
- The departure, Pause and Resume still depend on the robot's link: a Pause sent while the robot is offline reaches it
  only when the link returns, or the robot stops on its own after `motion_permit_link_timeout_sec`. The web page is not
  an emergency stop; the attendant with the hardware E-stop stays required.
