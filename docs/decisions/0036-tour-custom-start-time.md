# ADR-0036: Custom Tour start time

- **Status:** Superseded by `docs/lich-tour-theo-ca.md` (07/11/2026): Tours start only at a fixed shift; Staff no longer types a start time.
- **Amends:** ADR-0035 decision 2 (fixed slots). Every other ADR-0035 decision stays in force.

## Context

ADR-0035 allowed only the configured slots, so a Tour at any other time needed a configuration change and a deployment. The slot list exists to make scheduling quick; what actually protects the robot and the schedule is the 72-hour lead time and the measured reservation, and neither depends on the start being a slot.

## Decision

1. **Slots become suggestions.** `Tours:StartSlots` stays as the quick choices. Staff may also type a time.
2. **Custom hours.** A typed time must be a whole minute between `Tours:CustomStartEarliest` and `Tours:CustomStartLatest` inclusive, Vietnam time, configured as 08:00 and 17:00. Both are required at startup. A configured slot stays allowed even outside these hours. Anything else on create returns the existing 409 `TOUR_SLOT_NOT_ALLOWED`.
3. **Same calculation.** `GET /api/staff/manage/tours/slots` takes an optional `time=HH:mm`, which adds that start to each day beside the slots and judges it with the same lead time, overlap and gap rules. A time outside the hours is reported with `OUTSIDE_START_HOURS`. The response gains `customStartEarliest` and `customStartLatest`.
4. **Create stays the decider.** The availability answer is advice, as in ADR-0035 decision 6.

## Out of scope

Per-weekday or per-route hours, editing the hours from a screen, rescheduling.

## Consequences

No schema change. `TOUR_SLOT_NOT_ALLOWED` now means outside the allowed hours, not off a slot, and off-slot create requests inside the hours, previously refused, now succeed.
