# ADR-0066: The four SR04T are a near-field speed guard, not a costmap source

Status: **Proposed** (23/11/2026). Opt-in (`sonar_mode`, default `off`); not hardware validated.
Evidence and acceptance: `robot/docs/sonar-perception.md`.

## Context

ADR-0001 makes the RPLiDAR the navigation backbone and the Astra Pro a local-costmap
supplement. `docs/architecture.md` still listed the four SR04T as "LOCAL costmap
ONLY", but their `RangeSensorLayer` has been out of every Nav2 params file since
23/09/2026: with it, the robot stopped or failed goals with nothing really in its way.

The causes are in the code (sonar-perception.md section 2): the bridge reports "no
echo", "too close" and "beyond 2 m" all as NaN, which Humble's RangeSensorLayer treats
as a neutral update, so a mark never clears; the layer has one shared timeout after
which the local costmap stays "not current" and controller_server waits in a loop
that does not even serve a cancel; and every lethal sonar mark reaches the robot only
through RPP's collision check, i.e. FollowPath failure, a recovery that wipes the whole
local costmap, and after six retries an ABORTED goal, which the Tour turns into
NEEDS_ASSISTANCE. The sensors themselves (corner mounts at ±45°/±135°, 0.216 m high,
a 0.20 m blind zone reported like "no echo", one reading per sensor every 0.29–0.42 s,
range without bearing) cannot place an obstacle well enough for a costmap.

## Decision

- Sonar feeds **no costmap** (local or global). The planner and RPP see LiDAR and
  depth only, so a sonar reading can no longer fail a FollowPath or a goal.
- With `sonar_mode:=enforce`, the stock Nav2 Humble `collision_monitor` sits between
  the controller/behavior output (`cmd_vel_ctrl`) and the velocity smoother. Its only
  polygon is `approach` on the costmap footprint padded by 0.05 m: a command is scaled
  down by the predicted time to contact with a sonar point and passes unchanged again
  when the point is gone. No goal is cancelled or failed by it.
- `sonar_memory` (robot_navigation) holds, in the odom frame, the arc of a confirmed
  near echo that turned into "no echo" (the object went into the blind zone), until a
  sonar sees through it; it also publishes the padded footprint.
- `sonar_mode:=shadow` runs the same nodes with the output unused, to measure what the
  guard would do before it is allowed to act.
- A silent sonar is ignored after `source_timeout` (fail-open to LiDAR + depth, as for
  the camera in ADR-0001). A collision_monitor that is not active in enforce mode
  means the robot does not move (fail-safe).

## Consequences

- No more goal failures or costmap wipes caused by sonar readings; a real blockage
  seen only by sonar shows as a robot that waits, then Nav2's own progress checker
  (15 s) and recoveries, as for any other stop.
- Coverage stays what the hardware gives: the diagonals near the corners. Straight
  ahead, the sides and astern are not covered, and nothing closer than 0.20 m is
  measured (the memory only covers objects seen before they got that close).
- Not every SR04T reading slows the robot: only those the commanded motion would
  reach within 1.5 s.
- Two robot-internal nodes and topics (`cmd_vel_sonar`, `sonar_guard/*`); no public
  interface changes.
