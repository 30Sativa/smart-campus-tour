"""The only write path from remote debug tools into the robot: initial pose.

foxglove_bridge runs read-only (debug_bridge.yaml): its client_topic_whitelist
is not enforced in 3.6.0, so a bridge client could publish any topic (tested,
robot/docs/dds-isolation.md). Instead this node listens on 127.0.0.1:<port>,
reached through the same SSH tunnel, and accepts one thing: an initial pose as
one JSON line. It forwards it to initialpose only when it is safe:

- no goal is active on any action that can move the robot (Nav2 and
  bus_manager go_to_stop, parameter busy_actions): a robot paused by its
  controller, a Wait recovery or an obstacle is stationary but would drive off
  on a jumped map->odom as soon as it resumes;
- the robot is stationary for a whole window (still_window, default 0.5 s):
  every odom sample below the speed limits and every cmd_vel sample zero. One
  odom sample is not enough: 0.6 % of the samples taken while driving in run
  B2c were below the limits (start/stop transitions).
  Odom and cmd_vel are sampled only when a request arrives: a permanent 25 Hz
  rclpy subscription cost ~7 % of a J5005 core (measured) for a tool that is
  idle almost always. Action status topics are latched and only change on goal
  events, so those subscriptions stay;
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
import time

import rclpy
from action_msgs.msg import GoalStatus, GoalStatusArray
from geometry_msgs.msg import PoseWithCovarianceStamped, Twist
from nav_msgs.msg import Odometry
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from std_msgs.msg import String

MAX_LINE = 8192
ACTIVE_GOAL = {GoalStatus.STATUS_ACCEPTED, GoalStatus.STATUS_EXECUTING,
               GoalStatus.STATUS_CANCELING}
# Every action on the robot that can command motion.
BUSY_ACTIONS = ['navigate_to_pose', 'navigate_through_poses', 'follow_waypoints', 'follow_path',
                'spin', 'backup', 'drive_on_heading', 'assisted_teleop', 'wait', 'go_to_stop']
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


def active_goals(status_array):
    return sum(1 for s in status_array.status_list if s.status in ACTIVE_GOAL)


def summarize_motion(odom, cmd):
    """odom: [(stamp_s, |v_lin|, |v_ang|)], cmd: [is_nonzero] over the window."""
    if not odom:
        return None
    return {'n': len(odom), 'last_stamp': max(o[0] for o in odom),
            'max_v': max(o[1] for o in odom), 'max_w': max(o[2] for o in odom),
            'cmd_n': len(cmd), 'cmd_nonzero': any(cmd)}


def check_request(msg, global_frame, motion, now_s, last_forward_s, limits, busy=()):
    """Return (ok, reason). motion: summarize_motion() or None. busy: names of
    actions with an active goal. limits: max_linear, max_angular, odom_timeout,
    min_interval, min_samples."""
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
    if busy:
        return False, (f'a goal is active on {", ".join(busy)}: the robot may only be paused. '
                       'Cancel the goal (or wait for it to finish) first')
    if motion is None:
        return False, 'no odom received: cannot confirm the robot is stationary'
    if motion['n'] < limits['min_samples']:
        return False, (f'only {motion["n"]} odom samples in the window: '
                       'cannot confirm the robot is stationary')
    if now_s - motion['last_stamp'] > limits['odom_timeout']:
        return False, (f'odom is {now_s - motion["last_stamp"]:.1f} s old: '
                       'cannot confirm the robot is stationary')
    if motion['max_v'] > limits['max_linear'] or motion['max_w'] > limits['max_angular']:
        return False, (f'robot is moving (up to {motion["max_v"]:.2f} m/s, '
                       f'{motion["max_w"]:.2f} rad/s): stop it before setting the initial pose')
    if motion['cmd_nonzero']:
        return False, 'a non-zero cmd_vel is being sent (teleop or controller): stop it first'
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
            'min_samples': self.declare_parameter('min_odom_samples', 3).value,
        }
        self.still_window = self.declare_parameter('still_window', 0.5).value
        busy_actions = self.declare_parameter('busy_actions', BUSY_ACTIONS).value
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
        # Latched (TRANSIENT_LOCAL) like every action status publisher.
        self.goal_subs = {}
        self.goals = {}
        status_qos = QoSProfile(depth=1, reliability=reliable,
                                durability=DurabilityPolicy.TRANSIENT_LOCAL)
        for action in busy_actions:
            self.goal_subs[action] = self.create_subscription(
                GoalStatusArray, f'{action}/_action/status',
                lambda m, a=action: self.on_goal_status(a, m), status_qos)
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

    def on_goal_status(self, action, msg):
        with self.lock:
            self.goals[action] = active_goals(msg)

    def busy(self):
        """Actions whose latest status lists an active goal and whose server
        still exists (a crashed server leaves its last status latched)."""
        with self.lock:
            active = [a for a, n in self.goals.items() if n]
        return [a for a in active if self.count_publishers(self.goal_subs[a].topic_name) > 0]

    def sample_motion(self):
        """Odom and cmd_vel over still_window, starting at the first odom sample
        (waiting up to odom_wait for it). Runs on the request thread while the
        executor spins elsewhere."""
        odom, cmd, first = [], [], threading.Event()

        def on_odom(m):
            t = m.twist.twist
            stamp = m.header.stamp.sec + m.header.stamp.nanosec * 1e-9
            odom.append((stamp if stamp > 0 else self.now_s(),   # unset stamp: now
                         math.hypot(t.linear.x, t.linear.y), abs(t.angular.z)))
            first.set()

        def on_cmd(m):
            cmd.append(any(abs(v) > 1e-6 for v in (m.linear.x, m.linear.y, m.angular.z)))
        qos = QoSProfile(depth=10, reliability=ReliabilityPolicy.BEST_EFFORT)
        subs = [self.create_subscription(Odometry, 'odom', on_odom, qos),
                self.create_subscription(Twist, 'cmd_vel', on_cmd, qos)]
        try:
            if first.wait(self.odom_wait):
                time.sleep(self.still_window)
        finally:
            for sub in subs:
                self.destroy_subscription(sub)
        return summarize_motion(list(odom), list(cmd))

    def on_line(self, line, reply):
        try:
            msg = parse_request(line)
        except ValueError as e:
            self.report('ERROR', f'bad request: {e}', reply)
            return
        with self.request_lock:
            self.process_request(msg, reply)

    def process_request(self, msg, reply):
        motion = self.sample_motion()
        busy = self.busy()          # after the window: a goal sent meanwhile counts
        with self.lock:
            now = self.now_s()
            ok, reason = check_request(msg, self.global_frame, motion, now,
                                       self.last_forward, self.limits, busy)
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
