# `fleet_bridge`

ROS 2 Humble package for the Fleet Sync v1 HTTPS endpoint. It reads the latest
`map -> base_footprint` TF and reports execution status as `UNKNOWN`. HTTPS is
sent by a single background worker; callbacks do not perform network I/O. By
default it is telemetry-only: it creates no ActionClient and no publisher.

See [the deployment and test guide](../../../docs/fleet-bridge.md) before
running this package. Its launch file starts only this node and does not alter
the native Nav2, localization or DDS configuration. Its launch namespace
defaults to `robot_01`; confirm the namespace with read-only graph inspection
and override `robot_namespace` if the surveyed graph uses another name.

## Command receiver (off by default)

`commands_enabled: true` adds a Fleet Commands v1 poll loop
(`docs/contracts/fleet-commands/v1/`). With `false` (the default) nothing polls, no
Nav2 type is imported and telemetry is unchanged. **Do not enable it on a physical
robot:** the safety work below belongs to M2.3. Test with
[`robot/tools/fleet_commands_stub`](../../../tools/fleet_commands_stub/README.md) and Gazebo.

| Command | Bridge action | Result reported |
|---|---|---|
| GoTo, map or frame differs from the configured one | no goal | `REJECTED` `MAP_MISMATCH` |
| GoTo received after `acceptBy` by this clock | no goal | `REJECTED` `EXPIRED` |
| GoTo while another leg runs, or the result buffer is full | no goal, no preempt, no queue | `REJECTED` `BUSY` |
| GoTo with a `commandId` already seen | nothing | none |
| GoTo otherwise | Nav2 `NavigateToPose` | `ACCEPTED` when Nav2 accepts; `REJECTED` `NAV2_REJECTED`/`NAV2_UNAVAILABLE` otherwise |
| Nav2 `SUCCEEDED` | | `TERMINAL` `ARRIVED`, also after a Cancel: arrival beats cancel |
| Nav2 `ABORTED` | | `TERMINAL` `FAILED` `NAV2_ABORTED` |
| Nav2 `CANCELED` | | `TERMINAL` `CANCELLED` if the backend asked, else `FAILED` `NAV2_CANCELED` |
| Cancel for the running leg | cancels that goal | `ACCEPTED` on the Cancel |
| Cancel for another leg | nothing | `REJECTED` `UNKNOWN_LEG` |

Telemetry reports `IDLE`, or `NAVIGATING` with `legId` while a goal runs. Results are
kept in order, in memory, until the backend answers `200` or a definitive `4xx`; network
errors, `5xx`, `401` and `503` keep them. The buffer holds 32: past that an `ACCEPTED` may be
dropped with a log line, a `TERMINAL` never, and new GoTos are refused with `BUSY`.

**Operating rule:** while `commands_enabled` is true, do not run `route_test.py` or send
goals from RViz. One goal sender per robot (`docs/architecture.md` §3.5). Nothing enforces
this yet; enforcement is M2.3.

`report_period_sec` must be below the backend's 2 s telemetry limit or polls are refused
with `STREAM_NOT_CURRENT`; the node warns at startup.

Limits left to M2.3:

- A restart starts a new stream and remembers nothing, so it never re-runs a command. It
  also does not cancel goals: a goal left by a crashed bridge keeps running (no blind
  cancel-all, ADR-0008). Handling that orphan goal is M2.3.
- No local stop on heartbeat loss.
- `localized` and `motionReady` are still reported as null, so a real backend Start fails
  those checks until M2.3 gives them robot-side sources.
