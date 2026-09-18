# Visitor campus model

The viewer at `/visit/map` currently loads `web/public/models/campus/campus.obj`,
a copy of the campus asset in
`robot/ros2_ws/src/simulation/models/campus_map/meshes/map.obj`.
The original robot asset is unchanged. This copy is Z-up, uses its original
units, and is rendered with a neutral architectural material. The OBJ's MTL
is intentionally not loaded.

## Replace the model

1. Place the model under `web/public/models/campus/`. A self-contained `.glb`
   is easiest to deploy. For `.gltf`, include its `.bin` and texture files with
   the same relative paths. OBJ geometry is also supported. Export other
   authoring formats to one of these formats first.
2. Edit `CAMPUS_MODEL` in `web/src/features/visitor/campus-model.ts`:
   `url`, `format` (`gltf` for both GLB and GLTF), `upAxis`, `scale`, and
   `rotationDegrees`. GLTF normally uses Y-up; the current OBJ uses Z-up.
   Use an uncompressed export; Draco/KTX2 decoders are not configured.
3. The camera fits the model bounds automatically, including narrow viewports.
   No camera coordinates need to be retuned when the model changes.

## Place locations and robot markers

`locationAnchors` maps API location IDs to `[x, y, z]` positions in the **original
model's coordinate system**, before conversion, rotation or scaling. Survey the
actual room entrance/walkway rather than guessing from a screenshot. Geometry
and anchors share `campusModelMatrix`, so they stay aligned.

The current visitor mock locations are not surveyed against this model. The
default anchor map is empty; selecting a location still opens its details and
booking links, but does not show a misleading marker on the model.

If the API's percentage plan is calibrated, set `planCalibration`:

- `origin`: model-space position of plan `(0, 0)`.
- `xAxis`: model-space vector from plan `(0, 0)` to `(100, 0)`.
- `yAxis`: model-space vector from plan `(0, 0)` to `(0, 100)`.

Positions are `origin + xAxis * mapX/100 + yAxis * mapY/100`. Explicit location
anchors take priority. The robot always uses calibration, never a static
location anchor. This is for the existing visitor plan DTO; ROS poses will
require their own agreed frame transform at the transport boundary.

The viewer does not calculate navigation paths. Joining tour stops with
straight lines would cross walls; a walkable route must come from the routing
service before route rendering is enabled.

## Manual checks

Open `/visit/map` in a WebGL2-capable browser. Check orbit, top view, zoom, reset,
light/dark themes and a narrow mobile viewport. With a surveyed anchor, verify
list selection, marker selection, Focus and the booking destination link.
Check a missing model URL and disabled WebGL: the location list should remain
usable and model loading should offer recovery. Automated jsdom tests do not
prove WebGL rendering or camera interaction on a real device.
