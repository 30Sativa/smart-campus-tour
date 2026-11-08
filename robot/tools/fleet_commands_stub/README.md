# Fleet Commands stub backend

A fake backend for testing `fleet_bridge` with `commands_enabled: true`. It accepts Fleet Sync reports, serves
one GoTo (and optionally a Cancel) in the Fleet Commands v1 shape, checks the robot credential and prints each
result. Loopback only, standard library only. The unit tests in
`robot/ros2_ws/src/fleet_bridge/test/test_commands.py` use it too.

**Simulation only. Never point it at a physical robot:** that needs the M2.3 safety work.

## Gazebo procedure

Needs Ubuntu 22.04, ROS 2 Humble, Gazebo Classic 11 and the simulation stack from `robot/README.md` with Nav2 up and
localized. Run each block in its own sourced terminal. `X Y YAW` must be a free pose on the loaded map; `MAP_KEY` must
match on both sides.

```bash
echo test-credential > /tmp/fleet.cred
python3 robot/tools/fleet_commands_stub/fleet_commands_stub.py --robot-code robot_01 \
  --credential-file /tmp/fleet.cred --map-key MAP_KEY --goto X Y YAW
```

```bash
FLEET_SYNC_URL=http://127.0.0.1:8088/api/fleet/v1/sync FLEET_ROBOT_CODE=robot_01 FLEET_ROBOT_MAP_KEY=MAP_KEY \
FLEET_ROBOT_CREDENTIAL_FILE=/tmp/fleet.cred \
ros2 run fleet_bridge fleet_bridge --ros-args -r __ns:=/ROBOT_NAMESPACE \
  --params-file robot/ros2_ws/src/fleet_bridge/config/fleet_bridge.yaml \
  -p commands_enabled:=true -p report_period_sec:=0.5 \
  -p backend_url:=$FLEET_SYNC_URL -p robot_code:=$FLEET_ROBOT_CODE -p map_key:=$FLEET_ROBOT_MAP_KEY
```

Expected: the stub prints `ACCEPTED`, then `TERMINAL` with outcome `ARRIVED`, and exits 0. For the cancel case add
`--cancel-after-sec 3` to the stub and pick a far goal: expect `TERMINAL` with outcome `CANCELLED`, or `ARRIVED` if
the robot got there first.

With `require_motion_permit:=true` the gate starts latched, so add `--goto-delay-sec 25` to the stub and reset the
gate before the GoTo arrives. `--print-readiness` prints readiness telemetry when it changes. The scenarios and the
bridge parameters the readiness checks need are in `robot/docs/m2-3-gazebo-test-notes.md`.

`fleet_bridge` needs system time, so keep `use_sim_time` false; the telemetry and action calls do not need sim time.
