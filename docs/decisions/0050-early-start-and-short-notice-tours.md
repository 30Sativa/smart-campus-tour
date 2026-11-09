# ADR-0050: Early Start inside the shift and short-notice Tours

- **Status:** Accepted by the repository owner, 2026-11-09. No advisor approval is recorded.
- **Amends:** ADR-0009 ("no button that skips the published time"), ADR-0035 decision 1 (72-hour lead time, for short-notice Tours only), ADR-0042 §7 and the lower bound of `withinStartWindow`, BR-05/ADR-0048 (T-24h, for short-notice Tours only).
- **Schema:** v1.19, `Tours.IsShortNotice`.

## Context

Operators wanted to begin a Tour without waiting for the exact minute, and tests and demonstrations needed a Tour created and run on the same day. A full Tour or a closed list does not make that safe to allow freely:

- Full means seats are taken. A seat is a viewing row, and a shared projector row is one seat, so it says nothing about people.
- A closed list is READY. It can be reopened and does not depend on the robot.
- Ready to depart is the Start preflight, computed live.

A Tour holds its robot for its own shift only. Starting outside that shift could take the robot from another Tour, and viewers who come at the published time would miss it.

## Decision

1. **Early Start stays inside the shift.** Start is accepted from `FleetCommands:StartEarlyLimitMinutes` before the published time, default 10. Startup refuses more than the 15-minute reservation buffer, so an early run always begins inside the Tour's own hold and needs no new overlap check.
2. **Nobody is left behind.** Before the published time the `allViewersJoined` check needs every accepted row to hold a live browser session. It is read from data, so no on-site tick stands in for it. A Tour with no accepted row passes. From the published time the check passes as not applicable. An early Start is recorded on `TOUR_STARTED` with `ReasonCode = EARLY_START`.
3. **Short-notice Tours.** Staff may mark a new Tour short notice, with a required reason recorded as a `TOUR_CREATED_SHORT_NOTICE` event. Only `Tours:ShortNoticeMinLeadMinutes` is configured, and while it is unset the option is off and requests return 409 `SHORT_NOTICE_DISABLED`.
4. **What a short-notice Tour changes.** The lead time becomes that minimum instead of 72 hours. Registration and review have no 48-hour or 24-hour mark and close at the published time. Staff closes the list with READY, the T-24h job skips the Tour, and undecided rows still block READY and Start.
5. **What it does not change.** It still uses a fixed free shift, a tested route revision, the robot hold, Admin blocks, READY and every Start check. Robot readiness, dispatch, map, route revision and motion checks have no exception for either feature.
6. **The 72/48/24-hour values stay constants.** A system-wide setting was rejected: it would move the deadlines of every open Tour and require a restart.

## Alternatives rejected

- Start at any time once READY or full: outside the robot hold, and viewers miss the Tour.
- An operator tick for "the group agreed": it cannot be verified.
- Deriving short notice from `ScheduledStartAt - CreatedAt`: no schema change, but implicit and wrong as soon as Tours can be rescheduled.
- Moving a Tour to an earlier shift: the right answer for starting hours early, but it needs the reschedule and notification workflow, which does not exist. Left for a later decision.

## Consequences

- Schema v1.19 is additive; every existing Tour stays standard. The database must be upgraded before or with this API.
- `StartConfirmation` is unchanged. Start checks gain `allViewersJoined` and the response gains `opensAt`.
- Tour responses gain `isShortNotice`, Representative reads gain the server's registration deadline, `/slots` takes `shortNotice` and returns `shortNoticeMinLeadMinutes`, and create takes `shortNoticeReason`.
- A session that dropped recently still counts as present until it expires.
- Same-day creation is limited by the configured shifts: after the last shift's start minus the minimum notice, no shift is left that day.
- A viewer who has not joined by the published time still misses the opening minutes, as before.
- No physical behavior changed; robot-side safety evidence remains as ADR-0049 records it.
