# Person perception (WP3)

This package detects people from Astra RGB and estimates position by projecting
the synchronized depth cloud into the raw RGB image. It publishes `people`
(`PoseArray`), `people_markers`, diagnostics, and an RGB debug image in bbox
only mode. It does not publish velocity commands or provide a protective stop.

## Runtime behavior

- Normal RGB-D subscriptions use DDS `KEEP_LAST(1)` and a sampled callback
  group. The existing health timer grants one take per input subscription at
  configured `rate_hz`; missed ticks do not accumulate permits. Humble's
  executor checks the group before `rcl_take` and conversion to Python, so
  this reduces PointCloud2 takes/deserialization rather than dropping clouds
  after callbacks receive them. RGB and cloud still use
  `ApproximateTimeSynchronizer`, with queue 1 and the same 50 ms slop.
  Accepted pairs require strictly increasing RGB and cloud timestamps.
  CameraInfo is cached and checked for frame, resolution,
  intrinsics, and supported `plumb_bob` distortion.
- A single daemon worker handles inference and RGB-D fusion. It keeps one
  active snapshot and at most one newest pending snapshot; a one-slot result
  mailbox keeps the newest result until the executor consumes it. The worker
  starts no faster than configured `rate_hz`. Cloud decoding, TF lookup, and
  projection stay off the ROS executor.
- `dropped` counts both pending snapshots replaced by newer input and completed
  results replaced before the executor consumes them. The worker never waits
  for an unconsumed result, and it does not build a frame backlog. Replaced
  model/fusion failures still increment `errors`.
  Samples overwritten in DDS or unmatched by the synchronizer are not included
  in `dropped`; it is not a total camera-frame-loss counter.
- Outputs retain the source sensor stamp. Unsupported model output, missing
  depth, invalid calibration, stale data, or TF failure is `UNKNOWN`; it never
  publishes an empty `people` array as a clear observation.
- The optional policy defaults OFF. When explicitly enabled, startup/UNKNOWN/
  stale produce 50%, a clear sequence of fresh observations can reach 100%,
  and the node never publishes zero (Nav2 defines zero as no speed limit).
- `bbox_only:=true` retains its ungated RGB subscription, needs RGB and a
  model, publishes an overlay image, and cannot be combined with SpeedLimit.

Sampling does not reduce the camera's publish rate, UDP traffic, or all native
DDS receive/reassembly costs. A busy executor can sample below `rate_hz`;
the reader retains the latest sample instead of draining an old queue.
If hardware still shows transport pressure with about five cloud callbacks
per second, the next benchmark is a dedicated perception cloud stream sampled
on the native host, keeping the original cloud stream for Nav2.

## Launch

Run in the robot ROS 2 Humble container after RGB is enabled by the existing
camera/navigation setup:

```bash
ros2 launch robot_perception person_perception.launch.py \
  robot_id:=robot_01 model_xml:=/opt/models/yolo26n_openvino_model/yolo26n.xml
```

This is observation mode because `publish_speed_limit` defaults to false.
BBox-only mode:

```bash
ros2 launch robot_perception person_perception.launch.py \
  robot_id:=robot_01 model_xml:=/opt/models/yolo26n_openvino_model/yolo26n.xml bbox_only:=true
```

The SpeedLimit policy can be enabled only after P0–P4 hardware evidence and
operator review:

```bash
ros2 launch robot_perception person_perception.launch.py \
  robot_id:=robot_01 model_xml:=/opt/models/yolo26n_openvino_model/yolo26n.xml \
  publish_speed_limit:=true
```

The model file above is an example path, not an artifact known to exist on the
robot. Export YOLO26n on a development machine, then copy its `.xml`, `.bin`,
and manifest into `robot/models/yolo26n_openvino_model/`. Compose mounts
`PERSON_MODEL_DIR` (default `./models`, relative to `robot/`) read-only at
`/opt/models`. The Docker image pins OpenVINO Runtime 2024.6.0; do not pip
install runtime packages into a running container. Record artifact SHA-256 and
the exporter version in the manifest.
YOLO11n is a conditional fallback only if YOLO26n cannot export/load or fails
the measured P3 target. INT8 and iGPU are not assumed.

The detector script is a synthetic tensor microbenchmark only; it reports
inference p50/p95 and an optional model/runtime manifest, while camera pipeline
latency, unique RGB frame rate, and drops remain unmeasured there:

```bash
python3 robot/ros2_ws/src/robot_perception/scripts/bench_detector.py \
  /opt/models/<verified-model>/<model>.xml --manifest-out /tmp/person-model-manifest.json
```

Use `person_perception/diagnostics` during P3 for live end-to-end latency,
unique frame rate, and dropped-frame counters.

## Topics

All names are relative, so `robot_id:=robot_01` gives `/robot_01/people`,
`/robot_01/people_markers`, `/robot_01/speed_limit`,
`/robot_01/person_perception/diagnostics`, and
`/robot_01/person_perception/debug_image`. `PoseArray` has no tracking IDs;
an empty array is valid only for a successfully processed observation and is
not a safety guarantee. UNKNOWN does not publish a people array.

Diagnostics include state/reason, image and cloud source stamps, sync delta,
observation age, inference p50/p95, source-stamp-to-consumed-observation E2E
p50/p95 (including RGB-D fusion), unique frame rate, drops, duplicates,
errors, and policy.
The cumulative `rgb_received` and `cloud_received` counters count messages
delivered to Python callbacks, not all samples published by the camera.
`pairs_accepted` counts synchronized pairs queued after timestamp/delta/order
validation, not successfully fused observations. At 30 Hz camera input and
`rate_hz=5`, RGB-D callback counts should grow by about five per second;
bbox-only RGB callbacks remain at the source rate and cloud/pair counts stay
zero. Duplicate or out-of-order cloud stamps now increment `duplicates` and
make the observation UNKNOWN, just as repeated RGB stamps already did.
Heartbeat does not refresh observation freshness. A timer inside this node
cannot handle total process or executor failure.

See [`robot/docs/phase4-ai.md`](../../../../docs/phase4-ai.md) for P0–P5
hardware procedure and rollback. Camera mount, calibration, model artifact,
and P0–P4 evidence are not verified by offline tests.
