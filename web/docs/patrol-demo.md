# Local six-robot fleet on the V3 model

The idle Operational Twin on `/staff/robot`, `/staff/live` and the wider
`/staff/digital-twin` workbench starts six robots automatically. There is no
separate demo switch. **Điểm point** toggles ten numbered rings, initially
hidden. Each robot has a colored dashed remaining route; its dash animation
advances toward its destination with the fleet clock. Fullscreen, overhead/3D,
traffic, heatmap and optional virtual sensor views are available.

## Source and scale

The browser fleet is labelled **Chưa kết nối miniPC** and **Vị trí tính trên web**.
It does not publish commands or poses, populate the Staff query cache, replace
active-Tour observations or represent six connected physical robots. An active
Tour keeps its existing observation surface. Tasks, events and metrics here
belong only to this browser session. Reset/reload clears them.

Robot visuals come from
`robot/ros2_ws/src/robot_description/urdf/robot_expanded_sim.urdf` and its STL
meshes. Regenerate the web-owned GLB with
`cd web && node scripts/export-robot-model.mjs`. Joint/visual origins, STL
millimetre-to-metre scales, materials and floor contact are preserved, with ROS
Z-up converted to Three Y-up. The robot is approximately 0.810 × 0.570 × 0.494 m
and uses the campus model's display scale. The original fixed camera mount is
preserved. Map survey units and measured ROS alignment still need calibration.

Ten POIs approximate the annotated screenshot locations, snapped to usable
floor of `web/public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb`.
Two auditorium-corner marks are shifted onto reachable floor instead of walls.
Positions live in `web/src/features/digital-twin/patrol-nav.json`, in imported
model X/Z units. The affine display fit is not ROS calibration.

Regenerate navigation with `cd web && node scripts/export-patrol-nav.mjs`.
The exporter samples floors and mesh obstacles at four body heights, excludes
the atrium and checks all edges for footprint clearance. It retains a connected
0.75 m grid of 1,512 nodes, ten POIs and the source model SHA256. The enclosing
robot radius is approximately 0.496 m; static clearance is at least 0.6 m and
robot centers retain at least 1.4 m separation.

## Motion and priority

The deterministic engine advances at 50 ms steps. A* follows validated graph
edges and replans around occupied cells and temporary blocked zones. Every
accepted movement checks the full swept segment against other robots. Cruise
speeds are 0.8–0.9 model units/second. Destinations are random, avoiding the
current point and other claimed destinations when possible, rather than cyclic.
Each arrival begins 60 simulated seconds of observation. A task completes only
after this dwell; an interrupted dwell resumes with its remaining time.

R1 has the highest priority, followed by R2 through R6. A larger-numbered robot
searches for a connected free bay outside the priority robot's route, travels
there without teleporting, holds, then rejoins its task after the route clears.
The priority robot grants an escape window while the yielding robot is still
on its route. If no safe bay/path is available, robots wait and replan. This is
browser traffic behavior, not a physical collision-avoidance guarantee.

Playback at 1× follows elapsed time; 5×/10× accelerate travel and dwell equally.
Global pause freezes the clock and route animation. Individual pause preserves
that robot's progress. Hidden browser tabs pause advancement; timers and async
work are disposed on unmount.

## Operations workbench

**Bảng vận hành** opens these tabs:

- **Robot:** selection, pose-linked status, battery, distance, wait time,
  individual pause and recovery. Clicking a robot in the scene selects it.
- **Nhiệm vụ:** manual point assignment, six-task bursts, queued/running/completed
  records and assignment explanations. The score combines distance, queue length
  and battery; faulty robots and robots below 20% are excluded.
- **Nhật ký:** per-robot filtering, latest 200 events, CSV and JSON snapshot
  export. There is no server persistence.
- **Thống kê:** arrivals, completed tasks, mean completion time, completion within
  the local 300 s target, distance, waits, yields, utilization, battery and recent
  task-completion history. These are local fleet metrics, not Tour analytics.
- **Kịch bản:** robot fault/recovery, low battery, a blocked-point zone lasting
  90 s, virtual camera outage and task bursts. Below 15%, a robot defers its task
  and visits the nearest virtual charger at Point 6/10, then resumes at 95%.
- **AI Copilot:** local rule-based answers grounded in the current fleet snapshot,
  with clickable robot references. No LLM service is called or configured.
- **Camera:** an onboard scene camera or overhead CCTV for the selected robot.
  Optional scene analysis checks robot geometry in a 270°/4 m region with a
  navigation-graph visibility check. It is not a real stream or VLM analysis.
- **What-if:** baseline and scenario copies start from the same snapshot and
  matching seeds, run for 1/3 minutes with 1/3/5 seeds, and compare arrivals,
  distance and waits. The live fleet is untouched. Seed ranges are not confidence
  intervals or validated real-world predictions.

These campus tools are inspired by
[WareTwin](https://github.com/WayneChou-bot/WareTwin). Warehouse conveyors,
multiple floors/lifts, production AI services and physical telemetry are not
implemented by this browser fleet.

## Verification

Run `scripts/verify web` from the repo root. Automated checks cover graph/model
parity, floor/obstacle clearance, bidirectional connectivity, full swept robot
separation, speed bounds, continued visits across four seeds, lower-number
priority, full dwell completion, charging/task resumption, blocked-cell routing,
Copilot snapshots, what-if isolation/cancellation and UI controls.

Rendered browser inspection is also required for WebGL, point rings, cameras,
animated routes, fullscreen and mobile layout. Scripts do not establish physical
map calibration, ROS navigation or real robot avoidance.
