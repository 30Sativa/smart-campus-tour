# ADR-0005: Backend owns authoritative POI navigation targets and per-leg tour orchestration

## Context

The current single-robot ROS implementation exposes a named-stop
`GoToStop.action`. `stop_navigator_node.py` resolves its `stop_id` through
`bus_stops.yaml` before sending a pose to Nav2. That is useful for local ROS
development and manual tests, but it makes a robot-local file appear to own
production tour data and encourages robot-side route scheduling.

The booking and operations system needs one consistent owner for routes,
slots, tour progress, robot assignment, POI content, and navigation targets.

## Decision

The backend owns authoritative POI/route data and the tour state machine. Each
`TourLeg` resolves to a target pose in the correct map/frame/context. The
backend sends only the current leg. [ADR-0008](0008-production-fleet-transport.md)
refines the original conceptual `go_to` / `cancel` notation to:

```text
GoTo { legId, mapKey, frameId, x, y, yaw, stopId? }
Cancel { legId }
```

The robot executes that leg and reports execution state; it does not receive
an entire tour or own progression between stops. ADR-0008 selects SignalR JSON
Hub Protocol over TLS, with a mandatory Python-to-ASP.NET Core/.NET 10
compatibility checkpoint before production bridge implementation. The
checkpoint has not passed. `docs/architecture.md` Section 3 records the
conceptual report shapes, machine-auth requirements, and reconnect semantics;
final DTO binding and implementations remain pending.

Production `GoTo` maps directly to Nav2 `NavigateToPose`. `stopId` is optional
metadata, not a local lookup instruction; end/return legs need not have a stop.
Pose reports use TF `map -> base_footprint`, with separate freshness and
localization assessment. One owner sends production navigation goals.

Cancellation requires the terminal outcome of the exact leg through
`ReportCommandResult`; acceptance or later `IDLE` alone is insufficient. If
arrival precedes effective cancel, the outcome is `ARRIVED`. `CANCELLED` is a
terminal result, not an execution status. `UNKNOWN` execution means the bridge
cannot determine execution, not that the backend lost its connection.

`GoToStop.action` and `bus_stops.yaml` remain local/manual-development test
fixtures, not the production boundary or source of truth for POI coordinates.

## Consequences

Positive:

- Booking, dispatch, narration, operator views, and navigation targets use the
  same route/POI ownership boundary.
- The backend can pause at a POI for narration or visitor interaction before
  deciding when to issue the next leg.
- Physical robots, a Gazebo robot, and Fleet Emulator robots can use the same
  external per-leg semantics.

Negative:

- The current named-stop action and navigator are local tools. A later bridge
  implementation must use the selected direct Nav2 boundary without making
  local/manual goal senders compete with production control.
- Backend POI data must retain its map/frame/context, because coordinates
  without that context are unsafe and meaningless.
- Retries, duplicate commands, and out-of-order state require idempotency and
  `seq`-based ordering behaviour in later implementation work.

This ADR changes documentation only. It does not modify `GoToStop.action`,
`BusStatus.msg`, `stop_navigator_node.py`, `bus_stops.yaml`, backend source,
or database schema.
