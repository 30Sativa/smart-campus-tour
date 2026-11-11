# ADR-0054: A Tour is READY only with an accepted row

- **Status:** Accepted by the repository owner, 2026-11-11. No advisor approval is recorded.
- **Amends:** ADR-0042 (the READY and Start condition tables in `docs/architecture.md` §3.2) and ADR-0053 (its rejected alternative "a quick Tour with no accepted row can be marked READY and started").
- **Schema:** none.

## Context

READY locks the registration list, row review, email change and metadata of a Tour; Start then claims its robot. Neither checked that anyone had been accepted for the Tour. A Tour nobody registered for, or whose rows were all rejected, could be marked READY and started: the robot, its shift and the Operator were spent on an empty room, and the shift stayed closed to Tours that had viewers. `allViewersJoined` passed for such a Tour, because with no accepted row nobody could be left behind.

The right action for a Tour with nobody to run it for is Cancel, which releases the robot and the shift.

## Decision

1. **READY needs an accepted row.** A Tour is marked READY only when it has at least one active roster row Staff accepted (`RosterRows.IsActive = 1`, `ParticipationState = 'ACCEPTED'`). A shared-viewing row counts as one, whoever watches that screen. Pending, rejected, removed and expired rows do not count. Otherwise the blocker is `NO_ACCEPTED_ROWS`.
2. **Undecided rows come first.** While a row or email change waits for Staff (`PENDING_DECISIONS`), `NO_ACCEPTED_ROWS` is not reported: the undecided rows are the root cause and may be the accepted ones once decided.
3. **Start rechecks it.** A row can leave a READY Tour, so the Start checklist has `hasAcceptedRows` (source DB) next to `noPendingDecisions`, skipped while that one fails. `allViewersJoined` is unchanged.
4. **No exception.** A run without viewers (a rehearsal, a route check) is not a Tour: route checks have their own Technical Staff test runs. A quick Tour (ADR-0053) follows the same rule.

## Alternatives rejected

- Count registrations instead of rows: a submitted registration may have all its rows rejected.
- Report `NO_ACCEPTED_ROWS` together with `PENDING_DECISIONS`: it is not a root cause while rows wait, and it would tell Staff to cancel a Tour that may only need its rows reviewed.
- Cancel such a Tour automatically at registration close: a separate decision about notices and robot release; Staff keeps that call.
- Allow READY without rows for a demonstration: no current need outside Technical test runs, and an exception would need its own marker on the Tour.

## Consequences

- No schema change and no new endpoint. `readyBlockers` and `READY_PRECONDITION_FAILED` may carry `NO_ACCEPTED_ROWS`; start checks carry `hasAcceptedRows`.
- A quick Tour for a group already on site needs its Representative to submit at least one row and Staff to accept it before READY; Staff still cannot add rows (BR-11).
- A Tour marked READY before this change with no accepted row stays READY, but cannot Start until it has one; Staff reopens and cancels it.
