# ADR-0057: Early Start no longer waits for every viewer

- **Status:** Accepted by the repository owner, 2026-11-12, for the course-project demo. No advisor approval is recorded.
- **Amends:** ADR-0050 decision 2 ("Nobody is left behind") and the same rule as repeated in ADR-0053 decision 4.

## Context

On 12/11/2026 the full chain web → backend → fleet_bridge → robot ran: every robot, telemetry and system check passed, and Start stayed locked only by `allViewersJoined` (1/2 viewers in the waiting room). For a demo the Operator has to be able to start when the robot is ready, without waiting for every invited screen.

## Decision

1. Before the published time `allViewersJoined` is informational. It always passes and is never in `blockedBy`; its detail still says how many accepted rows are in the waiting room (`Mới có X/Y điểm xem vào phòng chờ (chỉ cảnh báo, không chặn Start sớm)`). The web shows it as an information row, like the battery.
2. An early Start records on `TOUR_STARTED`, with `ReasonCode = EARLY_START`, how early it was and how many viewers were in the waiting room: `Start sớm N giây trước giờ bắt đầu; X/Y điểm xem đã vào phòng chờ.`
3. Nothing else changes: the early limit (`FleetCommands:StartEarlyLimitMinutes`, inside the robot hold), READY, accepted rows, and every robot, telemetry, console, confirmation and transport check still block.

## Consequences

- A viewer who has not joined when the Operator starts early misses the opening of the Tour. The Operator sees the count before pressing Start, and the event keeps it.
- The check id and the API shape are unchanged; only `passed` and the detail text differ. `START_PRECONDITION_FAILED` is no longer returned for `allViewersJoined`.
- Reverting is a code change in `TourStartPreflight` and the web info list; no schema is involved.
