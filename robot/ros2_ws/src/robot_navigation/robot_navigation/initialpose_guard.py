"""The only write path from remote debug tools into the robot: initial pose.

foxglove_bridge runs read-only (debug_bridge.yaml): its client_topic_whitelist
is not enforced in 3.6.0, so a bridge client could publish any topic (tested,
robot/docs/dds-isolation.md). Instead this node listens on 127.0.0.1:<port>,
reached through the same SSH tunnel, and accepts one thing: an initial pose as
one JSON line. It forwards it to initialpose only when it is safe:

- the robot is stationary (a fresh odom sample below the speed limits):
  re-seeding AMCL while driving makes map->odom jump under the controller.
  Odom is sampled only when a request arrives: a permanent 25 Hz rclpy
  subscription cost ~7 % of a J5005 core (measured) for a tool that is idle
  almost always;
- frame_id is AMCL's global frame, values are finite, the quaternion is not
  degenerate;
- at most one request per min_interval (double clicks).

The stamp is replaced with the robot clock (the laptop clock is not the robot
clock; AMCL integrates odometry between the stamp and now). Every verdict is
sent back on the connection and published on debug/initialpose_status:
READY, FORWARDED, ACCEPTED, DIFFERENT, NO_ANSWER, REJECTED, ERROR.

Wire format, one UTF-8 JSON object per line (max 8 KiB):
  request  {"op": "initialpose", "frame_id": "map", "x": 1.0, "y": 2.0, "z": 0.0,
            "qx": 0, "qy": 0, "qz": 0, "qw": 1, "covariance": [36 numbers]}
  reply    {"status": "FORWARDED", "text": "..."}

Only launched by debug_bridge.launch.py; navigation.launch.py does not use it.
"""
import json
import math
import socketserver
import threading

import rclpy
from geometry_msgs.msg import PoseWithCovarianceStamped
from nav_msgs.msg import Odometry
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from std_msgs.msg import String

MAX_LINE = 8192
REQUEST_KEYS = {'op', 'frame_id', 'x', 'y', 'z', 'qx', 'qy', 'qz', 'qw', 'covariance'}


def yaw_of(q):
    return math.atan2(2.0 * (q.w * q.z + q.x * q.y), 1.0 - 2.0 * (q.y * q.y + q.z * q.z))


def angle_diff(a, b):
    return math.atan2(math.sin(a - b), math.cos(a - b))


def parse_request(line):
    """JSON line -> PoseWithCovarianceStamped (stamp unset). Raises ValueError."""
    try:
        req = json.loads(line)
    except (ValueError, UnicodeDecodeError) as e:
        raise ValueError(f'not JSON: {e}') from None
    if not isinstance(req, dict) or req.get('op') != 'initialpose':
        raise ValueError('expected {"op": "initialpose", ...}')
    unknown = set(req) - REQUEST_KEYS
    if unknown:
        raise ValueError(f'unknown fields {sorted(unknown)}')
    missing = REQUEST_KEYS - set(req)
    if missing:
        raise ValueError(f'missing fields {sorted(missing)}')
    if not isinstance(req['frame_id'], str):
        raise ValueError('frame_id must be a string')
    numbers = [req[k] for k in ('x', 'y', 'z', 'qx', 'qy', 'qz', 'qw')]
    cov = req['covariance']
    if not isinstance(cov, list) or len(cov) != 36:
        raise ValueError('covariance must be a list of 36 numbers')
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in numbers + cov):
        raise ValueError('pose and covariance must be numbers')
    msg = PoseWithCovarianceStamped()
    msg.header.frame_id = req['frame_id']
    p, q = msg.pose.pose.position, msg.pose.pose.orientation
    p.x, p.y, p.z = float(req['x']), float(req['y']), float(req['z'])
    q.x, q.y, q.z, q.w = (float(req[k]) for k in ('qx', 'qy', 'qz', 'qw'))
    msg.pose.covariance = [float(v) for v in cov]
    return msg


def check_request(msg, global_frame, odom, now_s, last_forward_s, limits):
    """Return (ok, reason). odom: (stamp_s, |v_lin|, |v_ang|) or None.
    limits: dict max_linear, max_angular, odom_timeout, min_interval."""
    if msg.header.frame_id.lstrip('/') != global_frame:
        return False, (f'frame_id "{msg.header.frame_id}" is not "{global_frame}": '
                       'set RViz Fixed Frame to map')
    p, q = msg.pose.pose.position, msg.pose.pose.orientation
    values = [p.x, p.y, p.z, q.x, q.y, q.z, q.w] + list(msg.pose.covariance)
    if not all(math.isfinite(v) for v in values):
        return False, 'pose contains NaN/inf'
    if math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) < 0.5:
        return False, 'orientation quaternion is degenerate'
    if last_forward_s is not None and now_s - last_forward_s < limits['min_interval']:
        return False, (f'ignored: previous initial pose less than '
                       f'{limits["min_interval"]:.1f} s ago')
    if odom is None:
        return False, 'no odom received: cannot confirm the robot is stationary'
    stamp_s, v_lin, v_ang = odom
    if now_s - stamp_s > limits['odom_timeout']:
        return False, (f'odom is {now_s - stamp_s:.1f} s old: '
                       'cannot confirm the robot is stationary')
    if v_lin > limits['max_linear'] or v_ang > limits['max_angular']:
        return False, (f'robot is moving ({v_lin:.2f} m/s, {v_ang:.2f} rad/s): '
                       'stop it before setting the initial pose')
    return True, 'ok'


def normalized(msg, stamp):
    """Copy with robot-clock stamp and unit quaternion."""
    out = PoseWithCovarianceStamped()
    out.header.frame_id = msg.header.frame_id.lstrip('/')
    out.header.stamp = stamp
    out.pose = msg.pose
    q = out.pose.pose.orientation
    n = math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w)
    q.x, q.y, q.z, q.w = q.x / n, q.y / n, q.z / n, q.w / n
    return out


def describe_result(requested, amcl, tol_xy, tol_yaw):
    """requested, amcl: (x, y, yaw). Return (status, text)."""
    dxy = math.hypot(amcl[0] - requested[0], amcl[1] - requested[1])
    dyaw = abs(angle_diff(amcl[2], requested[2]))
    where = f'x {amcl[0]:.2f} y {amcl[1]:.2f} yaw {math.degrees(amcl[2]):.0f} deg'
    if dxy <= tol_xy and dyaw <= tol_yaw:
        return 'ACCEPTED', f'AMCL now at {where}'
    return 'DIFFERENT', (f'AMCL pose differs from the request by {dxy:.2f} m / '
                         f'{math.degrees(dyaw):.0f} deg ({where})')


class PoseServer:
    """Line-JSON TCP server on 127.0.0.1. on_line(line, reply) is called on
    the connection's thread; reply(status, text) is thread-safe and never
    raises (a vanished client just loses the message)."""

    def __init__(self, port, on_line, on_connect=None):
        outer = self

        class Handler(socketserver.StreamRequestHandler):
            def setup(self):
                super().setup()
                self.lock = threading.Lock()

            def reply(self, status, text):
                data = (json.dumps({'status': status, 'text': text}) + '\n').encode()
                with self.lock:
                    try:
                        self.wfile.write(data)
                        self.wfile.flush()
                    except OSError:
                        pass

            def handle(self):
                if on_connect:
                    on_connect(self.reply)
                while True:
                    line = self.rfile.readline(MAX_LINE + 1)
                    if not line:
                        return
                    if len(line) > MAX_LINE:
                        self.reply('ERROR', f'line longer than {MAX_LINE} bytes; closing')
                        return
                    if line.strip():
                        outer.on_line(line, self.reply)

        class Server(socketserver.ThreadingTCPServer):
            allow_reuse_address = True
            daemon_threads = True

        self.on_line = on_line
        self.server = Server(('127.0.0.1', port), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, name='pose-server',
                                       daemon=True)

    def start(self):
        self.thread.start()
        return self

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class InitialPoseGuard(Node):
    def __init__(self, **node_kwargs):
        super().__init__('initialpose_guard', **node_kwargs)
        self.global_frame = self.declare_parameter('global_frame', 'map').value
        self.limits = {
            'max_linear': self.declare_parameter('max_linear_speed', 0.02).value,
            'max_angular': self.declare_parameter('max_angular_speed', 0.05).value,
            'odom_timeout': self.declare_parameter('odom_timeout', 0.5).value,
            'min_interval': self.declare_parameter('min_interval', 1.0).value,
        }
        self.confirm_timeout = self.declare_parameter('confirm_timeout', 3.0).value
        self.odom_wait = self.declare_parameter('odom_wait', 2.0).value
        self.tol_xy = self.declare_parameter('confirm_xy_tolerance', 0.25).value
        self.tol_yaw = self.declare_parameter('confirm_yaw_tolerance', 0.20).value
        port = self.declare_parameter('listen_port', 8766).value

        self.lock = threading.Lock()
        self.request_lock = threading.Lock()   # one request at a time
        self.last_forward = None
        self.pending = None   # (requested (x, y, yaw), forwarded_at_s, reply)

        reliable = ReliabilityPolicy.RELIABLE
        self.pose_pub = self.create_publisher(
            PoseWithCovarianceStamped, 'initialpose', QoSProfile(depth=1, reliability=reliable))
        self.status_pub = self.create_publisher(
            String, 'debug/initialpose_status', QoSProfile(depth=10, reliability=reliable))
        # AMCL offers amcl_pose TRANSIENT_LOCAL; only samples newer than the
        # forwarded request count as its answer.
        self.create_subscription(PoseWithCovarianceStamped, 'amcl_pose', self.on_amcl, QoSProfile(
            depth=1, reliability=reliable, durability=DurabilityPolicy.TRANSIENT_LOCAL))
        self.create_timer(0.5, self.check_timeout)
        ready = f'initialpose_guard {self.get_namespace()} (frame {self.global_frame})'
        self.server = PoseServer(port, self.on_line,
                                 on_connect=lambda reply: reply('READY', ready)).start()
        self.get_logger().info(
            f'initial pose requests on 127.0.0.1:{self.server.port} -> initialpose (frame '
            f'{self.global_frame}, stationary below {self.limits["max_linear"]} m/s and '
            f'{self.limits["max_angular"]} rad/s)')

    def now_s(self):
        return self.get_clock().now().nanoseconds * 1e-9

    def report(self, status, text, reply):
        line = f'{status}: {text}'
        if status in ('FORWARDED', 'ACCEPTED'):
            self.get_logger().info(line)
        else:
            self.get_logger().warn(line)
        self.status_pub.publish(String(data=line))
        if reply:
            reply(status, text)

    def sample_odom(self):
        """(stamp_s, |v_lin|, |v_ang|) of the next odom message, or None.
        Runs on the request thread while the executor spins elsewhere."""
        got, ev = [], threading.Event()

        def cb(m):
            if not got:
                t = m.twist.twist
                stamp = m.header.stamp.sec + m.header.stamp.nanosec * 1e-9
                got.append((stamp if stamp > 0 else self.now_s(),   # unset stamp: now
                            math.hypot(t.linear.x, t.linear.y), abs(t.angular.z)))
                ev.set()
        sub = self.create_subscription(
            Odometry, 'odom', cb, QoSProfile(depth=1, reliability=ReliabilityPolicy.BEST_EFFORT))
        try:
            ev.wait(self.odom_wait)
        finally:
            self.destroy_subscription(sub)
        return got[0] if got else None

    def on_line(self, line, reply):
        try:
            msg = parse_request(line)
        except ValueError as e:
            self.report('ERROR', f'bad request: {e}', reply)
            return
        with self.request_lock:
            self.process_request(msg, reply)

    def process_request(self, msg, reply):
        odom = self.sample_odom()
        with self.lock:
            now = self.now_s()
            ok, reason = check_request(msg, self.global_frame, odom, now,
                                       self.last_forward, self.limits)
            if ok:
                out = normalized(msg, self.get_clock().now().to_msg())
                self.pose_pub.publish(out)
                self.last_forward = now
                p = out.pose.pose
                requested = (p.position.x, p.position.y, yaw_of(p.orientation))
                self.pending = (requested, now, reply)
        # Replies go out after the lock: a slow client never holds up odom.
        if not ok:
            self.report('REJECTED', reason, reply)
            return
        self.report('FORWARDED', f'x {requested[0]:.2f} y {requested[1]:.2f} '
                                 f'yaw {math.degrees(requested[2]):.0f} deg to AMCL', reply)

    def on_amcl(self, msg):
        stamp = msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9
        with self.lock:
            if self.pending is None or stamp < self.pending[1] - 0.05:
                return
            requested, _, reply = self.pending
            self.pending = None
        p = msg.pose.pose
        amcl = (p.position.x, p.position.y, yaw_of(p.orientation))
        status, text = describe_result(requested, amcl, self.tol_xy, self.tol_yaw)
        self.report(status, text, reply)

    def check_timeout(self):
        with self.lock:
            if not self.pending or self.now_s() - self.pending[1] <= self.confirm_timeout:
                return
            reply, self.pending = self.pending[2], None
        self.report('NO_ANSWER',
                    f'no amcl_pose within {self.confirm_timeout:.0f} s (is AMCL active?)', reply)

    def destroy_node(self):
        self.server.close()
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    try:
        node = InitialPoseGuard()
    except OSError as e:   # port in use: say so instead of a traceback
        rclpy.logging.get_logger('initialpose_guard').fatal(f'cannot listen on 127.0.0.1: {e}')
        rclpy.try_shutdown()
        raise SystemExit(1)
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
