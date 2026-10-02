# Phase 4 — person perception and optional slowdown

## Scope and limits

`robot_perception` detects people from Astra RGB, projects synchronized depth
cloud points into the raw RGB image, and publishes estimated positions. The
LiDAR/depth costmap remains responsible for obstacle handling. RPP tracks its
path and checks collision against the local costmap; this package does not
promise automatic detours around people. It is not a protective stop or a
whole-robot fail-safe.

No second YOLO pipeline, person costmap layer, tracking, social navigation,
Collision Monitor, firmware change, mode-manager change, or Nav2 speed increase
belongs to this MVP. YOLO26n CPU 320 batch 1 is the first candidate. YOLO11n is
a fallback only if YOLO26n cannot export/load or fails measured P3. INT8 and
iGPU are not assumed. The robot image pins OpenVINO `2024.6.0`, numpy `1.26.4`,
and openvino-telemetry `2024.1.0`; export tools such as torch/ultralytics stay
off the robot. Compose mounts model artifacts read-only at `/opt/models`.
Astra remains native on the MiniPC host. No runtime benchmark or camera
calibration is verified by this document.

## Data contract

RGB and PointCloud2 are sampled before rclpy takes/converts them, using
DDS `KEEP_LAST(1)` and one callback-group permit per subscription on each
`rate_hz` health tick. They are paired with `ApproximateTimeSynchronizer`
(queue 1, slop 0.05 s, header stamps required); neither source timestamp may
be reused or move backwards in an accepted pair. CameraInfo is cached
independently and validated against image frame/resolution and raw-image K/D. Only tested
`plumb_bob` (or zero-distortion pinhole) is accepted. The rigid sensor/robot
extrinsics use the latest available TF; source sensor timestamps remain on
the observations and outputs. One worker performs inference and cloud fusion
at no more than configured `rate_hz`, with one active and one replaceable
latest pending snapshot. A one-slot result mailbox retains the newest
completed result; replacing pending input or an unconsumed result increments
`dropped`. Health and policy timers run on the ROS executor, while cloud
decoding, TF lookup, and projection stay on the worker.

The bbox ROI is shrunk by 0.5. Range uses p25, a ±0.4 m band, then median XYZ
of core cloud points. At least 20 ROI points and 10 core points are required.
Missing/invalid depth or any person bbox without reliable fusion makes the
whole observation UNKNOWN. A valid empty observation may publish an empty
PoseArray; consumers must not interpret that as proof the area is clear.

Relative outputs are `people` (`PoseArray`), `people_markers`,
`person_perception/diagnostics`, and `person_perception/debug_image` in
bbox-only mode. PoseArray uses the cloud timestamp and `base_frame`; debug
image uses the RGB timestamp. PoseArray has no tracking ID. Diagnostics report
state/reason, both source stamps, sync delta, age, inference latency,
end-to-end latency through RGB-D fusion, and counters.
Additional cumulative counters `rgb_received` / `cloud_received` measure
Python callback deliveries, and `pairs_accepted` counts pairs queued after
timestamp validation. `dropped` retains its pending/result replacement
meaning; DDS overwrites and unmatched sync samples are not counted.
Sampling reduces Python takes/conversion/sync work, while camera publication
and native DDS receive/UDP traffic remain unchanged.

## Slowdown policy (disabled by default)

`publish_speed_limit` defaults false in both node and YAML. Bbox-only mode
cannot enable it. Once explicitly enabled after P0–P4 review, the policy uses
`base_link` x-forward/y-left coordinates and these initial values:

| Setting | Value |
|---|---:|
| Slow percent | 50% |
| Enter slow | x < 2.0 m and x > 0, |y| < 0.8 m |
| Hold slow | Until no person in the corridor at x ≤ 2.5 m |
| Clear | Valid fresh observations continuously for 1.0 s |
| Maximum gap in clear sequence | 0.4 s |
| Stale threshold | 1.0 s |
| Policy heartbeat | 5 Hz |

Startup, UNKNOWN, sensor/model/TF error, or stale data selects 50%. CLEAR uses
100%. Zero is never sent: Nav2 Humble defines zero as NO_SPEED_LIMIT. This
SpeedLimit constrains RPP forward motion and does not cap every rotation or
recovery behavior. It does not provide TTL protection if the node or executor
dies; a stuck last limit or controller restart must be handled with the
operator's stop procedure.

## P0–P4 hardware gates

Complete and save evidence before enabling motion effects:

1. **P0:** record ROS/driver/OpenVINO/CPU versions, topics, QoS, frame IDs,
   timestamp health, and bag RGB/cloud/CameraInfo/TF plus Nav2 logs. Run at
   least 10 minutes and record actual rates and drops.
2. **P1:** measure `base_link -> camera_link`, verify one TF owner, floor and
   left/right axes, RGB/depth overlay, calibration, and whether the camera is
   fixed or mounted on a rotating head.
3. **P2:** with YOLO and SpeedLimit off, validate depth geometry/costmap for
   appearing/disappearing objects, near blind zone, FOV edges, floor filtering,
   and stale marks. Keep the configured local depth layer baseline unchanged
   for the first comparison.
4. **P3:** run RGB inference with depth, Nav2, and DDS active. Verify detector
   output against the exported artifact, no growing backlog, fresh unique
   observations, and measured p50/p95/end-to-end latency and drops. Synthetic
   tensor timing is only a microbenchmark.
5. **P4:** replay recorded scenes and measure position error, wall/background
   false fusion, latency and failure behavior. Any unsupported or ambiguous
   fusion remains UNKNOWN.

Mount values, calibration file, model path/hash, bags, and P0–P4 results are
currently **NOT VERIFIED**. Do not invent or infer a hardware PASS from unit
tests.

## Commands and rollback

Observation mode (default):

```bash
ros2 launch robot_perception person_perception.launch.py \
  robot_id:=robot_01 model_xml:=/opt/models/<verified-model>/<model>.xml
```

Bbox-only debug mode:

```bash
ros2 launch robot_perception person_perception.launch.py \
  robot_id:=robot_01 model_xml:=/opt/models/<verified-model>/<model>.xml bbox_only:=true
```

P5 is a supervised hardware test only after all earlier gates and operator
approval. Its command explicitly opts in:

```bash
ros2 launch robot_perception person_perception.launch.py \
  robot_id:=robot_01 model_xml:=/opt/models/<verified-model>/<model>.xml \
  publish_speed_limit:=true
```

Expected observation mode: diagnostics move to VALID only on fresh fused
observations; people/debug outputs retain source timestamps; SpeedLimit has no
publisher unless explicitly enabled. Before P5, confirm there is only one
SpeedLimit publisher. For rollback, stop the robot with the operator stop
procedure, relaunch with `publish_speed_limit:=false`, and verify the Nav2
controller's speed-limit state before moving. Do not kill the node while the
robot is moving and assume the last limit was cleared.
