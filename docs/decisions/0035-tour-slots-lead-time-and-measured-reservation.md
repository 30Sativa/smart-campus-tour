# ADR-0035: Tour slots, lead time and what a route test measures

- **Status:** Accepted by the repository owner, 2026-10-30. Physical behavior remains unverified.
- **Amends:** ADR-0034 decision 1 (reservation length) and its known limitation about dwell-only revisions. Every other ADR-0034 decision stays in force.
- **Amended by:** ADR-0036 (decision 2: a typed start inside configured hours).
- **Related:** ADR-0023 (versioned routes), ADR-0024, ADR-0026 (registration).

## Context

ADR-0034 reserves the robot for the measured seconds of the effective PASS run, but nothing defined what a tester should measure, and a dwell-only revision reused a measurement that did not include its new dwell. Staff could also pick any instant, however close, and learned about a clash only after submitting.

## Decision

1. **Lead time.** `ScheduledStartAt` must be at least 72 hours after the server clock at the moment of saving; otherwise create returns 409 `TOUR_LEAD_TIME_TOO_SHORT`. Registration still closes 48 hours before the start.
2. **Fixed slots.** Allowed start times are configured in `Tours:StartSlots` as `HH:mm`, read as Vietnam time and stored as UTC. A start that is not exactly on a slot returns 409 `TOUR_SLOT_NOT_ALLOWED`. Vietnam has no daylight saving, so a fixed +07:00 offset is used and the runtime needs no time zone data.
3. **What a route test measures.** From now on, `MeasuredDurationSeconds` is the total time for the whole route from departure to finish, including dwell at every stop. New runs record `RouteTestRuns.MeasurementBasis = 'TOTAL_WITH_DWELL'`. Existing runs keep NULL because nobody can say what they measured. A NULL-basis run cannot size a reservation: create returns 409 `ROUTE_TEST_REMEASURE_REQUIRED` until Technical Staff runs the route again.
4. **Reservation.** For the selected revision R, with effective PASS run P on tested revision T:

   ```
   expected = P.MeasuredDurationSeconds + Σ over stops max(0, dwell_R(stop) − dwell_T(stop))
   window   = start − 15 min … start + expected + 15 min
   ```

   Stops are matched by stop order, which the shared navigation fingerprint keeps identical. Lower dwell never subtracts: the run was measured with the longer stop and nothing shows the robot would finish sooner. `TourRobotReservations.ExpectedDurationSeconds` stores `expected` beside `MeasuredDurationSeconds`. A reservation made before this decision keeps NULL and the window it was given.
5. **Slot availability.** `GET /api/staff/manage/tours/slots` reports every slot of up to 31 days as available or with a reason: `LEAD_TIME_TOO_SHORT`, `RESERVATION_OVERLAP`, `ROUTE_TOO_LONG_FOR_GAP` or `ROUTE_TEST_REMEASURE_REQUIRED`. It and create call one shared function, so they cannot disagree. Both overlap reasons refuse create with the existing `ROBOT_RESERVATION_CONFLICT`: a hold covering the opening of the window is a clash, one that begins inside the window means the route does not fit the gap.
6. **Concurrency.** Create keeps the per-robot lock and rechecks after taking it, on a fresh clock. The availability list is advice; only create decides.

## Out of scope

Rescheduling (still cancel and recreate), READY, Tour preparation, Start and robot dispatch.

## Known limitations

- The change needs every route already PASS to be run again before it can schedule a new Tour. Existing Tours are not touched.
- Narration longer than the measured stop can still overrun; the 15-minute buffers are the only allowance.
- Slots apply to the whole system, not per route or per weekday.

## Consequences

Database First v1.10 adds nullable `RouteTestRuns.MeasurementBasis` and `TourRobotReservations.ExpectedDurationSeconds`; the API build requires it, so the schema upgrade runs first. `RouteTestRunView` gains `measurementBasis`, Tour reservation views gain `expectedDurationSeconds`, and the Tour list gains `reservation`. Off-slot or close-in create requests, previously accepted, now return 409.
