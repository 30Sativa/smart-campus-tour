# Local six-robot fleet on the V3 model

The idle Operational Twin on `/staff/robot`, `/staff/live` and the wider
`/staff/digital-twin` workbench starts six robots automatically. There is no
separate demo switch. **Điểm point** toggles ten numbered rings, initially
hidden. Thin light-blue dashed lines show remaining routes; shared collinear
segments are drawn once as solid lines, including opposite-direction overlap.
A crossing at a single point does not become solid. The dash animation
advances toward its destination with the fleet clock. Fullscreen, overhead/3D,
traffic, heatmap and optional virtual sensor views are available.
The floating five-button toolbar selects robots, pans the map, toggles routes
and point labels, and measures horizontal model distances by clicking two map
positions. Route destinations retain small light-blue floor rings even while
all numbered point labels are hidden. Downward blue-tinted beams and soft floor
glows align with two ceiling fixtures per furnished room and a sparse corridor layout.
Fixture positions come from the floor geometry, independently of robot points.
The broad 2.4 m light spread remains faint; beams and floor glows use two
instanced batches with six spatially distributed live corridor spotlights.

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
Two rooftop-garden corner marks are shifted onto reachable floor instead of walls.
Positions live in `web/src/features/digital-twin/patrol-nav.json`, in imported
model X/Z units. The affine display fit is not ROS calibration.

Regenerate navigation with `cd web && node scripts/export-patrol-nav.mjs`.
The exporter samples floors and mesh obstacles at four body heights, excludes
the atrium and checks all edges for footprint clearance. It retains a connected
0.75 m grid of 1,582 nodes, ten POIs and the source model SHA256. The enclosing
robot radius is approximately 0.496 m; static clearance is at least 0.6 m and
robot centers retain at least 1.4 m separation.

## Motion and priority

The deterministic engine advances at 50 ms steps. Heading-aware A* follows validated graph
edges and replans around occupied cells and temporary blocked zones. A 1.125 m
turn cost prefers straight runs over unnecessary grid staircases. Each unblocked
point pair uses a canonical route, reversed exactly for return travel;
the route is then shortened into any-angle straight segments. Samples at 0.15 m
spacing must stay connected to the walkable grid, avoid blocked nodes and keep
0.62 m from original obstacle segments. Robots and route lines follow these
same shortcuts; the independent model-geometry test checks floor coverage and
full body clearance for every POI pair. This is A* post-smoothing inspired by
the line-of-sight principle in [Theta*](https://arxiv.org/abs/1401.3843), rather
than a claim to compute a globally optimal route.
Every accepted movement checks the full swept segment against other robots.
Any-angle legs use nearby free graph nodes when pulling aside; yielding before
a blind branch releases its reservation to prevent circular waiting.
Cruise speeds are 0.8–0.9 model units/second. Robots now follow a complete corridor
circuit: 1 → 5 → 4 → 3 → 2 → 10 → 9 → 8 → 7 → 6 → 1, rotated to each robot's
starting point. Point 2 is an inner-corridor excursion. Routes use the connected
navigation graph, including the return detour into the blind Point 8 branch;
the mesh does not provide a continuous outer corridor between every marker.
Each lap randomly skips 1–3 observation stops. A circuit
anchor is still traversed when its dwell is skipped, preventing a shorter route
from cutting away part of the lap. The Point 2 excursion is omitted when skipped.
Each selected stop begins 60 simulated seconds of observation. A task completes
only after this dwell; an interrupted dwell resumes with its remaining time.
Lap completion is counted only after physically returning to the starting
anchor. Manual tasks and charging resume the remaining circuit afterward.
The robot panel shows completed laps and the current skipped stops.

R1 has the highest priority, followed by R2 through R6. Approaching conflicts
within 3.5 model metres request yielding; parallel or departing traffic stays
on its route. A blocked robot also checks the nearby conflict at a turn.
A larger-numbered robot
searches for a connected free bay outside the priority robot's route, travels
there without teleporting, holds until the priority robot finishes its current
travel leg, then rejoins when both separation and its remaining route are clear.
The priority robot grants an escape window while the yielding robot is still
on its route. If no safe bay/path is available, robots wait and replan. This is
browser traffic behavior, not a physical collision-avoidance guarantee.
The blind branches at Points 8 and 9 are reserved for one robot through their approach,
dwell and exit. Other visitors travel to connected waiting bays off the branch's
entry/exit route; yielding bays cannot occupy their narrow corridors. The Point 8
reservation also covers Point 7 on that same branch. The branch boundary stops
at its mouth so the main corridor remains available. Waiting
visitors receive subsequent reservations in robot-number order. The reservation is released only after the robot
clears the entrance plus its safety margin; priority cannot trap a robot inside.

Playback at 1× follows elapsed time; 5×/10× accelerate travel and dwell equally.
Global pause freezes the clock and route animation. Individual pause preserves
that robot's progress. Hidden browser tabs pause advancement; timers and async
work are disposed on unmount.

## Operations workbench

The campus opens in an axis-aligned elevated view with the garden at the bottom,
centered on the model. Initial camera distance adapts to the canvas aspect ratio
so the complete floor fits both desktop and narrow screens. The overhead toggle
retains this orientation; subsequent rotation, pan and zoom remain manual.

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
- **Camera:** fixed cameras at all ten POIs, plus an onboard scene camera or
  overhead CCTV for the selected robot. **Camera point** opens the point feed
  and shows C1–C10 buttons at their map locations. Select a button or **Điểm
  camera** to change the feed. Fixed cameras stay 2.4 model metres above their
  POI and look along a walkable corridor, independent of robot movement.
  Optional scene analysis checks fixed-camera geometry in a 75°/8 m region;
  the robot camera retains its 270°/4 m observation region. Both use a
  navigation-graph visibility check. These are scene views, not real streams
  or VLM analysis. The fleet clock controls their robot motion.
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
separation, speed bounds, full circuit closure with seeded skipped stops,
continued visits across four seeds, lower-number priority, full dwell completion,
charging/task resumption, blocked-cell routing, fixed camera placement/selection,
Copilot snapshots, what-if isolation/cancellation and UI controls. Routes are
flat floor markings, 0.1 model metres wide, 75 mm above the structural slab
and 20 mm above the 55 mm decorative floor finish. Their width scales with the
map, with a 0.9 pixel minimum so distant markings remain readable, and
their clock-driven dashes flow along the surface toward the destination.
The light blue bypasses scene tone mapping so it remains visible on the graphite floor;
normal depth testing still lets walls and robots occlude the line. Geometry
checks cover floor height, route alignment, width, turns and dash distance.

The web-owned model uses blue-grey walls, one graphite stone finish for all
classroom/corridor floors and warm emissive light fixtures. Furnished rooms have
two balanced fixtures on a shared straight axis in each room; empty rooms receive no fixtures.
Fixture housings mount flush below the shell's 5 m ceiling datum. The navigation
snapshot exports the diffuser height so both downward beams and spotlights follow
the authored fixtures rather than a separate fixed height.
Corridor fixtures follow straight architectural runs around the atrium and the garden.
Each run has one fixed lateral offset and one fixture heading. A shared phase along the
run clears columns while preserving a 7 m rhythm, with corner fixtures omitted when
they would crowd another run. A connected floor mask with closed door planes keeps corridor fixtures
out of the empty rooms sharing the shell floor. Complete fixture footprints stay over floor and away from walls,
and the open atrium receives no ceiling fixtures. All
three low atrium rings are removed as complete connected parts; tall blue-grey
columns, the 59 glass panes and the prepared door alignment remain. Only the
three annotated rooftop-garden edges receive new upper glass panes over 0.45 m
thick blue-grey lower walls; the fourth outside railing and unmarked room walls
remain intact. The lower wall ends at model Y=1.95 m, about 0.8 m above the new
garden paving. The 602 corner
glazing wraps outside its column before rejoining the prepared door plane.
The former empty rectangle is the NVH sixth-floor rooftop garden. Its original
slab is at model Y=1 m, above the circulation floor. Four angular paving islands
trace the supplied plan and leave connected diagonal lanes using the same
graphite texture and colour as the room floors. The lanes are 2 m wide and
40 mm below the surrounding surface. Two triangular and one rectangular solid stone benches match the plan;
trees, shrubs, flowers, lawn and planting soil have been removed. Six open steel
pergola portals span the main diagonal lane, with each post's inner face
aligned to its respective road edge and 2 m clear walking width.
The whole-floor reference fixes the plan orientation: its top edge faces the
atrium, both triangles sit at the left end, and the rectangular bench sits at
the outside right. The marked atrial entrance has a 2.4 m aluminium glass
double door and a transom; the lower wall and glazing are split around it.
The main lane connects this entrance to the diagonal route between the
angular islands, and the six portals follow that lane.
Original partition thickness is inferred from paired wall faces at every
replacement facade. Solid returns restore the ends cut by the glazing
clearance, joining partitions to glass without filling prepared door openings.
The longitudinal wall beyond the last classroom glass bay is also restored
across the 0.6 m endpoint overrun, without reinstating the glazed frontage.
The 602 frontage extends to its measured partition plane instead of stopping
at the approximate traced endpoint. Its corner glazing reaches model Y=4.975 m
and includes a glass transom above the prepared door, with no opaque end strip.
The replaced bent facade is excluded from solid-return restoration, so old
facade ends do not reappear as opaque blocks behind the continuous corner glass.
Partition faces split by prepared doors are grouped before fitting a return.
At a corner, both wall directions are restored; deduplication distinguishes
their direction and side instead of dropping a wall with the same join point.
The 614 doorway moves onto its right long facade and its former aperture is
filled with the same opaque wall finish. New openings on the 615/616 frontage,
a second 615 entrance and the 617 entrance fit the original wall faces. The
other 17 prepared doorways retain their alignment. All 22 receive full glass
double leaves with satin aluminium frames, central stiles and paired handles.
This layout follows the supplied plan as a visual model, not a new survey.
The fixtures emit from their undersides, with downward corridor spotlights.
The scene and point cameras share lighting and a directional shadow map;
depth and normal bias prevent self-shadow stripes on the walls.
Only opaque structure, columns, garden benches/pergolas and robots cast shadows, limiting the extra
draw calls from classroom furniture. Regenerate the styled asset with
`cd web && node scripts/style-campus-model.mjs`, then regenerate navigation.

Rendered browser inspection is also required for WebGL, point rings, cameras,
animated routes, fullscreen and mobile layout. Scripts do not establish physical
map calibration, ROS navigation or real robot avoidance.
