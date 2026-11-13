"""pose_bootstrap: set AMCL's initial pose from the LiDAR, without RViz.

Runs once when Nav2 comes up (and again on <ns>/pose_bootstrap/relocalize, std_srvs/Trigger):

1. Skips when AMCL already has a pose (somebody set one by hand), unless relocalize is called.
2. Waits until the robot is stationary and no goal is active (same rules as initialpose_guard).
3. Averages a few scans and looks for the pose where they fit the map
   (pose_bootstrap_core): first around the last pose saved on this map and the map's homes
   (START, dock), then, if enabled, inside the map's global-search regions.
   A pose is used only when the scan match is good AND unique. Otherwise nothing is published
   and the status says NEEDS_MANUAL_POSE: set the pose in RViz as before.
4. Publishes it on initialpose, asks AMCL for a few no-motion updates (the robot does not move),
   and reports LOCALIZED only when AMCL agrees and its covariance is small.

While localized it saves the AMCL pose (atomic file per map content hash) as a hint for the
next start; the hint is always re-checked against the scan, because the robot may have been
pushed while it was off.

Status (latched, std_msgs/String) on <ns>/pose_bootstrap/status:
  LOCALIZED | NEEDS_MANUAL_POSE | SKIPPED | NOT_CONVERGED | ABORTED | DISABLED | ERROR, then detail.
Manual 2D Pose Estimate (RViz -> initialpose_guard -> initialpose) is unchanged and always wins:
a manual pose during an attempt aborts the attempt.
"""
import math
import os
import threading
import time

import numpy as np
import rclpy
import rclpy.duration
import rclpy.time
from action_msgs.msg import GoalStatusArray
from geometry_msgs.msg import PoseWithCovarianceStamped
from nav_msgs.msg import OccupancyGrid, Odometry
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy, qos_profile_sensor_data
from sensor_msgs.msg import LaserScan
from std_msgs.msg import String
from std_srvs.srv import Empty, Trigger
from tf2_ros import Buffer, TransformException, TransformListener

from .initialpose_guard import BUSY_ACTIONS, active_goals, yaw_of
from .pose_bootstrap_config import (ConfigError, default_config_path, load_config, map_key,
                                    read_saved_pose, write_saved_pose)
from .pose_bootstrap_core import LikelihoodField, Pose2D, beams_in_base, locate


class PoseBootstrap(Node):
    def __init__(self, **kw):
        super().__init__('pose_bootstrap', **kw)
        p = self.declare_parameter
        self.map_yaml = p('map_yaml', '').value
        self.config_file = p('config_file', '').value or (default_config_path(self.map_yaml) if self.map_yaml else '')
        self.state_dir = os.path.expanduser(p('state_dir', '~/.local/state/sct-robot/pose_bootstrap').value)
        self.global_frame = p('global_frame', 'map').value
        self.base_frame = p('base_frame', 'base_footprint').value
        self.run_on_start = p('run_on_start', True).value
        self.start_delay = p('start_delay', 3.0).value
        self.scans_to_average = int(p('scans_to_average', 3).value)
        self.still_window = p('still_window', 1.0).value
        self.max_linear = p('max_linear_speed', 0.02).value
        self.max_angular = p('max_angular_speed', 0.05).value
        self.nomotion_updates = int(p('nomotion_updates', 5).value)
        self.converge_timeout = p('converge_timeout', 10.0).value
        self.accept_cov_xy = p('accept_cov_xy', 0.09).value
        self.accept_cov_yaw = p('accept_cov_yaw', 0.05).value
        self.agree_xy = p('agree_xy', 0.30).value
        self.agree_yaw = math.radians(p('agree_yaw_deg', 10.0).value)
        self.initial_cov_xy = p('initial_cov_xy', 0.04).value
        self.initial_cov_yaw = p('initial_cov_yaw', 0.02).value
        self.save_period = p('save_period', 5.0).value
        self.save_min_move = p('save_min_move', 0.2).value

        self.lock = threading.Lock()
        self.attempt_lock = threading.Lock()
        self.grid_msg = None
        self.field = None
        self.scans = []                      # recent LaserScan
        self.odom = []                       # (t, |v|, |w|)
        self.amcl = None                     # (t_recv, Pose2D, cov_xx, cov_yy, cov_yaw)
        self.goals = {}
        self.our_pose_t = None               # monotonic time we published initialpose
        self.manual_pose = False           # a manual pose arrived during the current attempt
        self.manual_seen = False           # ... or at any time since this node started
        self.last_saved = None
        self.homes, self.use_saved, self.use_global, self.cfg = [], False, False, None
        self.key = None
        self.disabled = None
        try:
            if not self.map_yaml or not os.path.isfile(self.map_yaml):
                raise ConfigError(f'map_yaml {self.map_yaml!r} not found')
            self.homes, self.use_saved, self.use_global, self.cfg = load_config(
                self.config_file, self.map_yaml, self.global_frame)
            self.key = map_key(self.map_yaml)
        except ConfigError as e:
            self.disabled = str(e)

        latched = QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE,
                             durability=DurabilityPolicy.TRANSIENT_LOCAL)
        self.status_pub = self.create_publisher(String, '~/status', latched)
        self.pose_pub = self.create_publisher(PoseWithCovarianceStamped, 'initialpose',
                                              QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE))
        self.tf = Buffer(); self.tf_listener = TransformListener(self.tf, self)
        if self.disabled:
            self.status('DISABLED', self.disabled)
            return
        # Reentrant: relocalize runs for seconds and waits on scan/odom/amcl callbacks.
        cb = ReentrantCallbackGroup()
        self.create_subscription(OccupancyGrid, 'map', self.on_map, latched, callback_group=cb)
        self.create_subscription(LaserScan, 'scan', self.on_scan, qos_profile_sensor_data, callback_group=cb)
        self.create_subscription(Odometry, 'odom', self.on_odom, qos_profile_sensor_data, callback_group=cb)
        self.create_subscription(PoseWithCovarianceStamped, 'amcl_pose', self.on_amcl, latched, callback_group=cb)
        self.create_subscription(PoseWithCovarianceStamped, 'initialpose', self.on_initialpose,
                                 QoSProfile(depth=5, reliability=ReliabilityPolicy.RELIABLE), callback_group=cb)
        for action in BUSY_ACTIONS:
            self.create_subscription(GoalStatusArray, f'{action}/_action/status',
                                     lambda m, a=action: self.on_goals(a, m), latched, callback_group=cb)
        self.nomotion = self.create_client(Empty, 'request_nomotion_update', callback_group=cb)
        self.create_service(Trigger, '~/relocalize', self.on_relocalize, callback_group=cb)
        self.create_timer(self.save_period, self.save_pose, callback_group=cb)
        homes = ', '.join(n for n, _ in self.homes) or 'none'
        self.get_logger().info(f'config {self.config_file}: homes {homes}; saved pose '
                               f'{"on" if self.use_saved else "off"}; global search '
                               f'{"on " + str(list(self.cfg.regions)) if self.use_global else "off"}')
        if self.run_on_start:
            threading.Thread(target=self.startup, name='pose-bootstrap', daemon=True).start()

    # ---- inputs
    def on_map(self, msg):
        with self.lock:
            self.grid_msg = msg; self.field = None

    def on_scan(self, msg):
        with self.lock:
            self.scans = (self.scans + [(time.monotonic(), msg)])[-10:]

    def on_odom(self, msg):
        t = msg.twist.twist
        with self.lock:
            self.odom = (self.odom + [(time.monotonic(), math.hypot(t.linear.x, t.linear.y), abs(t.angular.z))])[-100:]

    def on_amcl(self, msg):
        c = msg.pose.covariance
        with self.lock:
            self.amcl = (time.monotonic(), Pose2D(msg.pose.pose.position.x, msg.pose.pose.position.y,
                                                 yaw_of(msg.pose.pose.orientation)), c[0], c[7], c[35])

    def on_initialpose(self, msg):
        with self.lock:
            # Our own message comes back on this subscription right after we publish it.
            if self.our_pose_t is not None and time.monotonic() - self.our_pose_t < 0.5:
                return
            self.manual_pose = True
            self.manual_seen = True

    def on_goals(self, action, msg):
        with self.lock:
            self.goals[action] = active_goals(msg)

    # ---- helpers
    def status(self, state, detail):
        line = f'{state}: {detail}'
        (self.get_logger().info if state in ('LOCALIZED', 'SKIPPED') else self.get_logger().warn)(line)
        self.status_pub.publish(String(data=line))
        return state, detail

    def stationary(self):
        end = time.monotonic() + self.still_window
        time.sleep(self.still_window)
        with self.lock:
            window = [o for o in self.odom if o[0] >= end - self.still_window - 0.05]
            busy = [a for a, n in self.goals.items() if n]
        if busy:
            return f'a goal is active on {", ".join(busy)}'
        if len(window) < 3:
            return 'no odom: cannot confirm the robot is stationary'
        if max(o[1] for o in window) > self.max_linear or max(o[2] for o in window) > self.max_angular:
            return 'robot is moving'
        return None

    def laser_pose(self, frame):
        tr = self.tf.lookup_transform(self.base_frame, frame, rclpy.time.Time(),
                                      timeout=rclpy.duration.Duration(seconds=2.0))
        t = tr.transform
        return (t.translation.x, t.translation.y, yaw_of(t.rotation))

    def wait_for(self, cond, timeout):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if cond():
                return True
            time.sleep(0.1)
        return False

    # ---- attempt
    def startup(self):
        time.sleep(self.start_delay)
        if not self.wait_for(lambda: self.grid_msg is not None and bool(self.scans), 60.0):
            self.status('ERROR', 'no map or scan within 60 s'); return
        if not self.nomotion.wait_for_service(timeout_sec=60.0):
            self.status('ERROR', 'AMCL (request_nomotion_update) not available within 60 s'); return
        self.attempt(force=False)

    def on_relocalize(self, _req, resp):
        state, detail = self.attempt(force=True)
        resp.success = state == 'LOCALIZED'
        resp.message = f'{state}: {detail}'
        return resp

    def attempt(self, force):
        if not self.attempt_lock.acquire(blocking=False):
            return self.status('SKIPPED', 'an attempt is already running')
        try:
            return self._attempt(force)
        except Exception as e:     # never leave the status silent
            return self.status('ERROR', f'{type(e).__name__}: {e}')
        finally:
            self.attempt_lock.release()

    def _attempt(self, force):
        with self.lock:
            manual_seen = self.manual_seen
            a = self.amcl
            self.manual_pose = False
        localized = a is not None and a[2] <= self.accept_cov_xy and a[3] <= self.accept_cov_xy and \
            a[4] <= self.accept_cov_yaw
        if not force and (manual_seen or localized):
            return self.status('SKIPPED', ('a manual initial pose was set' if manual_seen else 'AMCL is already localized')
                               + '; call relocalize to redo')
        still_since = time.monotonic()
        why = self.stationary()
        if why:
            return self.status('NEEDS_MANUAL_POSE', f'not attempted: {why}')
        with self.lock:
            if self.field is None:
                g = self.grid_msg
                grid = np.array(g.data, dtype=np.int16).reshape(g.info.height, g.info.width)
                self.field = LikelihoodField(grid, g.info.resolution, g.info.origin.position.x,
                                             g.info.origin.position.y, self.cfg)
            field = self.field

        def fresh():
            # Only scans taken while the robot was confirmed stationary.
            with self.lock:
                return [m for t, m in self.scans if t >= still_since]
        if not self.wait_for(lambda: len(fresh()) >= self.scans_to_average, 5.0) and not fresh():
            return self.status('ERROR', 'no scan while stationary')
        scans = fresh()[-self.scans_to_average:]
        try:
            lp = self.laser_pose(scans[0].header.frame_id)
        except TransformException as e:
            return self.status('ERROR', f'no TF {self.base_frame} <- {scans[0].header.frame_id}: {e}')
        pts = [beams_in_base(s.ranges, s.angle_min, s.angle_increment, s.range_min, s.range_max, lp)
               for s in scans]
        candidates = []
        if self.use_saved:
            saved = read_saved_pose(self.state_dir, self.key)
            if saved:
                candidates.append(('saved', saved[0]))
        candidates += self.homes
        t0 = time.monotonic()
        res = locate(field, pts, candidates, self.cfg, self.use_global)
        took = time.monotonic() - t0
        tried = ', '.join(f'{n} {s:.2f}' for n, s in res.tried)
        if res.status != 'VERIFIED':
            return self.status('NEEDS_MANUAL_POSE', f'{res.status}: {res.detail} (tried {tried}; {took:.1f} s)')
        why = self.stationary()
        with self.lock:
            manual = self.manual_pose
        if manual:
            return self.status('ABORTED', 'a manual initial pose arrived meanwhile; keeping it')
        if why:
            return self.status('NEEDS_MANUAL_POSE', f'found a pose but {why} now; not published')
        pose = res.pose
        # AMCL answers each no-motion update with an amcl_pose; count every answer after the
        # pose went out (a stationary robot produces no further updates on its own).
        sent = time.monotonic()
        self.publish_pose(pose)
        ok = False
        for _ in range(self.nomotion_updates):
            self.nomotion.call_async(Empty.Request())
            if self.wait_for(lambda: self.converged(pose, sent), 0.4):
                ok = True
                break
        ok = ok or self.wait_for(lambda: self.converged(pose, sent), self.converge_timeout)
        with self.lock:
            a = self.amcl
            manual = self.manual_pose
        if manual:
            return self.status('ABORTED', 'a manual initial pose arrived meanwhile; keeping it')
        where = f'x {pose.x:.2f} y {pose.y:.2f} yaw {math.degrees(pose.yaw):.0f} deg from {res.source}'
        if not ok:
            got = (f'AMCL at x {a[1].x:.2f} y {a[1].y:.2f}, cov {a[2]:.3f}/{a[3]:.3f}/{a[4]:.3f}' if a and a[0] >= sent - 2
                   else 'no AMCL answer')
            return self.status('NOT_CONVERGED', f'published {where} (scan {res.score:.2f}) but {got}; check RViz')
        return self.status('LOCALIZED', f'{where}; scan match {res.score:.2f} vs {res.runner_up:.2f}; '
                                        f'AMCL cov {a[2]:.3f}/{a[3]:.3f}/{a[4]:.3f}; {took:.1f} s')

    def publish_pose(self, pose):
        msg = PoseWithCovarianceStamped()
        msg.header.frame_id = self.global_frame
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.pose.pose.position.x, msg.pose.pose.position.y = pose.x, pose.y
        msg.pose.pose.orientation.z, msg.pose.pose.orientation.w = math.sin(pose.yaw / 2), math.cos(pose.yaw / 2)
        cov = [0.0] * 36
        cov[0] = cov[7] = self.initial_cov_xy
        cov[35] = self.initial_cov_yaw
        msg.pose.covariance = cov
        with self.lock:
            self.our_pose_t = time.monotonic()
        self.pose_pub.publish(msg)

    def converged(self, pose, since):
        with self.lock:
            a = self.amcl
        if not a or a[0] < since:
            return False
        return (a[2] <= self.accept_cov_xy and a[3] <= self.accept_cov_xy and a[4] <= self.accept_cov_yaw
                and a[1].dist(pose) <= self.agree_xy and a[1].dyaw(pose) <= self.agree_yaw)

    # ---- saved pose
    def save_pose(self):
        if self.disabled:
            return
        with self.lock:
            a = self.amcl
        if not a or time.monotonic() - a[0] > 30.0:
            return
        if a[2] > self.accept_cov_xy or a[3] > self.accept_cov_xy or a[4] > self.accept_cov_yaw:
            return                    # not localized: do not overwrite a good hint with a bad one
        if self.last_saved and a[1].dist(self.last_saved) < self.save_min_move and \
                a[1].dyaw(self.last_saved) < math.radians(10):
            return
        try:
            write_saved_pose(self.state_dir, self.key, a[1], time.time(), self.map_yaml)
            self.last_saved = a[1]
        except OSError as e:
            self.get_logger().warn(f'cannot save last pose: {e}', throttle_duration_sec=60.0)


def main(args=None):
    rclpy.init(args=args)
    node = PoseBootstrap()
    executor = MultiThreadedExecutor(num_threads=3)
    executor.add_node(node)
    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
        node.save_pose()
        node.destroy_node()
        rclpy.try_shutdown()
