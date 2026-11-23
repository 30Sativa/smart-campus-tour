# Sonar scenarios (offline, real Nav2 V3)

Reproducible runs that tell apart the four things a "the robot stopped" report can
mean: a sensor reading, a costmap collision (RPP), a Nav2 abort, and an explicit
cancel. Design and results: [robot/docs/sonar-perception.md](../../../../docs/sonar-perception.md).

Everything runs in DDS domain 88, localhost only, beside `fakebot2.py` (the kinematic
robot of `../`); nothing touches the robot's graph. `sonar_run.sh` refuses to start
next to a live `controller_server` in another domain or a build.

```bash
cd robot/ros2_ws && colcon build --symlink-install --packages-select stm32_bridge robot_navigation robot_control
export NAV2_BENCH_OUT=~/amr_logs/nav2_bench            # results, outside the repo
robot/tools/nav2_bench/sim/sonar/sonar_run.sh enforce low_turn_removed 1
python3 robot/tools/nav2_bench/sim/sonar/sonar_report.py $NAV2_BENCH_OUT/sonar/*_s1
```

The build is overlaid on a runtime that has `robot_nav_plugins` (LatchedGoalChecker):
`SONAR_UNDERLAY`, default `~/.cache/sct-runtime/7a3ef41ef7/install`.

## Configurations

| config | Nav2 | sonar consumer | bridge `sonar_max_range` |
|---|---|---|---|
| `off` | V3 (`nav2_params_v3.yaml`) | none: the baseline | 2.0 |
| `legacy` | V3 + `sonar_layer` (RangeSensorLayer) back in the local costmap, exactly as commit 4cf5aa9f (26/08–23/09) | the costmap -> RPP | 2.0 |
| `shadow` | V3 | collision_monitor + sonar_memory, output not used | 6.0 |
| `enforce` | V3 | collision_monitor + sonar_memory between the controller and the smoother | 6.0 |

The simulated bridge uses stm32_bridge's own publish gate (`stm32_bridge/sonar_publish.py`)
with `sonar_publish_mode` as `navigation.launch.py` sets it: `every_frame` (each sonar with
every frame, 160 Range/s) for `off` and `legacy`, `on_change` (a new reading + 0.2 s
heartbeat) for `shadow` and `enforce`. `NAVSIM_SONAR_PUBLISH=every_frame|on_change`
overrides it, e.g. for a CPU A/B. Results before 23/11 15:00 were all `every_frame`.
`cpu_log.py` writes `cpu.csv` (per process, % of one core, 1 s); `sonar_report.py` prints
the mean over the goal (`cpu_*`) and the Range rate (`range_msg_s`).

## World and scenarios

`sonar_world.py` writes the map: a 1.6 m wide L corridor with a 0.9 m doorway. The
robot goes from (0, 0) east, turns left at the corner and passes the doorway to
(6.8, 6.0). `sonarsim.py` adds obstacles that are NOT in the map, the four SR04T
(URDF mounts, +-20 deg beam, firmware timing and `< 200 mm = no echo`, bridge
publishing on 40 Hz FB frames) and logs the footprint clearance.

| scenario | what happens |
|---|---|
| `clean` | nothing: doorway and walls only (false-stop check) |
| `low_front` | 0.10 m box straight ahead on the path, below the LiDAR plane |
| `low_turn` | 0.10 m box at the inner corner (6.25, 0.65): the left front corner sweeps it in the turn; it goes into the front-left sonar's blind zone about 1.5 s before contact; it stays |
| `low_turn_removed` | the same box, removed 45 s after the goal starts (`REMOVE_AT`) |
| `low_turn_gone_early` | the same box, removed at 24 s, before the robot gets there (a stale-observation check) |
| `noise` | 3 % of all sonar measurements are a random valid echo 0.25–0.80 m |
| `silent` | the sonar topics stop 8 s into the goal (bridge or serial link down) |
| `cancel` | the goal is cancelled by the client after 15 s (explicit cancellation) |

## Reading `sonar_report.py`

`result` is Nav2's own end of the goal, or `HUNG` when it did not end within
`NAVSIM_GOAL_TIMEOUT` and had to be cancelled. `rpp_collision`, `patience`,
`no_progress` are FollowPath failures by cause; `clear_local`, `spin`, `wait` the BT
recoveries; `guard_scaled_s` / `guard_stop_s` the time collision_monitor slowed or
held the command (no Nav2 involvement); `clear_low` the smallest footprint clearance
to the low obstacle (negative = contact) and `t_in_collision_low` the time spent in
contact.

The sim is cleaner than the robot (perfect odometry, no floor echoes, an ideal beam):
use it to compare configurations, not as proof of the real stopping distance.
