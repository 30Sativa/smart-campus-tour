#!/usr/bin/env python3
"""route_test: chay thu mot tuyen POI tren robot that, co nguoi di theo.

Luong (khong co backend):
  1. Nguoi van hanh dat 2D Pose Estimate tren RViz nhu binh thuong. Script KHONG
     set initial pose.
  2. Script doc file tuyen YAML; toa do chi lay tu robot_maps/poi_*.yaml, khong
     bao gio tu bia. File sai -> thoat, khong gui goal nao.
  3. Gui MOT goal NavigateToPose. SUCCEEDED -> dung dung dwell_s -> POI tiep theo.
  4. ABORTED / REJECTED / timeout / Ctrl+C -> dung chuoi, khong gui diem tiep.
  5. end_mode = return_to_start -> chay them chang ve START.

Dung script phai dung duoc robot: Ctrl+C, timeout va exception khi dang co goal
deu goi cancel roi doi Nav2 tra result. Khong xac nhan duoc -> canh bao DÙNG
E-STOP. Ctrl+C lan 2 thoat ngay (goal co the con chay).

Cong cu test thu cong: khong noi backend, khong ghi PASS hay doi trang thai Tour
tren BE, khong publish /cmd_vel. Log theo robot/docs/logging.md.

  python3 route_test.py route.yaml --dry-run                  # khong can ROS
  python3 route_test.py route.yaml --max-points 1             # 1 POI
  python3 route_test.py route.yaml --max-points 1 --with-end  # 1 POI + ve START
  python3 route_test.py route.yaml                            # ca tuyen
"""
import argparse
import json
import math
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timedelta, timezone

import yaml

DEFAULT_ACTION = '/robot_01/navigate_to_pose'
BASE_FRAME = 'base_footprint'
END_MODES = ('return_to_start', 'none')
STATUS_NAMES = {0: 'UNKNOWN', 1: 'ACCEPTED', 2: 'EXECUTING', 3: 'CANCELING',
                4: 'SUCCEEDED', 5: 'CANCELED', 6: 'ABORTED'}
STATUS_TERMINAL = (4, 5, 6)
ROUTE_KEYS = {'route_id', 'map_yaml', 'frame_id', 'start', 'pois', 'default_dwell_s', 'end_mode',
              'end_timeout_s'}
START_KEYS = {'poi_file'}
POI_KEYS = {'poi_file', 'dwell_s', 'timeout_s'}
QUAT_YAW_TOLERANCE = 0.02  # rad; yaw vs quaternion trong file POI
QUAT_TOLERANCE = 0.01      # do lech norm va x/y cua quaternion 2D
SERVER_TIMEOUT_S = 10.0
ACCEPT_TIMEOUT_S = 10.0
LATE_ACCEPT_WAIT_S = 10.0
CANCEL_ACK_TIMEOUT_S = 5.0
CANCEL_RESULT_TIMEOUT_S = 10.0
START_WARN_M = 1.0
VN_TZ = timezone(timedelta(hours=7))  # logging.md: ten thu muc theo gio Viet Nam
ESTOP_BANNER = '\n'.join(('', '!' * 62,
                          '!!!  KHONG XAC NHAN DUOC HUY GOAL NAV2 — DÙNG E-STOP NGAY  !!!',
                          '!' * 62, ''))


class RouteError(ValueError):
    """Invalid route or POI file."""


# ---------------------------------------------------------------- pure helpers

def normalize_angle(a):
    return math.atan2(math.sin(a), math.cos(a))


def yaw_from_quat(z, w, x=0.0, y=0.0):
    return math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z))


def quat_from_yaw(yaw):
    return math.sin(yaw / 2.0), math.cos(yaw / 2.0)  # (z, w)


def pose_error(target, actual):
    """Return (xy error m, yaw error deg) between two {x, y, yaw} dicts."""
    dxy = math.hypot(actual['x'] - target['x'], actual['y'] - target['y'])
    dyaw = math.degrees(normalize_angle(actual['yaw'] - target['yaw']))
    return dxy, dyaw


def status_name(status):
    return STATUS_NAMES.get(status, f'STATUS_{status}')


def _num(value, what):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RouteError(f'{what}: "{value}" khong phai so')
    if not math.isfinite(value):
        raise RouteError(f'{what}: gia tri khong hop le ({value})')
    return float(value)


def _text(value, what):
    if not isinstance(value, str) or not value.strip():
        raise RouteError(f'{what}: thieu hoac khong phai chuoi')
    return value


def _read_yaml(path, what):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as exc:
        raise RouteError(f'{what}: khong doc duoc {path}: {exc}') from None
    if not isinstance(data, dict):
        raise RouteError(f'{what}: {path} phai la mapping')
    return data


def _no_unknown_keys(mapping, allowed, what):
    # Go nham `dwell: 30` khong duoc am tham thanh gia tri mac dinh.
    extra = sorted(str(k) for k in set(mapping) - allowed)
    if extra:
        raise RouteError(f'{what}: khoa khong ho tro {extra} (cho phep {sorted(allowed)})')


def load_poi(entry, base_dir, map_yaml, frame_id, label, allowed):
    """Doc mot poi_*.yaml; toa do chi den tu file nay."""
    if not isinstance(entry, dict) or 'poi_file' not in entry:
        raise RouteError(f'{label}: phai tro toi file POI qua poi_file '
                         '(file tuyen khong khai bao toa do)')
    _no_unknown_keys(entry, allowed, label)
    path = os.path.normpath(os.path.join(base_dir, _text(entry['poi_file'], f'{label}.poi_file')))
    data = _read_yaml(path, label)
    poi_id = _text(data.get('id'), f'{label}: {path} id')
    if data.get('map_yaml') != map_yaml:
        raise RouteError(f'{label}: {path} thuoc map {data.get("map_yaml")}, '
                         f'tuyen dung map {map_yaml}')
    if data.get('frame_id') != frame_id:
        raise RouteError(f'{label}: {path} frame {data.get("frame_id")}, '
                         f'tuyen dung frame {frame_id}')
    pose = data.get('pose')
    if not isinstance(pose, dict) or not isinstance(pose.get('quaternion'), dict):
        raise RouteError(f'{label}: {path} thieu pose hoac pose.quaternion')
    x = _num(pose.get('x'), f'{label}.x')
    y = _num(pose.get('y'), f'{label}.y')
    yaw = _num(pose.get('yaw'), f'{label}.yaw')
    q = pose['quaternion']
    qx, qy, qz, qw = (_num(q.get(k), f'{label}.quaternion.{k}') for k in 'xyzw')
    if abs(math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) - 1.0) > QUAT_TOLERANCE:
        raise RouteError(f'{label}: {path} quaternion khong chuan hoa')
    if abs(qx) > QUAT_TOLERANCE or abs(qy) > QUAT_TOLERANCE:
        raise RouteError(f'{label}: {path} quaternion khong phai pose 2D')
    qyaw = yaw_from_quat(qz, qw, qx, qy)
    if abs(normalize_angle(qyaw - yaw)) > QUAT_YAW_TOLERANCE:
        raise RouteError(f'{label}: {path} yaw={yaw} lech quaternion (yaw={qyaw:.3f})')
    point = {'id': poi_id, 'x': x, 'y': y, 'yaw': normalize_angle(yaw),
             'source': os.path.basename(path)}
    if 'dwell_s' in entry:
        point['dwell_s'] = _num(entry['dwell_s'], f'{label}.dwell_s')
        if point['dwell_s'] < 0:
            raise RouteError(f'{label}.dwell_s phai >= 0')
    if 'timeout_s' in entry:
        point['timeout_s'] = _num(entry['timeout_s'], f'{label}.timeout_s')
        if point['timeout_s'] <= 0:
            raise RouteError(f'{label}.timeout_s phai > 0')
    return point


def load_route(path):
    """Validate toan bo tuyen. Co loi -> RouteError, chua goal nao duoc gui."""
    data = _read_yaml(path, 'file tuyen')
    _no_unknown_keys(data, ROUTE_KEYS, 'file tuyen')
    route_id = _text(data.get('route_id'), 'route_id')
    map_yaml = _text(data.get('map_yaml'), 'map_yaml')
    frame_id = _text(data.get('frame_id'), 'frame_id')
    end_mode = data.get('end_mode')
    if end_mode not in END_MODES:
        raise RouteError(f'end_mode phai la mot trong {END_MODES}')
    default_dwell = _num(data.get('default_dwell_s', 0.0), 'default_dwell_s')
    if default_dwell < 0:
        raise RouteError('default_dwell_s phai >= 0')
    pois_raw = data.get('pois')
    if not isinstance(pois_raw, list) or not pois_raw:
        raise RouteError('pois phai la danh sach khong rong')

    base_dir = os.path.dirname(os.path.abspath(path))
    start = load_poi(data.get('start'), base_dir, map_yaml, frame_id, 'start', START_KEYS)
    pois = []
    for i, entry in enumerate(pois_raw):
        p = load_poi(entry, base_dir, map_yaml, frame_id, f'pois[{i}]', POI_KEYS)
        p.setdefault('dwell_s', default_dwell)
        pois.append(p)
    ids = [start['id']] + [p['id'] for p in pois]
    if len(set(ids)) != len(ids):
        raise RouteError(f'id POI bi trung: {ids}')

    end = None
    if end_mode == 'return_to_start':
        end = dict(start, id=f'END:{start["id"]}', dwell_s=0.0)
    if 'end_timeout_s' in data:
        if end is None:
            raise RouteError('end_timeout_s chi dung voi end_mode return_to_start')
        end['timeout_s'] = _num(data['end_timeout_s'], 'end_timeout_s')
        if end['timeout_s'] <= 0:
            raise RouteError('end_timeout_s phai > 0')
    return {'route_id': route_id, 'map_yaml': map_yaml, 'frame_id': frame_id,
            'start': start, 'pois': pois, 'end_mode': end_mode, 'end': end,
            'path': os.path.abspath(path)}


def build_plan(route, max_points=None, with_end=False):
    """Danh sach chang + scope du kien. --max-points mac dinh bo chang ket thuc."""
    total = len(route['pois'])
    n = total if max_points is None else min(max_points, total)
    run_end = route['end'] is not None and (max_points is None or with_end)
    legs = [dict(p, kind='poi') for p in route['pois'][:n]]
    if run_end:
        legs.append(dict(route['end'], kind='end'))
    if n == total and (route['end'] is None or run_end):
        scope = 'full_route'
    elif n == 1 and not run_end:
        scope = 'single_point'
    else:
        scope = 'partial'
    for i, leg in enumerate(legs, 1):
        leg['index'] = i
    return {'legs': legs, 'scope': scope, 'pois_in_run': n, 'pois_total': total}


def leg_timeout(leg, default):
    return leg.get('timeout_s', default)


def format_plan(route, plan, default_timeout):
    s = route['start']
    lines = [f"Tuyen {route['route_id']} map={route['map_yaml']} frame={route['frame_id']}",
             (f"Pham vi: {plan['scope']} ({plan['pois_in_run']}/{plan['pois_total']} POI, "
              f"end_mode={route['end_mode']})"),
             (f"  start {s['id']:<14} x={s['x']:8.3f} y={s['y']:8.3f} "
              f"yaw={math.degrees(s['yaw']):7.1f}deg [{s['source']}]")]
    for leg in plan['legs']:
        lines.append(f"  {leg['index']:>2}. {leg['id']:<14} x={leg['x']:8.3f} y={leg['y']:8.3f} "
                     f"yaw={math.degrees(leg['yaw']):7.1f}deg dung={leg['dwell_s']:.0f}s "
                     f"timeout={leg_timeout(leg, default_timeout):.0f}s [{leg['source']}]")
    return '\n'.join(lines)


def summarize(route, plan, legs_out, stop_reason, wall_s):
    """full_route chi khi thuc su chay xong; ke hoach full bi dung giua chung la partial."""
    completed = (stop_reason is None and len(legs_out) == len(plan['legs'])
                 and all(r['outcome'] == 'SUCCEEDED' for r in legs_out))
    scope = plan['scope']
    if scope == 'full_route' and not completed:
        scope = 'partial'
    return {'route_id': route['route_id'], 'map_yaml': route['map_yaml'],
            'end_mode': route['end_mode'], 'scope': scope, 'planned_scope': plan['scope'],
            'completed': completed, 'stop_reason': stop_reason,
            'pois_in_run': plan['pois_in_run'], 'pois_total': plan['pois_total'],
            'legs_planned': len(plan['legs']), 'legs_done': len(legs_out),
            'total_wall_s': round(wall_s, 2),
            'total_nav_s': round(sum(r.get('nav_s', 0.0) for r in legs_out), 2),
            'total_dwell_s': round(sum(r.get('dwell_actual_s', 0.0) for r in legs_out), 2),
            'legs': legs_out}


def exit_code_for(stop_reason):
    if stop_reason is None:
        return 0
    return 130 if stop_reason in ('user_stop', 'user_exit_before_start') else 1


# ---------------------------------------------------------------- run log

def emit(text):
    """In bang os.write: an toan trong signal handler va khong lam hong luong huy
    goal khi terminal da mat (Ctrl+C giet luon `| tee`, SSH rot)."""
    try:
        os.write(sys.stdout.fileno(), (text + '\n').encode('utf-8'))
    except (OSError, ValueError):
        pass


def say(msg):
    emit(f'[{datetime.now().astimezone():%H:%M:%S}] {msg}')


class RunLog:
    def __init__(self, run_dir):
        self.run_dir = run_dir
        # Moi su kien mot lan os.write: ghi duoc ca tu signal handler (Ctrl+C lan 2).
        self._fd = os.open(os.path.join(run_dir, 'events.jsonl'),
                           os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)

    def event(self, name, **data):
        rec = {'t': datetime.now().astimezone().isoformat(timespec='milliseconds'),
               'event': name, **data}
        os.write(self._fd, (json.dumps(rec, ensure_ascii=False) + '\n').encode('utf-8'))
        os.fsync(self._fd)

    def write_summary(self, summary):
        path = os.path.join(self.run_dir, 'summary.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        return path

    def close(self):
        os.close(self._fd)


def make_run_dir(log_dir, route_id):
    """Moi lan chay mot thu muc moi; khong dung lai hay ghi de session cu."""
    root = log_dir or os.environ.get('AMR_RUN_DIR') or os.path.expanduser('~/amr_logs/runs')
    os.makedirs(root, exist_ok=True)
    safe = ''.join(c if c.isalnum() or c in '-_' else '_' for c in route_id)[:40]
    stamp = datetime.now(VN_TZ).strftime('%Y%m%d_%H%M%S')
    return tempfile.mkdtemp(prefix=f'{stamp}_route_{safe}_', dir=root)


def run_metadata():
    try:
        rev = subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True,
                             timeout=2.0, check=True,
                             cwd=os.path.dirname(os.path.abspath(__file__))).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        rev = 'unknown'
    env = ('ROS_DOMAIN_ID', 'RMW_IMPLEMENTATION', 'ROS_DISCOVERY_SERVER')
    return {'host': socket.gethostname(), 'git_rev': rev,
            'ros_env': {k: os.environ.get(k, 'unset') for k in env}}


# ---------------------------------------------------------------- one Nav2 goal

def wait_future(future, timeout=None, stop_event=None):
    """'done' | 'timeout' | 'stopped' — doi bang event, executor spin o thread khac."""
    done = threading.Event()
    future.add_done_callback(lambda _f: done.set())
    deadline = None if timeout is None else time.monotonic() + timeout
    while True:
        if done.wait(0.1) or future.done():
            return 'done'
        if stop_event is not None and stop_event.is_set():
            return 'stopped'
        if deadline is not None and time.monotonic() > deadline:
            return 'timeout'


class Nav2GoalRunner:
    """Thuc thi DUNG MOT goal NavigateToPose: gui, doi, timeout, huy, do sai so.

    Khong biet gi ve tuyen. Chuong trinh nhan lenh tu BE sau nay dung lai lop nay;
    BE quyet dinh chang tiep theo. ROS duoc tiem vao qua client/make_goal/get_pose.
    """

    def __init__(self, client, make_goal, get_pose, log_fn):
        self.client = client
        self.make_goal = make_goal
        self.get_pose = get_pose
        self.log_fn = log_fn
        self.active = None  # (goal handle, result future) khi Nav2 dang giu goal

    def execute(self, target, timeout_s, stop_event):
        fb = {'recoveries': None, 'distance_remaining': None}

        def on_feedback(msg):
            fb['recoveries'] = int(msg.feedback.number_of_recoveries)
            fb['distance_remaining'] = float(msg.feedback.distance_remaining)

        rec = {'outcome': None, 'nav_status': None, 'cancel_confirmed': None}
        t0 = time.monotonic()
        try:
            self._drive(target, timeout_s, stop_event, rec, on_feedback)
        except Exception as exc:  # noqa: BLE001 - dung script phai dung duoc robot
            rec['outcome'] = 'ERROR'
            rec['error'] = f'{type(exc).__name__}: {exc}'
            self.log_fn(f'Loi bat ngo: {rec["error"]}')
            if self.active is not None:
                self.cancel_active(rec)
        rec['nav_s'] = round(time.monotonic() - t0, 2)
        rec['number_of_recoveries'] = fb['recoveries']
        rec['distance_remaining_m'] = fb['distance_remaining']
        actual = self.get_pose()
        rec['final_pose'] = actual
        if actual is not None:
            dxy, dyaw = pose_error(target, actual)
            rec['error_xy_m'] = round(dxy, 3)
            rec['error_yaw_deg'] = round(dyaw, 1)
        return rec

    def _drive(self, target, timeout_s, stop_event, rec, on_feedback):
        send = self.client.send_goal_async(self.make_goal(target), feedback_callback=on_feedback)
        # Khong truyen stop_event: Ctrl+C luc nay van phai doi handle thi moi huy duoc.
        if wait_future(send, ACCEPT_TIMEOUT_S) != 'done':
            rec['outcome'] = 'ACCEPT_TIMEOUT'
            self._cancel_late_accept(send, rec)
            return
        handle = send.result()
        if handle is None or not handle.accepted:
            rec['outcome'] = 'REJECTED'
            return
        result_future = handle.get_result_async()
        self.active = (handle, result_future)
        waited = wait_future(result_future, timeout_s, stop_event)
        if waited == 'done':
            rec['nav_status'] = result_future.result().status
            rec['outcome'] = status_name(rec['nav_status'])
            self.active = None
            return
        rec['outcome'] = 'USER_STOP' if waited == 'stopped' else 'TIMEOUT'
        self.cancel_active(rec)

    def _cancel_late_accept(self, send, rec):
        """Goal chua accept khi het han: o lai cho no, accept muon thi huy ngay."""
        self.log_fn(f'Nav2 chua accept sau {ACCEPT_TIMEOUT_S:.0f}s, doi them '
                    f'{LATE_ACCEPT_WAIT_S:.0f}s de huy neu goal duoc accept muon.')
        if wait_future(send, LATE_ACCEPT_WAIT_S) != 'done':
            rec['cancel_confirmed'] = False
            self.log_fn(ESTOP_BANNER)
            return
        handle = send.result()
        if handle is not None and handle.accepted:
            self.active = (handle, handle.get_result_async())
            self.cancel_active(rec)

    def cancel_active(self, rec):
        """Huy goal dang chay va doi result. Co result (da ket thuc) moi la xac nhan."""
        handle, result_future = self.active
        self.log_fn('Dang huy goal Nav2 ...')
        status = None
        try:
            wait_future(handle.cancel_goal_async(), CANCEL_ACK_TIMEOUT_S)
            # Khong co ack van doi result: yeu cau huy co the da toi Nav2.
            if wait_future(result_future, CANCEL_RESULT_TIMEOUT_S) == 'done':
                status = result_future.result().status
        except Exception as exc:  # noqa: BLE001 - van phai in canh bao E-stop
            self.log_fn(f'Loi khi huy goal: {type(exc).__name__}: {exc}')
        rec['nav_status'] = status
        rec['cancel_confirmed'] = status in STATUS_TERMINAL
        if rec['cancel_confirmed']:
            self.active = None
            self.log_fn(f'Nav2 da ket thuc goal (status={status_name(status)}).')
        else:
            self.log_fn(ESTOP_BANNER)


# ---------------------------------------------------------------- route loop

def run_legs(plan, execute, log, stop_event, log_fn, default_timeout, legs_out):
    """Moi luc chi MOT goal; chang loi thi dung chuoi. Tra stop_reason (None = xong)."""
    for leg in plan['legs']:
        if stop_event.is_set():
            return 'user_stop'
        timeout_s = leg_timeout(leg, default_timeout)
        log_fn(f'[{leg["index"]}/{len(plan["legs"])}] -> {leg["id"]} '
               f'({leg["x"]:.2f}, {leg["y"]:.2f}) timeout {timeout_s:.0f}s')
        log.event('leg_start', index=leg['index'], id=leg['id'], kind=leg['kind'],
                  timeout_s=timeout_s)
        rec = execute(leg, timeout_s, stop_event)
        rec.update(index=leg['index'], id=leg['id'], kind=leg['kind'], dwell_actual_s=0.0,
                   target={'x': leg['x'], 'y': leg['y'], 'yaw': leg['yaw']})
        legs_out.append(rec)
        log.event('leg_end', **rec)
        err = (f" sai so {rec['error_xy_m']:.2f} m / {rec['error_yaw_deg']:.0f} deg"
               if 'error_xy_m' in rec else '')
        log_fn(f'    {rec["outcome"]} sau {rec["nav_s"]:.1f}s, '
               f'recoveries={rec["number_of_recoveries"]}{err}')
        if rec['outcome'] != 'SUCCEEDED':
            if stop_event.is_set():
                return 'user_stop'
            return f'leg_failed:{leg["id"]}:{rec["outcome"]}'
        if leg['dwell_s'] > 0:
            log_fn(f'    dung {leg["dwell_s"]:.0f}s tai {leg["id"]}')
            d0 = time.monotonic()
            interrupted = stop_event.wait(leg['dwell_s'])
            rec['dwell_actual_s'] = round(time.monotonic() - d0, 2)
            log.event('dwell_end', index=leg['index'], id=leg['id'], dwell_s=leg['dwell_s'],
                      dwell_actual_s=rec['dwell_actual_s'], interrupted=interrupted)
            if interrupted:
                return 'user_stop'
    return None


def start_offset(route, pose):
    """Khoang cach robot toi START; chi de canh bao, khong chan chay."""
    if pose is None:
        return {'pose': None}
    dxy, dyaw = pose_error(route['start'], pose)
    return {'pose': pose, 'dist_to_start_m': round(dxy, 3), 'yaw_to_start_deg': round(dyaw, 1)}


def run_route(route, plan, args):
    try:
        import rclpy
        from nav2_msgs.action import NavigateToPose
        from rclpy.action import ActionClient
        from rclpy.duration import Duration
        from rclpy.executors import SingleThreadedExecutor
        from rclpy.signals import SignalHandlerOptions
        from rclpy.time import Time
        from tf2_ros import Buffer, TransformListener
    except ImportError as exc:
        print(f'Khong import duoc ROS 2 ({exc}). Da source moi truong robot chua?',
              file=sys.stderr)
        return 1

    run_dir = make_run_dir(args.log_dir, route['route_id'])
    shutil.copy(route['path'], os.path.join(run_dir, 'route_snapshot.yaml'))
    log = RunLog(run_dir)

    # Tu xu ly SIGINT: rclpy khong duoc tat context truoc khi gui xong cancel.
    rclpy.init(signal_handler_options=SignalHandlerOptions.NO)
    node = rclpy.create_node('route_test')
    client = ActionClient(node, NavigateToPose, args.action)
    tf_buffer = Buffer()
    tf_listener = TransformListener(tf_buffer, node)  # noqa: F841 - giu tham chieu
    executor = SingleThreadedExecutor()
    executor.add_node(node)
    spinning = threading.Event()
    spinning.set()

    def spin():
        while spinning.is_set() and rclpy.ok():
            executor.spin_once(timeout_sec=0.1)

    spin_thread = threading.Thread(target=spin, daemon=True)
    spin_thread.start()

    def get_pose(timeout=0.5):
        try:
            t = tf_buffer.lookup_transform(route['frame_id'], BASE_FRAME, Time(),
                                           timeout=Duration(seconds=timeout))
        except Exception:  # noqa: BLE001 - tf2 raises several types
            return None
        r = t.transform.rotation
        return {'x': t.transform.translation.x, 'y': t.transform.translation.y,
                'yaw': yaw_from_quat(r.z, r.w, r.x, r.y)}

    def make_goal(target):
        goal = NavigateToPose.Goal()
        goal.pose.header.frame_id = route['frame_id']
        goal.pose.header.stamp = node.get_clock().now().to_msg()
        goal.pose.pose.position.x = target['x']
        goal.pose.pose.position.y = target['y']
        goal.pose.pose.orientation.z, goal.pose.pose.orientation.w = quat_from_yaw(target['yaw'])
        return goal

    runner = Nav2GoalRunner(client, make_goal, get_pose, say)
    stop_event = threading.Event()
    legs_out = []
    t_start = time.monotonic()
    finished = threading.Event()

    def finish(stop_reason):
        if finished.is_set():
            return
        finished.set()
        summary = summarize(route, plan, legs_out, stop_reason, time.monotonic() - t_start)
        summary['goal_may_still_run'] = (runner.active is not None or any(
            r['cancel_confirmed'] is False for r in legs_out))
        log.event('run_end', **{k: v for k, v in summary.items() if k != 'legs'})
        path = log.write_summary(summary)
        emit(f"\n== {'HOAN THANH' if summary['completed'] else 'DUNG'} ({summary['scope']}) "
             f"tong {summary['total_wall_s']:.1f}s = chay {summary['total_nav_s']:.1f}s + dung "
             f"{summary['total_dwell_s']:.1f}s | ly do: {stop_reason or '-'}\nLog: {path}")

    def on_signal(_sig, _frame):
        if not stop_event.is_set():
            stop_event.set()
            emit('\nCtrl+C: dang dung chuoi va huy goal Nav2 (Ctrl+C lan nua de thoat ngay)')
            return
        emit('\nCtrl+C lan 2: thoat ngay. Goal Nav2 CO THE VAN CHAY — DÙNG E-STOP neu robot con di.')
        try:
            finish('forced_exit')
        finally:
            os._exit(130)

    stop_reason = 'unexpected_exit'
    try:
        say(f'Doi Nav2 action {args.action} ...')
        server_ok = client.wait_for_server(timeout_sec=SERVER_TIMEOUT_S)
        offset = start_offset(route, get_pose(2.0) if server_ok else None)
        log.event('run_start', route_id=route['route_id'], map_yaml=route['map_yaml'],
                  frame_id=route['frame_id'], planned_scope=plan['scope'], action=args.action,
                  nav2_available=server_ok, **run_metadata(), **offset,
                  legs=[dict({k: leg[k] for k in ('index', 'id', 'kind', 'x', 'y', 'yaw',
                                                  'dwell_s')},
                             timeout_s=leg_timeout(leg, args.leg_timeout))
                        for leg in plan['legs']])
        if not server_ok:
            say('Khong thay Nav2 action server. Kiem tra ten action (ros2 action list).')
            stop_reason = 'nav2_unavailable'
        else:
            if offset['pose'] is None:
                say(f'Canh bao: chua doc duoc TF {route["frame_id"]} -> {BASE_FRAME}.')
            else:
                say(f'Robot cach START {offset["dist_to_start_m"]:.2f} m, '
                    f'lech huong {offset["yaw_to_start_deg"]:.0f} deg.')
                if offset['dist_to_start_m'] > START_WARN_M:
                    say(f'Canh bao: xa START hon {START_WARN_M:.0f} m — kiem tra 2D Pose Estimate.')
            if not args.no_confirm:
                input(f'Map dang chay tren robot phai la {route["map_yaml"]}. Da dat 2D Pose '
                      'Estimate va co nguoi di theo? Enter de chay, Ctrl+C de thoat: ')
            for name in ('SIGINT', 'SIGTERM', 'SIGHUP'):  # SIGHUP: SSH rot giua chung
                if hasattr(signal, name):
                    signal.signal(getattr(signal, name), on_signal)
            t_start = time.monotonic()
            stop_reason = run_legs(plan, runner.execute, log, stop_event, say,
                                   args.leg_timeout, legs_out)
    except KeyboardInterrupt:  # truoc khi cai on_signal: chua co goal nao
        emit('\nThoat truoc khi gui goal.')
        stop_reason = 'user_exit_before_start'
    except Exception as exc:
        stop_reason = f'error:{type(exc).__name__}: {exc}'
        raise
    finally:
        if runner.active is not None:
            rec = {}
            runner.cancel_active(rec)
            log.event('emergency_cancel', **rec)
        finish(stop_reason)
        log.close()
        spinning.clear()
        spin_thread.join(timeout=2.0)
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()
    return exit_code_for(stop_reason)


def parse_args(argv):
    p = argparse.ArgumentParser(description='Chay thu tuyen POI qua Nav2 (co nguoi di theo).')
    p.add_argument('route', help='file tuyen .yaml')
    p.add_argument('--action', default=DEFAULT_ACTION, help=f'mac dinh {DEFAULT_ACTION}')
    p.add_argument('--leg-timeout', type=float, default=300.0,
                   help='timeout moi chang (s) neu POI khong khai bao timeout_s')
    p.add_argument('--max-points', type=int,
                   help='chi chay N POI dau, mac dinh bo chang ket thuc')
    p.add_argument('--with-end', action='store_true',
                   help='van chay chang ket thuc khi dung --max-points')
    p.add_argument('--dry-run', action='store_true', help='chi in ke hoach, khong can ROS')
    p.add_argument('--no-confirm', action='store_true', help='bo buoc nhan Enter')
    p.add_argument('--log-dir', help='noi tao thu muc log, mac dinh $AMR_RUN_DIR '
                                     'hoac ~/amr_logs/runs')
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    if not math.isfinite(args.leg_timeout) or args.leg_timeout <= 0:
        print('--leg-timeout phai > 0', file=sys.stderr)
        return 2
    if args.max_points is not None and args.max_points < 1:
        print('--max-points phai >= 1', file=sys.stderr)
        return 2
    try:
        route = load_route(args.route)
    except RouteError as exc:
        print(f'Loi file tuyen: {exc}', file=sys.stderr)
        return 2
    plan = build_plan(route, args.max_points, args.with_end)
    print(format_plan(route, plan, args.leg_timeout), flush=True)
    if args.dry_run:
        return 0
    return run_route(route, plan, args)


if __name__ == '__main__':
    sys.exit(main())
