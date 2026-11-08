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

## Mini PC diagnostics report (on by default)

`diagnostics_enabled: true` adds a second background HTTPS thread that sends one snapshot every
`diagnostics_period_sec` (10 s, allowed 1..30 s) to `POST /api/fleet/v1/diagnostics`, with the same credential
and TLS rules as Fleet Sync. The URL is the sibling of `FLEET_SYNC_URL` unless `diagnostics_url` is set. The
backend shows it on the Technical Staff pages `/technical/dashboard` and `/technical/monitoring`, and treats a
report older than 60 s as stale. It is observation only: it never changes Fleet Sync, Nav2 or commands, and a
failed report is dropped (never retried) and logged once until a report is accepted again.

| Report section | Source |
|---|---|
| `miniPc.cpuPercent` | `/proc/stat` busy share since the previous report (null on the first) |
| `miniPc.memory` | `/proc/meminfo` `MemTotal` / `MemAvailable` |
| `miniPc.disk` | `statvfs(diagnostics_disk_path)` (default `/`), same basis as `df` |
| `miniPc.cpuTemperatureCelsius` | hottest `/sys/class/thermal` zone of type `x86_pkg_temp`, `coretemp`, ... |
| `miniPc.gpu` | null: not measured on the Mini PC |
| `sensors.lidar` / `odometry` / `depthCamera` | arrival rate of `scan`, `wheel/odom`, `camera/depth/points` (relative to the namespace), raw subscription with sensor-data QoS |
| `sensors.imu` | the `stm32_bridge` `<namespace>/stm32_bridge_node: imu` status on `/diagnostics` (level, message, outages, firmware counters) |
| `ros2` | `middlewareStatus: OK`, `tfValid` from this node's `map -> base_footprint` sample, `nav2State: UNKNOWN`, no node list |

Anything that cannot be measured is sent as null ("could not measure"), never zero. A sensor topic with no
message yet is `UNKNOWN`; silent for `diagnostics_stale_after_sec` (3 s) is `STALE`; below its minimum rate is
`WARN`. Set a topic parameter to `""` for a sensor the robot does not have (`NOT_EQUIPPED`). Nodes and Nav2 state
are not reported because graph introspection is unreliable under the Fast DDS Discovery Server. Set
`diagnostics_enabled: false` to turn the report off. Code: `diagnostics.py` (pure logic and HTTPS loop,
`test/test_diagnostics.py`) and `diagnostics_ros.py` (subscriptions only, no publisher).

## Head receiver (off by default, ADR-0045)

`head_enabled: true` adds a Fleet Head v1 long-poll loop (`docs/contracts/fleet-head/v1/`): the Operator's head
buttons from the web reach the `stm32_bridge` head interface in the same namespace. With `false` (the default) nothing
polls and `bus_interfaces` is not imported. Independent of `commands_enabled`; the backend must also set
`FleetHead:Enabled=true`.

| Command | ROS |
|---|---|
| `STEP` | publish `head/step` |
| `JOG` | publish `head/jog` at 10 Hz until this robot's receipt time + `ttlMs`, then `0,0` once |
| `STOP` | release a jog, call `head/stop` |
| `ANGLE` | release a jog, send `head/set` (mode angle), fire and forget |

Each `seq` runs once, in order; a new backend `epoch` restarts the count. A failed ROS call is logged and the next
command still runs. The latest `head/state` (fresh within 2 s) rides on the next poll. `head_wait_ms` (1500) must stay
below `request_timeout_sec`. Code: `head.py` (pure logic, `test/test_head.py`), `head_worker.py` (HTTPS thread),
`head_ros.py` (the only module allowed publishers, and only `head/step`/`head/jog`).

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

Each round posts the kept results first and then always polls, even when a result post
failed, so a result the backend cannot take yet never keeps a Cancel from arriving. A GoTo
polled in that round still meets the rules above (`BUSY` while a leg runs or the buffer is
full). The round counts as healthy only when both the results and the poll succeeded;
otherwise the next round backs off.

**Operating rule:** while `commands_enabled` is true, do not run `route_test.py` or send
goals from RViz. One goal sender per robot (`docs/architecture.md` §3.5). Nothing enforces
this yet; enforcement is M2.3.

`report_period_sec` must be below the backend's 2 s telemetry limit or polls are refused
with `STREAM_NOT_CURRENT`; the node warns at startup.

**Motion permit (ADR-0049).** With `commands_enabled`, the bridge publishes `motion_permit`
(`std_msgs/Bool`, RELIABLE, VOLATILE) every `motion_permit_period_sec` (0.2 s). It is `true`
only while the last HTTP 200 poll with a valid body is younger than
`motion_permit_link_timeout_sec` (1.5 s). If the link is lost during a leg, the bridge cancels
its own goal, holds the permit false until Nav2 ends that leg, and reports `FAILED`
`LOCAL_LINK_LOSS`, or `ARRIVED` if arrival came first. `mode_manager` must run with
`require_motion_permit: true`, and a person clears its latch with `motion_inhibit_reset`.
If Nav2's result cannot be read, no terminal result is sent and telemetry reports `UNKNOWN`.

Limits left to M2.3:

- A restart starts a new stream and remembers nothing, so it never re-runs a command. It
  also does not cancel goals: a goal left by a crashed bridge keeps running (no blind
  cancel-all, ADR-0008). `mode_manager` holds it at zero; detecting it in the bridge is step 3.2.
- `localized` and `motionReady` are still reported as null, so a real backend Start fails
  those checks until M2.3 gives them robot-side sources.
