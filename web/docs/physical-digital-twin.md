# Physical robot Digital Twin preparation

## Campus display styling

The V3 view loads `web/public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb`.
Rebuild this independent display asset with `node web/scripts/style-campus-model.mjs`
from the repo root. The original V3 GLB and legacy OBJ remain available unchanged.
The styled variant uses light terrazzo, ivory walls and pale aqua glass with slim
graphite aluminium framing along the two annotated corridor wall runs. The atrium
retains only its glass panels, without the former handrails, uprights and clamps.
Room furniture and embedded textures are retained. Styling is a visual proposal,
not a surveyed change to the physical building or ROS occupancy map.
The 18 replacement door assemblies fit rectangles measured from the shell's
lintel corners and matching jamb corners at floor level. Old added assemblies
are hidden, and the original opening infill is clipped. Glass walls use single
sheets with reserved door apertures. Wall triangles crossing a cutout are split
with interpolated normals/UVs instead of retaining triangles with outside vertices.
The long glazing run follows the same measured wall planes as its door frames.

## Implemented browser preparation

`web/src/routes/staff/DigitalTwinPage.tsx` renders a read-only physical robot
surface separately from the existing labelled local simulator. The Staff route
guard still applies. The physical surface starts disconnected, without a pose
or a robot marker. No production Hub is connected and no mock is used as a
fallback.

`web/src/features/digital-twin/robot-telemetry.ts` defines an internal browser
observation model and subscription seam. It is not an approved network DTO.
The eventual operations projection adapter must map into it after its payload
and reconnect/revision semantics have been agreed. It supplies robot identity,
map key, map frame, stream identity, sequence, pose capture time and finite
x/y/yaw values. Connection state is separate from pose freshness.

Invalid samples, duplicates, older capture times, another robot identity, and
map changes within one stream retain the previous sample. A restarted stream
needs a later capture time. A new source subscription resets the local view;
its unsubscribe function owns cleanup. Backend epoch/reset handling remains
part of the future agreed adapter, not a claim made by this browser seam.

The view recomputes pose age every second using the existing five-second Staff
presentation threshold. A fresh connection does not freshen the last pose.
Disconnected/reconnecting or old poses are labelled stale. A placed stale
robot snaps to its last sample and does not continue interpolating. No motion
commands, execution state, battery or head measurement are synthesized.

## Calibration required before placement

The physical preview defaults to the self-contained NVH floor 6 V3 GLB from
`web/public/models/simulator-map/NVHSV_Tang6_V3.glb`, copied from
`robot/Map3d/NVHSV_Tang6_V3.glb`. The model selector can show the previous OBJ
for comparison. GLB display preserves Y-up, centers its horizontal bounds,
fits its maximum horizontal size to 20 units and places its lowest bound at
ground level. This is a display fit, not a measured ROS coordinate transform.
Scene calibration must carry the selected asset's `modelKey` (`nvh-v3` or
`legacy`); existing entries without one belong to the old `legacy` model.
Changing the selected asset never reuses another model's calibration.

The current OBJ display fits a model to a 20-unit width; it is not a surveyed
ROS alignment. Physical `map2-v1` and `map2-v2` have uncalibrated entries in
`web/src/features/digital-twin/map-config.ts`. Numeric pose remains visible,
but a robot marker requires a matching map key and measured scene calibration.

Measure at least three non-collinear landmark pairs in the ROS map and the
displayed model. Scene targets for `fitAffine()` use `(scene X, -scene Z)`.
Record the fitted transform against the exact model version and map key,
then check an independent fourth point and body heading. Only after this
check should `scene.calibrated` become true. Model replacement invalidates
the old calibration. Do not treat the Gazebo preview transform as physical
robot calibration or relabel stored POIs.

## Later miniPC integration

1. Complete the ADR-0008 Python/SignalR compatibility checkpoint. The current
   harness evidence is blocked and does not authorize a production bridge.
2. Agree operations projection payload, auth and restart/reconnect rules in
   `docs/architecture.md`; implement the separate fleet and operations paths.
3. Map operations observations into the browser seam. Read physical pose from
   TF `map -> base_footprint`; preserve capture time, map identity and frame.
4. Apply measured 3D calibration and inspect the Staff page with real samples.
5. Verify stationary pose, translation, heading, stale TF, silent loss,
   reconnect and backend/bridge restart. No physical motion control is part
   of this preparation.

Automated browser checks do not prove ROS TF freshness, physical localization,
network recovery or surveyed map alignment. Those remain integration checks.
