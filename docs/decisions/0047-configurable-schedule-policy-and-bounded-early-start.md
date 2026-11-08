# ADR-0047: Configurable schedule policy and bounded early Start

- **Status:** Accepted by the repository owner, 09/11/2026, and implemented (backend, web, docs). No schema change.
  Physical behavior remains unverified; a real Start still needs the M2.3 dispatch evidence.
- **Amends:** ADR-0035 decision 1 (the 72-hour lead time and the 48-hour registration close become
  configured values with those defaults); ADR-0042 §7 / D2 (the Start window gains a bounded lower extension);
  `docs/requirements/campus-tour-scope.md` §4 ("Start is requested while READY at/after published time").
- **Related:** ADR-0034/0035 (reservation window), ADR-0036 (start hours), ADR-0039 (usable robot), ADR-0042 (READY and
  Start conditions), ADR-0043 (M2.2 scope, D10 no test-only Tour path, D11 `IsDispatchEnabled` writer in M2.3),
  `docs/architecture.md` §3.2.

Labels: **[SRS]** required by the scope/gap register; **[ADR-n]** restates an accepted decision; **[Design]** a design
decision of this ADR.

## Context

Running a Tour end to end in a test or demonstration on the same day is impossible today, and Operators cannot start a
Tour whose group is already present a few minutes before the published time.

What the code does now:

| Concept | Current behavior |
|---|---|
| "Tour full" | Does not exist. A registration has at most 10 viewing rows; the gap register records that the SRS and schema have no Tour-wide capacity, so none is invented. |
| "List finalized" | Already exists as **READY**. Registration writes are accepted only while the Tour is SCHEDULED (`RegistrationGate.OpenTourState`), READY is refused while any row or email-change decision is pending (`PENDING_DECISIONS`), and new rows close 48 hours before the start (`RegistrationCutoff`). |
| "Ready to depart" | The Start preflight (architecture §3.2): telemetry ≤ 2 s, `localized`, `motionReady`, map context, effective PASS run of the exact Route Revision, robot eligibility, `IsDispatchEnabled`, no open command or incident, Operator console, on-site confirmations, `FleetCommands:Enabled`. READY is not physical safety proof **[SRS §4]**. |

What blocks a same-day run or an early Start:

1. `TourSchedule.LeadTime = 72h` and `TourSchedule.RegistrationClose = 48h` are compile-time constants. The web also
   hardcodes "72 giờ" (`web/src/features/administration/tours/tour-messages.ts`). A same-day Tour therefore needs a code
   change or a manual database edit, both of which this repository forbids as a test practice.
2. `withinStartWindow` accepts Start only in `[ScheduledStartAt, ScheduledStartAt + StartLateLimitMinutes]`.

What does **not** block anything here and must not be touched: no API sets `Robots.IsDispatchEnabled` before M2.3
(ADR-0043 D11) and `FleetCommands:Enabled` defaults to false. A real Start therefore fails in every environment until
the M2.3 safety evidence exists. This ADR removes timing obstacles only, never a safety obstacle.

## Decision

### 1. Lead time and registration close are configured policy values

**[Design]** Two settings replace the constants:

| Setting | Default | Rule |
|---|---|---|
| `Tours:LeadTimeHours` | 72 | integer, `> RegistrationCloseHours` |
| `Tours:RegistrationCloseHours` | 48 | integer, `≥ 0` |

- A missing value uses the default, so an environment that does not set them behaves exactly as today.
- Startup fails if a value is not an integer, is negative, or if `LeadTimeHours ≤ RegistrationCloseHours`: a Tour
  created at the minimum lead time must still accept registrations.
- Tour create, the slot list, `RegistrationCutoff` and every message read the same values. `GET
  /api/staff/manage/tours/slots` adds `leadTimeHours` and `registrationCloseHours` so the web shows the configured
  numbers instead of a hardcoded "72".
- The lead time is checked only when a Tour is created, so changing it affects new Tours only. The registration close is
  evaluated at each write, so changing it moves the cutoff of existing SCHEDULED Tours too; the startup log records the
  effective values.
- **Production keeps 72/48.** 48 hours is an SRS value **[SRS §5]** and 72 hours is ADR-0035's owner decision; changing
  either for production needs an owner decision recorded as an amendment of this ADR. A test or demo environment may
  set, for example, `LeadTimeHours = 2` and `RegistrationCloseHours = 1`. Short values also compress the Staff review
  window (SRS: review within 2 working days); a demo environment accepts that.

These are business policy parameters. No safety, readiness, reservation or Route Revision rule becomes configurable.

### 2. Bounded early Start inside the Tour's own reservation

**[Design]** The Start window becomes:

```text
[ScheduledStartAt − StartEarlyLimit, ScheduledStartAt + StartLateLimit]
```

- New setting `FleetCommands:StartEarlyLimitMinutes`, default 10; 0 restores today's behavior.
- Startup fails if it is negative or greater than `TourSchedule.ReservationBuffer` (15 minutes).

Why that bound is enough on its own: the reservation of a Tour is `start − 15 min … start + expected + 15 min`
(ADR-0034/0035) and overlapping reservations are refused at create. A Start at most 15 minutes early, running for the
expected duration, ends no later than `ScheduledStartAt + expected`, inside the Tour's own window. So an early Start
needs **no reservation move, no new overlap check and no change to any other Tour**. The physical guards
(`robotNotHeldByOtherTour`, `noUnresolvedCommand`, `noOpenIncident`, atomic claim) still apply as today.

**Condition is READY, not "full".** READY already means the list is finalized and no decision is pending. A head
count is not a business concept in this system and is not a Start condition.

**Extra confirmation when early.** While `now < ScheduledStartAt`, Start also requires the Operator confirmation
`earlyStartAgreed = true` ("đoàn đã có mặt / đại diện đoàn đồng ý bắt đầu sớm"). It is a new preflight row,
source `OPERATOR_CONFIRMATION`, fail-closed when missing. When `now ≥ ScheduledStartAt` the row passes with the detail
"Không áp dụng: đã tới giờ bắt đầu." and the field may be omitted.

**Guests, registrations and access.**

- No email is sent for an early Start: at most 15 minutes early, an email would arrive too late to help. The confirmation
  above puts the responsibility on the Operator and the group's Representative.
- Registrations are already locked by READY; the registration cutoff is computed from `ScheduledStartAt`, which does not
  change.
- Invitation expiry stays `ScheduledStartAt + ExpiryHoursAfterStart`, so a viewer who joins at the published time can
  still enter.
- Known gap, unchanged (ADR-0043 D9): the student screen of a versioned Tour does not follow progress until M2.5.

**Record.** `StartedAt` stores the real time. The `TOUR_STARTED` event and the Start receipt record how many seconds
before `ScheduledStartAt` the Tour started and that `earlyStartAgreed` was given. Reports use `StartedAt` for the
actual start and `ScheduledStartAt` for the published one.

### 3. What stays exactly as it is

- READY conditions, including `START_TIME_PASSED` and `PENDING_DECISIONS`; Reopen and Cancel.
- Every other Start check: `tourReady`, `callerIsOperator`, `reservationActive`, `revisionStillSchedulable`,
  `robotEligibleForRoute`, `robotMapMatchesRoute`, `robotNotNeedsInspection`, `robotNotHeldByOtherTour`,
  `robotDispatchEnabled`, `noPendingDecisions`, `noOpenIncident`, `noUnresolvedCommand`, `telemetryFresh` (≤ 2 s),
  `mapContextMatches`, `executionIdle`, `robotLocalized`, `motionReady`, `operatorConsoleConnected`, `robotPlaced`,
  `areaClear`, `attendantPresent`, `previewChecked`, `commandTransportEnabled`.
- The late limit (`StartLateLimitMinutes`, default 15), the reservation calculation and buffer, start hours and slots.
- ADR-0039 (only usable PHYSICAL robots) and ADR-0043 D10 (no test-only Tour path); `IsDispatchEnabled` is still set
  only by the M2.3 writer with its safety evidence.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Start any time once the Tour is READY or "full" | Needs moving the reservation, a fresh overlap check and guest notices; viewers arriving at the published time would miss the Tour; "full" has no definition. |
| A separate rehearsal/demo Tour type without registration | A parallel workflow through registration, invitations and statistics; close to the test-only path ADR-0043 D10 refuses; a demo would not show the real registration flow. |
| Reschedule to "now" | A real feature (reservation recalculation, notices, lead-time rule) that deserves its own decision; the Tour still changes time by cancel and recreate. |
| An Operator or developer override of the window or a check | A bypass, not a business rule. |
| Lowering 72/48 in code for everyone | Changes production policy and an SRS value without an owner decision. |

## Conflict to report

`campus-tour-scope.md` §4 says Start is requested "at/after published time", and ADR-0042 §7 took that as the lower
bound. Decision 2 deliberately departs from it by at most `ReservationBuffer`. On acceptance the scope line, ADR-0042 §7
and architecture §3.2 must be updated together, and the change listed for advisor review. Until then the current rule
applies.

## Resolved at acceptance (09/11/2026)

1. No environment's configuration is changed by this ADR: production keeps the 72/48 defaults. Running a demo on the
   production EC2 deployment with shorter values would need a separate owner decision.
2. The default early limit is 10 minutes.
3. The Start screen does not show connected viewer sessions; that stays out of scope.
4. Implementation detail: before the early window opens, `earlyStartAgreed` is listed as not run behind
   `withinStartWindow`, so only the window is reported as the root cause. The start-checks read returns `opensAt`
   (`ScheduledStartAt − StartEarlyLimitMinutes`) so the web says when Start opens without recomputing the rule.

## Consequences

- No schema change. `TourEvents` and the Start receipt carry the early-start record.
- API, additive only: the slots response gains `leadTimeHours` and `registrationCloseHours`; `StartConfirmation`
  gains optional `earlyStartAgreed`; the preflight list gains the `earlyStartAgreed` row. The `withinStartWindow`
  detail and `TOUR_LEAD_TIME_TOO_SHORT`/`REGISTRATION_CUTOFF` messages use configured numbers.
- Backend: `TourScheduleSettings` reads the two hour values; `TourSchedule.Evaluate`, `RegistrationCutoff` and
  `GetTourSlotsQuery` use them; `FleetCommandSettings` gains `StartEarlyLimit`; `TourStartPreflight.Window` and the
  Start command handle the early bound and confirmation.
- Web: the Tour create screen shows the configured lead time; the Start check page shows when Start opens and, while
  early, the `earlyStartAgreed` checkbox.
- Tests: window bounds (`S − E − 1 s` refused, `S − E` and `S + L` accepted); early Start without the confirmation
  refused; confirmation not required at or after `S`; invalid configuration (`E > 15`, negative values,
  `LeadTimeHours ≤ RegistrationCloseHours`) fails startup; lead time and cutoff follow configured values; web tests for
  the checkbox and the "opens at" message. Every existing Start-check test keeps passing unchanged.
- Production behavior changes only by the 10-minute early window once accepted and deployed; with
  `StartEarlyLimitMinutes = 0` it is identical to today.
