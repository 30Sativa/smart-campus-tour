# ADR-0068: In camera mode the planner sees the depth camera, and recoveries keep the robot's surroundings

Status: **proposed** 2026-11-25 (owner asked on the robot: "nó thấy vật cản né ra chứ", the robot
should go around an obstacle it can see, not stop like an AGV). Partially supersedes ADR-0001 for
camera mode only (`robot nav --camera`). LiDAR-only runs are unchanged.

## Context

ADR-0001 puts the Astra Pro depth cloud into the **local costmap only**. The global planner sees
the static map and the LiDAR. RPP follows the planned path and checks it for collisions against
the local costmap; it does not search for detours (`docs/architecture.md` section 2). So a box
lower than the LiDAR plane gets no path around it: the planner routes straight through, and the
best the robot can do is stop in front of it.

On the robot, 25/11/2026 (`robot nav --camera`, runtime `4a0c8e5045`, RPP T = 4 s), it did not
even do that. A 15-20 cm box lay in the path. RPP reported "collision ahead" three times and the
robot stopped each time. Each stop made the behaviour tree clear the local costmap entirely, which
also erased the camera's mark of the box. While the box was still 0.6 m or more from the camera,
the next frame marked it again. After a recovery Spin and the turn back, the robot was closer.
Once the box was inside the camera's 0.6 m blind zone, the next clear erased the mark for good and
the robot drove into the box (`robot/docs/depth-camera.md` section 6.4). Humble cannot exclude one
layer from a clear (`clearable_layers` arrived after Humble).

## Decision

Only when the depth camera is on, `robot_navigation/launch/navigation.launch.py` hands Nav2 a copy
of the configured params and trees with these changes (and the existing RPP T = 4 s):

1. **Depth in the global costmap.** The local `depth_obstacle_layer` is copied into the global
   costmap, before inflation, with `obstacle_max_range` 2.0 m (local: 3.0 m). The planner replans
   at 1 Hz, so a low box seen up to 2 m ahead gets a path around it when there is room. Without
   room, the planner keeps a path through the box, RPP stops in front of it and the robot waits.
2. **Recoveries keep the robot's surroundings.** Every `ClearEntireCostmap` in both trees (local and
   global) becomes Nav2's `ClearCostmapExceptRegion` with `reset_distance` 2.2 m. It clears only
   outside a 2.2 m square centred on the robot, which is 1.1 m around the centre: the camera sits
   0.394 m ahead of it and is blind for 0.60 m. What the camera can no longer see stays marked.
   Farther marks are still cleared, and the camera draws them again if they are real.
3. **The camera clears one cell past where it marks.** Both depth layers start ray-tracing at 0.65 m
   instead of 0.60 m, while they still mark from 0.60 m. With both at 0.60 m, a box that slid into
   0.55-0.60 m is no longer marked, yet the rays to whatever is behind it cross its cell at the
   0.6 m edge and erase it, before any BT clear. At the usual ~0.7 m stop, a removed box is still
   cleared by the rays, so the robot moves on.

The configured params file and trees are never edited. The copies are written into the session's
`$ROS_LOG_DIR/camera_nav2_*/` and named in the launch log.

## Consequences

- The robot goes around a low box seen early enough when there is room. When there is not, it stops
  0.6-0.7 m in front of it and waits. If someone moves the box away, the robot continues on the same
  goal. If the box stays, the BT runs its recoveries and the goal ends ABORTED; the robot never
  drives into it because of a clear.
- A mark the camera cannot clear stays longer:
  - a box removed while it was inside the blind zone;
  - a box removed with nothing behind it for the camera's rays (glass, open space);
  - a mark beside the robot, outside the camera's 58 degree field of view.

  Such a mark makes the robot wait or the goal abort instead of moving on. This trades a
  collision for a false stop. It must be measured on the robot.
- Global depth marks do not leave with a rolling window. Floor noise or a passer-by can leave
  marks along the route. The planner routes around them, and a planner failure clears everything
  outside the square. The 2.0 m range limits floor noise, which grows with range squared.
- Planner and global costmap CPU on the J5005 grow a little: the global costmap updates at 1 Hz
  and keeps only the latest cloud.
- Still not covered: an obstacle that appears inside 0.6 m in front of the camera, and anything
  lower than 8 cm (`min_obstacle_height`). The corner sonars do not look at the path ahead
  (`robot/docs/sonar-perception.md`).
- Rollback: `robot nav --no-camera`. LiDAR-only Nav2 uses the params file and trees byte for byte.

## Alternatives not chosen

- **Another controller** that searches local detours (DWB, MPPI): retuning V2/V3 from scratch, and
  MPPI is heavy on the J5005.
- **Only change the clears** (decision 2 alone): no collision, but the robot always stops in front
  of a low box, even with room to pass.
- **Depth in the global costmap with full clears**: the planner would forget the box too, and keep
  sending the robot back towards it.
- **Collision Monitor / VoxelLayer / STVL**: see `robot/docs/depth-camera.md` section 6.3.

## Verification

- `robot/ros2_ws/src/robot_navigation/test/test_camera_nav2_params.py`: exactly these changes for
  V2, V3 and `nav2_params.yaml`; every shipped tree has all its clears swapped; LiDAR-only untouched.
- `robot/tools/depth_camera/stop_sim.py --clear except` (real Humble costmap) and
  `robot/tools/depth_camera/avoid_sim.sh` (real Nav2 stack, simulated robot and depth box). Results
  in `robot/docs/depth-camera.md` section 6.4:
  - room to pass: the old camera mode crept into the box and hit it; the new one goes around;
  - blocked: the new one waits and moves on when the box is removed, or aborts without contact;
  - a box appearing 0.65-0.7 m ahead is kept only with both decisions 2 and 3;
  - a box appearing inside 0.6 m is still hit: that is the camera's physical limit.
- Acceptance on the robot: `robot/docs/depth-camera.md` section 7.
