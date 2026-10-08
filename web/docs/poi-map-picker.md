# Admin POI occupancy-map picker

## Workflow and scope

At `/admin/pois/new`, enter a name, click a position on the ROS map, then click
a direction to commit body heading. Create saves an inactive POI through the
existing API. Edit uses the same picker; numeric X/Y/yaw fields are available
under the fine-tuning disclosure. A new position clears yaw so the Admin must
choose a heading or enter one numerically. Selecting a different map clears
all three draft pose fields. No request is sent until Save.

Zoom buttons, Fit, center-on-POI and drag-to-pan work without changing the
pose. Pan is a separate mode from position/heading selection. Escape cancels
the current selection preview; it does not restore already committed draft
coordinates. Use Reload to restore the persisted draft after a conflict.
Numeric input remains an alternative to pointer interaction. Editing numeric
pose fields exits the selection mode.
The form uses application validation so missing/invalid numeric values report
an error even when fine-tuning is collapsed. Escape exits selection mode but
does not invent a yaw; Save still requires all three pose values.

The API usage flags govern editing. Route/history locks keep the pose viewable
and allow zoom/pan, while content can still be edited. READY/RUNNING use locks
all mutations. A missing map/frame package never falls back to another raster;
stored map context and numbers remain readable/editable according to the API's
permissions. Content-only edits preserve the stored pose and the draft's
original RowVersion, including a stored rounded yaw of `3.141593`.

Occupied/unknown cell warnings are advisory. Free cells do not prove clearance,
reachability or localization. A new/changed pose on a registered map must be
within its bounds. An unchanged stored pose outside the map does not block a
content correction. Image failure does not erase the draft; numeric entry is
still available. These checks do not add backend map/occupancy validation.
Robot pose lookup, live telemetry, navigation commands and route editing are
outside this slice.

## Source and geometry contract

Source: `robot/robot_maps/map2.yaml` referencing `robot/robot_maps/map_fix.pgm`.
Current package key: `map2-v2`; frame: `map`. `map2-v1` remains available for
existing POIs. These are explicit registration values,
not keys extracted from the YAML or aliases for demo/Twin maps.

The image is 1419x1949 cells at 0.05 m/cell, origin `[-15.3,-76.1,0]`.
Navigation packages must have origin yaw exactly zero; both the exporter and
catalog reject nonzero yaw. Nav2 Humble's
[StaticLayer](https://github.com/ros-navigation/navigation2/blob/humble/nav2_costmap_2d/plugins/static_layer.cpp)
and [AMCL](https://github.com/ros-navigation/navigation2/blob/humble/nav2_amcl/src/amcl_node.cpp)
use map origin position without its orientation. The transform equations
describe OccupancyGrid geometry; accepting a rotated navigation map would not
guarantee agreement with those consumers.
For continuous top-left image coordinates `(u,v)`, rotate
`0.05 * (u,1949-v)` by the origin yaw, then add origin X/Y. With this source:

```text
x = -15.3 + 0.05u
y = 21.35 - 0.05v
```

ROS `(0,0)` is image `(306,427)`. Top-left cell center `(0.5,0.5)` is
`(-15.275,21.325)`. Continuous clicks receive no extra half-cell offset.
Yaw is counter-clockwise from +X about +Z, in radians. Newly selected positions
use four decimal places and yaw uses six, matching the POI API. Cell indexing
uses ROS half-open grid bounds, with row zero at the top of the image.

The browser draws one PNG in SVG with a pose overlay. Pointer conversion
inverts the SVG's screen CTM, accounting for letterboxing, zoom and pan.
An offscreen Canvas reads original PNG cells once per load, without rescaling;
unavailable/invalid samples remain explicit. Student/Twin calibration is a
separate presentation contract in `web/src/features/digital-twin/map-config.ts`.
The manifest's image path remains deployment-relative. The catalog prefixes
Vite `BASE_URL` once; SVG display and raster sampling share that resolved URL,
including deployments under a sub-path.

## Export and map revisions

From `web/`:

```bash
npm ci
npm run maps:export
npm run maps:check
```

`web/scripts/export-poi-map.mjs` uses dev-only `yaml` and `pngjs`, resolving
the source image path from YAML. It supports 8-bit binary P5 PGM and Nav2
Humble trinary semantics. It fails on unsupported input rather than guessing.
Each source cell becomes one PNG pixel in the same row/column: occupied 0,
free 255, unknown 128. No crop, resize, rotation or interpolation occurs.
The palette is semantic, not an unchanged copy of source grayscale values.

Generated outputs:

- `web/src/features/administration/pois/map/map2-v2.generated.json` records
  dimensions, full origin, thresholds, source hashes and semantic fingerprint.
- `web/public/maps/map2-v2/occupancy-1d2cd4d1fec9fe1c.png` is the current
  fingerprinted deployment image.

The exporter refuses changed geometry/occupancy under an existing key. For
a new snapshot, run `npm run maps:export -- --map-key map2-v3`, register its
manifest in `web/src/features/administration/pois/map/catalog.ts`, and update
the export/check default key (including `maps:check`) and real-source tests.
The current check deliberately fails if the robot source changes under
the current `map2-v2`; it must not silently accept a new source as that snapshot.
Retain old assets while POIs reference those keys;
never bulk-relabel stored POIs. Verify source parity before releasing the Web
package. Web builds consume committed outputs; exporting/checking requires the
repo source files, but production browser/build rendering does not.

`web/scripts/verify` runs the map source check alongside normal Web checks.
Static assets are public deployment files; an Admin route guard does not make
the PNG private. A future requirement for access-controlled maps needs an
authorized asset-delivery path.

## Current source caveat and verification

Nav2 Humble classifies gray 205 as unknown with the current source's `negate: 0`
and `free_thresh: 0.196`. `map2-v2` has 442,025 free, 32,941 occupied,
and 2,290,665 unknown cells. The PNG follows that interpretation. Do not change
robot thresholds or infer unknown space from grayscale appearance in this
feature. Review map semantics separately before physical navigation.
`map2-v1` remains a fixed snapshot with `free_thresh: 0.25`, where gray 205 is
free and there are no unknown cells. Existing POIs keep that snapshot and are
not relabeled automatically. Neither snapshot proves navigation suitability.
Before entering operational POIs, the robot team must
review the intended unknown/free semantics and verify the loaded map at
runtime. Any subsequent threshold change follows the new-MapKey procedure;
existing POIs require explicit review against that revision rather than a
bulk relabel.

Automated checks cover every exported cell, fingerprints, coordinate anchors,
rejection of rotated map origins, screen transforms, arrow direction,
precision, warnings, picker/form state,
unsupported maps, locks and concurrency. A SQL-backed POI endpoint test covers
POST/GET/PUT/GET precision and map/frame persistence. From the repo root:

```bash
bash scripts/verify web backend
```

Configure `SMARTCAMPUS_SCHEMA_TEST_CONNECTION` for a disposable local SQL
Server test instance as described in `backend/database/README.md`; SQL test
skips are not persistence verification. Browser QA must inspect SVG placement,
zoom/pan, letterboxing, resize and touch in addition to jsdom tests. None of
these checks proves which snapshot the miniPC currently loads or that a robot
can navigate to a selected point.
