# gazebo_preview_bridge

This package is only for the development integration from Gazebo to the local
backend `SimulationPreview` endpoint. It reads Gazebo model state and posts
read-only pose snapshots for the web preview.

It does not report physical AMR telemetry and is not the production fleet
transport. The production `fleet_bridge` is planned separately for
`Backend fleet contract ↔ ROS navigation/state`; it must not depend on Gazebo
or simulation. Its transport, authentication, wire schema, and ROS mapping
remain TBD in `docs/architecture.md`.

The `gazebo_telemetry` executable, `gazebo_web.launch.py`,
`/api/simulation/pose` endpoint, latest-state buffer, and maximum 10 Hz update
rate belong to this local preview path.
