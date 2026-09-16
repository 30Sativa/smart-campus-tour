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
`TourLeg` resolves to a target containing `stop_id`, `x`, `y`, and `yaw` in
the correct map/frame/context. The backend sends only the current leg through
conceptual commands:

```text
go_to { leg_id, stop_id, x, y, yaw }
cancel { leg_id }
```

The robot executes that leg and reports execution state; it does not receive
an entire tour or own progression between stops. Transport, authentication,
exact wire schema, and the mapping onto ROS interfaces remain TBD.

`bus_stops.yaml` may remain as a local/manual-development fallback or test
fixture, but it is not the source of truth for production POI coordinates.

## Consequences

Positive:

- Booking, dispatch, narration, operator views, and navigation targets use the
  same route/POI ownership boundary.
- The backend can pause at a POI for narration or visitor interaction before
  deciding when to issue the next leg.
- Physical robots, a Gazebo robot, and Fleet Emulator robots can use the same
  external per-leg semantics.

Negative:

- The current named-stop action and navigator do not yet implement this
  production contract; a later reviewed implementation task must migrate or
  adapt the boundary.
- Backend POI data must retain its map/frame/context, because coordinates
  without that context are unsafe and meaningless.
- Retries, duplicate commands, and out-of-order state require idempotency and
  `seq`-based ordering behaviour in later implementation work.

This ADR changes documentation only. It does not modify `GoToStop.action`,
`BusStatus.msg`, `stop_navigator_node.py`, `bus_stops.yaml`, backend source,
or database schema.
