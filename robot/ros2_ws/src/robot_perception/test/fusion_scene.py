"""Deterministic Astra-like RGB-D scene plus the frozen pre-patch fusion path.

Shared by test_projection_regression.py, and runnable as an offline benchmark
of the legacy path against the current ``PersonPerceptionNode._locate``:

    cd robot/ros2_ws/src/robot_perception/test
    PYTHONPATH=.. python3 fusion_scene.py --iterations 30

The cloud is an organized 640x480 PointCloud2 in the depth optical frame,
ray-cast with OpenNI-like depth intrinsics. RGB is a separate camera with its
own K and plumb_bob D, a non-identity depth->colour extrinsic, and a pitched
base_link<-colour mount, so nothing here assumes depth pixel == RGB pixel.
TF lookups return these fixed extrinsics; real tf2 lookup cost is excluded.
"""
import argparse
from collections import deque
import threading
import time
import types

import numpy as np

import test_math  # noqa: F401  # installs ROS interface stubs when ROS is absent
from robot_perception import person_perception_node as P

WIDTH, HEIGHT = 640, 480
DEPTH_FRAME = 'camera_depth_optical_frame'
COLOR_FRAME = 'camera_color_optical_frame'
BASE_FRAME = 'base_link'
DEPTH_K = (570.3422, 570.3422, 319.5, 239.5)  # OpenNI 640x480 default
COLOR_K = (585.0, 0.0, 322.4, 0.0, 583.0, 236.8, 0.0, 0.0, 1.0)
COLOR_D = (0.12, -0.25, 0.0012, -0.0008, 0.09)
PERSON_RADIUS, PERSON_HEIGHT = 0.22, 1.70


def _rot(axis, degrees):
    c, s = np.cos(np.radians(degrees)), np.sin(np.radians(degrees))
    i, j = [(1, 2), (2, 0), (0, 1)][axis]
    r = np.eye(3)
    r[i, i] = r[j, j] = c
    r[i, j], r[j, i] = -s, s
    return r


# colour <- depth: RGB sensor about 25 mm beside depth, small assembly skew.
R_COLOR_DEPTH = _rot(1, 0.6) @ _rot(0, -0.3) @ _rot(2, 0.2)
T_COLOR_DEPTH = np.array([-0.025, 0.0015, 0.002])
# base_link <- colour optical (z forward, x right, y down), pitched 6 deg down.
R_BASE_COLOR = _rot(1, 6.0) @ np.array([[0., 0., 1.], [-1., 0., 0.], [0., -1., 0.]])
T_BASE_COLOR = np.array([0.18, 0.0, 0.42])


def render(people, *, seed=0, hole_fraction=0.04, wall_x=7.0, max_range=8.0):
    """Organized depth-frame XYZ (H, W, 3 float32, NaN invalid) and person labels."""
    rng = np.random.default_rng(seed)
    fx, fy, cx, cy = DEPTH_K
    u, v = np.meshgrid(np.arange(WIDTH, dtype=np.float64), np.arange(HEIGHT, dtype=np.float64))
    rays = np.stack(((u - cx) / fx, (v - cy) / fy, np.ones_like(u)), axis=-1)
    rot = R_BASE_COLOR @ R_COLOR_DEPTH
    o = R_BASE_COLOR @ T_COLOR_DEPTH + T_BASE_COLOR
    d = rays @ rot.T
    t = np.full(u.shape, np.inf)
    label = np.full(u.shape, -1)

    def closer(candidate, value):
        hit = np.isfinite(candidate) & (candidate > 0) & (candidate < t)
        t[hit] = candidate[hit]
        label[hit] = value

    with np.errstate(divide='ignore', invalid='ignore'):
        closer(np.where(d[..., 2] < 0, -o[2] / d[..., 2], np.inf), -1)            # floor
        closer(np.where(d[..., 2] > 0, (2.6 - o[2]) / d[..., 2], np.inf), -1)     # ceiling
        closer(np.where(d[..., 0] > 0, (wall_x - o[0]) / d[..., 0], np.inf), -1)  # back wall
        for side in (3.0, -3.0):
            closer(np.where(d[..., 1] * side > 0, (side - o[1]) / d[..., 1], np.inf), -1)
        for i, (px, py) in enumerate(people):
            ox, oy = o[0] - px, o[1] - py
            a = d[..., 0] ** 2 + d[..., 1] ** 2
            b = 2 * (d[..., 0] * ox + d[..., 1] * oy)
            c = ox * ox + oy * oy - PERSON_RADIUS ** 2
            disc = b * b - 4 * a * c
            near = (-b - np.sqrt(disc)) / (2 * a)
            height = o[2] + near * d[..., 2]
            closer(np.where((disc >= 0) & (height >= 0) & (height <= PERSON_HEIGHT), near, np.inf), i)

    sigma = 0.0012 * t  # relative noise; absolute sigma ~ 1.2 mm * z^2
    scale = 1 + sigma * rng.standard_normal(t.shape)
    pts = (rays * (t * scale)[..., None]).astype(np.float32)
    pts[(t > max_range) | ~np.isfinite(t)] = np.nan
    pts[rng.random(t.shape) < hole_fraction] = np.nan
    pts[:, :8] = np.nan  # structured-light shadow band at the left edge
    return pts, label


def cloud_message(points, *, organized=True):
    """PointCloud2-like message: float32 x/y/z at 0/4/8, point_step 16."""
    if organized:
        height, width = points.shape[:2]
        xyz = points
    else:
        flat = points.reshape(-1, 3)
        xyz = flat[np.isfinite(flat).all(axis=1)][None]
        height, width = xyz.shape[:2]
    buf = np.zeros((height, width, 4), np.float32)
    buf[..., :3] = xyz
    fields = [types.SimpleNamespace(name=name, offset=4 * i, datatype=7)  # FLOAT32
              for i, name in enumerate('xyz')]
    return types.SimpleNamespace(
        header=types.SimpleNamespace(frame_id=DEPTH_FRAME, stamp=None),
        height=height, width=width, fields=fields,
        point_step=16, row_step=16 * width, is_bigendian=False, is_dense=not organized,
        data=buf.tobytes())


def person_boxes(points, label, count, k, d, *, pad=0.04):
    """Detector-like boxes: projected person extent plus slack, clipped like unletterbox."""
    boxes = []
    for i in range(count):
        sel = points[label == i]
        sel = sel[np.isfinite(sel).all(axis=1) & (sel[:, 2] > 0.05)]
        uv = P.project_points(sel @ R_COLOR_DEPTH.T + T_COLOR_DEPTH, k, d)
        (x1, y1), (x2, y2) = uv.min(axis=0), uv.max(axis=0)
        px, py = (x2 - x1) * pad, (y2 - y1) * pad
        boxes.append([np.clip(x1 - px, 0, WIDTH - 1), np.clip(y1 - py, 0, HEIGHT - 1),
                      np.clip(x2 + px, 0, WIDTH - 1), np.clip(y2 + py, 0, HEIGHT - 1)])
    return np.asarray(boxes, np.float32).reshape(-1, 4)


def make_scene(people, *, k=COLOR_K, d=COLOR_D, model='plumb_bob', organized=True,
               boxes=None, edit=None, **render_args):
    points, label = render(people, **render_args)
    if edit is not None:
        edit(points, label)
    if boxes is None:
        boxes = person_boxes(points, label, len(people), k, d)
    header = types.SimpleNamespace(frame_id=COLOR_FRAME)
    info = types.SimpleNamespace(width=WIDTH, height=HEIGHT, header=header, k=list(k),
                                 d=list(d), distortion_model=model)
    image = types.SimpleNamespace(width=WIDTH, height=HEIGHT, header=header)
    snapshot = P.Snapshot(image, cloud_message(points, organized=organized), info, 10.0, 10.0, 0.0)
    return types.SimpleNamespace(snapshot=snapshot, boxes=np.asarray(boxes, np.float32).reshape(-1, 4),
                                 people=list(people), points=points, label=label)


def legacy_project_points(points, k, distortion):
    """project_points() before the projection patch (commit a30271f), verbatim."""
    import cv2
    points = np.asarray(points, dtype=np.float64).reshape(-1, 1, 3)
    intrinsic = np.asarray(k, dtype=np.float64).reshape(3, 3)
    distortion = np.asarray(distortion, dtype=np.float64)
    uv, _ = cv2.projectPoints(points, np.zeros(3), np.zeros(3), intrinsic, distortion)
    return uv.reshape(-1, 2)


def legacy_locate(self, snap, boxes):
    """PersonPerceptionNode._locate() at commit a30271f; only names are qualified."""
    cloud, info = snap.cloud, snap.info
    if cloud is None or info is None: raise P.PerceptionError('missing cloud/CameraInfo')
    if (info.width, info.height) != (snap.image.width, snap.image.height): raise P.PerceptionError('CameraInfo resolution mismatch')
    if info.header.frame_id != snap.image.header.frame_id: raise P.PerceptionError('CameraInfo/image frame mismatch')
    if len(info.k) != 9 or not np.isfinite(info.k).all() or info.k[0] <= 0 or info.k[4] <= 0:
        raise P.PerceptionError('invalid CameraInfo K')
    if info.distortion_model not in ('plumb_bob', ''):
        raise P.PerceptionError(f'unsupported distortion model {info.distortion_model}')
    d = np.asarray(info.d, dtype=np.float64)
    if not np.isfinite(d).all(): raise P.PerceptionError('invalid CameraInfo D')
    if info.distortion_model == '' and np.any(np.abs(d) > 1e-12): raise P.PerceptionError('unsupported nonzero D without distortion model')
    signature = (info.header.frame_id, info.width, info.height, tuple(info.k), tuple(info.d), info.distortion_model)
    if self._calibration_signature is not None and signature != self._calibration_signature:
        self._calibration_signature = signature
        raise P.PerceptionError('CameraInfo calibration changed; waiting for a new observation')
    self._calibration_signature = signature
    if len(boxes) == 0:
        return []
    with self._profile_phase('cloud_decode'):
        pts = P.cloud_xyz(cloud)
    if not len(pts):
        if len(boxes): raise P.PerceptionError('no valid cloud points')
        return []
    with self._profile_phase('transform'):
        Rc, Tc = self._tf(info.header.frame_id, cloud.header.frame_id)
        Rb, Tb = self._tf(self.base_frame, info.header.frame_id)
        cam = pts @ Rc.T + Tc; valid = cam[:, 2] > 0.05; cam = cam[valid]
    if not len(cam):
        if len(boxes): raise P.PerceptionError('no cloud points in front of camera')
        return []
    with self._profile_phase('projection'):
        k = np.asarray(info.k, dtype=np.float64).reshape(3, 3)
        uv = legacy_project_points(cam, k, d)
        in_img = (uv[:, 0] >= 0) & (uv[:, 0] < info.width) & (uv[:, 1] >= 0) & (uv[:, 1] < info.height)
    with self._profile_phase('roi'):
        out = []
        for box in boxes:
            rng, mask, core = P.range_core(uv[in_img, 0], uv[in_img, 1], cam[in_img, 2], box)
            selected = cam[in_img][mask][core]
            p_color = np.median(selected, axis=0)
            out.append(Rb @ p_color + Tb)
    return out


class FusionHarness:
    """Just enough node state for _locate; TF returns the scene extrinsics."""
    _locate = P.PersonPerceptionNode._locate
    _profile_phase = P.PersonPerceptionNode._profile_phase
    legacy_locate = legacy_locate

    def __init__(self):
        self._wake = threading.Condition(threading.Lock())
        self._fusion_phase_latencies = {phase: deque(maxlen=100000) for phase in P.FUSION_PHASES}
        self._calibration_signature = None
        self.base_frame = BASE_FRAME

    def _tf(self, target, source):
        return {(COLOR_FRAME, DEPTH_FRAME): (R_COLOR_DEPTH, T_COLOR_DEPTH),
                (BASE_FRAME, COLOR_FRAME): (R_BASE_COLOR, T_BASE_COLOR)}[(target, source)]


def benchmark(iterations=30, warmup=3, people=((2.2, 0.45), (3.4, -0.6))):
    """Interleave legacy/current _locate on one scene; return per-phase seconds."""
    scene = make_scene(people)
    impls = {'legacy': FusionHarness.legacy_locate, 'current': FusionHarness._locate}
    nodes = {name: FusionHarness() for name in impls}
    fusion = {name: [] for name in impls}
    outputs = {}
    for i in range(warmup + iterations):
        if i == warmup:
            for node in nodes.values():
                for samples in node._fusion_phase_latencies.values():
                    samples.clear()
        for name in (impls if i % 2 == 0 else reversed(list(impls))):
            started = time.perf_counter()
            outputs[name] = impls[name](nodes[name], scene.snapshot, scene.boxes)
            if i >= warmup:
                fusion[name].append(time.perf_counter() - started)
    phases = {name: {**{p: list(s) for p, s in nodes[name]._fusion_phase_latencies.items()},
                     'fusion': fusion[name]} for name in impls}
    return scene, phases, outputs


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--iterations', type=int, default=30)
    parser.add_argument('--warmup', type=int, default=3)
    args = parser.parse_args()
    scene, phases, outputs = benchmark(args.iterations, args.warmup)
    cloud = scene.snapshot.cloud
    pts = P.cloud_xyz(cloud)
    front = int(((pts @ R_COLOR_DEPTH.T + T_COLOR_DEPTH)[:, 2] > 0.05).sum())
    print(f'scene: {cloud.width}x{cloud.height} organized cloud, {len(scene.boxes)} person boxes, '
          f'{len(pts)} valid points, {front} in front of colour camera')
    print(f'legacy cv2.projectPoints Jacobian per frame: ({2 * front} x 15) float64 = '
          f'{2 * front * 15 * 8 / 1e6:.1f} MB (computed and discarded)')
    print(f'{"phase":<14}{"legacy p50/p95 ms":>22}{"current p50/p95 ms":>22}{"p50 speedup":>13}')
    for phase in (*P.FUSION_PHASES, 'fusion'):
        old = np.percentile(np.asarray(phases['legacy'][phase]) * 1000, [50, 95])
        new = np.percentile(np.asarray(phases['current'][phase]) * 1000, [50, 95])
        print(f'{phase:<14}{old[0]:>12.2f} / {old[1]:<7.2f}{new[0]:>12.2f} / {new[1]:<7.2f}{old[0] / new[0]:>11.1f}x')
    diff = np.abs(np.asarray(outputs['legacy']) - np.asarray(outputs['current'])).max()
    print(f'max |xyz legacy - current| = {diff:.3e} m over {len(outputs["current"])} people')


if __name__ == '__main__':
    main()
