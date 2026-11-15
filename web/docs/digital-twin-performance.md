# Digital Twin performance (`/staff/digital-twin`)

What keeps the 3D view cheap, the thresholds it must stay under, and how to
measure it. Applies to `features/staff/components/FleetTwin.tsx` and the
shared scene in `features/digital-twin/`.

## Thresholds

| Measure | Threshold |
|---|---|
| Draw calls per rendered frame (`renderer.info.render.calls`) | under 300, in both modes (real robots only; simulation on) |
| Campus model download | under 4 MB |
| Frame rate at 1366×768 | 60 FPS on a discrete GPU; above 30 FPS on integrated graphics |

`src/features/digital-twin/campus-model-optimized.test.ts` enforces the
model's size, compression and material names in `scripts/verify`. Draw calls
and FPS need a real GPU, so measure them with `?perf=1` as described below.

## How the view stays under them

- **Model built ahead of time.** `web/scripts/optimize-twin-model.mjs`
  (`npm --prefix web run model:optimize`) turns
  `public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb` into
  `NVHSV_Tang6_V3_modern_v2.opt.glb`. It runs dedup (distinct material names
  kept), GPU instancing, flatten, join by material, weld, and meshopt
  quantisation and compression. The two transmission glasses become plain
  blended glass of the same colour at opacity 0.30, and clearcoat is dropped:
  transmission costs three.js a whole extra render pass. The script loads its
  output with three's GLTFLoader and refuses to write it if the drawn bounds
  move by more than 1 cm or a drawn material name disappears.
  `prepareCampusModel` picks shadow casters by material name. `CampusModel`
  loads the result with three's own `MeshoptDecoder` and fits it with
  `NVH_V3_FIT`, the source bounds that `map-config.ts` places robots with. A
  Box3 fit would grow around rotated instances and move the building away from
  the robots.
- **Shadows drawn once.** The campus does not move. `shadowMap.autoUpdate` is
  off, and the map is drawn once after the model loads. Robots cast no map
  shadow; each has a soft contact blob instead.
- **Frames only when needed** (`features/digital-twin/frameloop.ts`):
  - `demand` with real robots only. A frame is drawn on a telemetry, label or
    route change, on camera or OrbitControls movement, during a camera
    flight, and while a robot is still easing or pulsing.
  - `always` while the simulation runs.
  - `never` while the view is off screen (IntersectionObserver) or the tab is
    hidden.
  - A running Tour forces the simulation off, so the view is then on demand.
- **Resolution follows speed.** drei's `PerformanceMonitor` moves DPR between
  1 and 1.5, and `AdaptiveDpr` drops to 1 while the camera moves.
- **Patrol outside React.** `useSimulatedPatrol` steps the patrol in a ref.
  Robots read an interpolated pose every frame (`livePose`), and React (lists,
  traffic rings) gets a snapshot at most 4 times a second. Each CAD patrol
  robot's 142 parts are merged into one mesh per colour group, shared by all
  six robots.
- **Stable props.** The robot list passed to `TwinScene` keeps its identity
  while nothing drawn changes, and `TwinScene` is memoised.
- **Camera point feed** (`FleetCamera`, workbench only): no shadows, drawn on
  demand when its view or the patrol snapshot changes, at most 4 times a second.

## Measuring

Open `/staff/digital-twin?perf=1`. The overlay shows FPS (frames actually
drawn), draw calls, triangles and textures of the last frame, and the loop mode.
While `demand` and idle, FPS reads 0: nothing is drawn.

### Before and after (2026-11-15)

Measured with Playwright in headless Chromium at 1366×768 on an **NVIDIA GeForce
RTX 4060 Laptop GPU** (ANGLE / Direct3D 11, Windows 11). Draw calls and triangles
were counted per rendered frame by wrapping the WebGL draw functions. The page
used sample data: one physical robot on map2-v2; simulation off or on. "Close" is
the default flight to the robot; "wide" is zoomed out over the whole floor.
"Orbiting" means the camera was being dragged while measuring.

| Mode, view | Before: draw calls / triangles | After, idle | After, orbiting: draw calls / triangles |
|---|---|---|---|
| Real robots, close | 151 / 164k, 60 FPS drawn continuously | 0 frames drawn | 51–58 / 269k, 60 FPS |
| Real robots, wide | 1,560 / 352k, 60 FPS continuously | 0 frames drawn | 61–71 / 274k, 60 FPS |
| Simulation, close | 1,152 / 1.42M, 60 FPS | 79 / 438k, 60 FPS | 78–99 / 531k, 60 FPS |
| Simulation, wide | 2,988 / 2.14M, 60 FPS | 117 / 631k, 60 FPS | 136–170 / 990k, 60 FPS |
| Model download | 16.6 MB (`_modern_v2.glb`) | 1.7 MB (`.opt.glb`) | |

The 15/11 production reading (7,062 and 3,961 draw calls, about 36 FPS at
765 px) came from the earlier page, which drew two scenes. Integrated graphics
have not been measured yet.
