"""Four SR04T, obstacles and a clearance log for the offline Nav2 sim (fakebot2.py).

Runs beside fakebot2 (which must publish its map scan on NAVSIM_SCAN_TOPIC, not on
/robot_01/scan) and reads the TRUE pose from /robot_01/odom (fakebot's odom frame is
the map frame).

- Obstacles (NAVSIM_SONAR_OBST "kind,x,y,r[,t_on[,t_off[,vx,vy]]];..."): circles that
  are NOT in the Nav2 map. kind "low" is under the LiDAR plane (0.47 m): only the
  sonars see it. kind "tall" (a person) is added to /robot_01/scan as well. Times are
  seconds after the first goal starts executing; vx, vy move it (m/s).
- Sonars: the four URDF mounts (sensors.xacro), a physical beam of +-NAVSIM_SONAR_BEAM
  deg (default 20), firmware sr04t.c timing (one sensor at a time, echo time, 60 ms
  gap, 45 ms echo timeout) and semantics (< 200 mm or no echo = invalid). Published
  like stm32_bridge on 40 Hz "FB frames" with the frame's stamp, range NaN unless
  valid and in [0.20, NAVSIM_SONAR_MAX] (default 2.0, the bridge default; the sonar
  guard launch raises it to 6.0), field_of_view 0.52. NAVSIM_SONAR_PUBLISH is the
  bridge's sonar_publish_mode and uses its own gate (stm32_bridge/sonar_publish.py):
  every_frame (default: every sensor with every frame) or on_change (a new reading +
  0.2 s heartbeat, what navigation.launch.py uses with sonar_mode; sonar_run.sh picks
  it for shadow/enforce). The number of Range messages sent is logged at exit.
- Faults: NAVSIM_SONAR_SPURIOUS (probability that a measurement is a random valid
  0.25-0.80 m echo), NAVSIM_SONAR_SILENT_AT (seconds after goal start; the "bridge"
  stops publishing sonar), NAVSIM_SONAR_OFF=1 (no sonar at all).
- Log (NAVSIM_SONAR_OUT .npy, every 2 s and at exit), one row per 50 ms:
  t, x, y, yaw, clear_low, clear_tall, clear_wall, r1..r4 (published, NaN),
  v_ctrl, w_ctrl, v_guard, w_guard, v_nav, w_nav, t_goal
  clear_* = smallest distance from the footprint to that obstacle class (< 0 = inside).
"""
import math
import os

import numpy as np
import rclpy
import yaml
from action_msgs.msg import GoalStatus, GoalStatusArray
from geometry_msgs.msg import TransformStamped, Twist
from nav_msgs.msg import Odometry
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from sensor_msgs.msg import LaserScan, Range
from tf2_msgs.msg import TFMessage

HALF_L, HALF_W = 0.4010999755, 0.2814   # local_costmap footprint (nav2_params_v3.yaml)
# sensors.xacro: x, y, yaw (pitch 4 deg down is ignored in 2D)
SONARS = [(0.388507690, 0.268345645, math.radians(45)), (0.388407690, -0.268354355, math.radians(-45)),
          (-0.388492310, 0.268445645, math.radians(135)), (-0.388492310, -0.268354355, math.radians(-135))]
MIN_MM, MAX_MM, GAP, ECHO_TIMEOUT, C = 200, 6000, 0.060, 0.045, 343.0
PUB_MIN, FOV = 0.20, 0.52
LIDAR_X = -0.0014


def env_f(name, default):
    return float(os.environ.get(name, default))


class Obstacle:
    def __init__(self, spec):
        f = spec.split(',')
        self.kind = f[0].strip()
        assert self.kind in ('low', 'tall'), spec
        self.x0, self.y0, self.r = (float(v) for v in f[1:4])
        self.t_on = float(f[4]) if len(f) > 4 and f[4] else -1e9
        self.t_off = float(f[5]) if len(f) > 5 and f[5] else 1e9
        self.vx = float(f[6]) if len(f) > 6 else 0.0
        self.vy = float(f[7]) if len(f) > 7 else 0.0

    def at(self, tg):
        """(x, y) at goal-time tg, or None when absent. Before any goal: tg is None."""
        if tg is None:
            return (self.x0, self.y0) if self.t_on < 0 else None
        if not (self.t_on <= tg < self.t_off):
            return None
        dt = tg - max(self.t_on, 0.0)
        return self.x0 + self.vx * dt, self.y0 + self.vy * dt


def footprint_clearance(pose, px, py, r):
    """Distance from the footprint at pose to circles (px, py, r); < 0 = overlap."""
    c, s = math.cos(pose[2]), math.sin(pose[2])
    dx, dy = px - pose[0], py - pose[1]
    lx, ly = c * dx + s * dy, -s * dx + c * dy
    ox, oy = np.abs(lx) - HALF_L, np.abs(ly) - HALF_W
    outside = np.hypot(np.maximum(ox, 0), np.maximum(oy, 0))
    inside = np.minimum(np.maximum(ox, oy), 0)
    return outside + inside - r


class SonarSim(Node):
    def __init__(self):
        super().__init__('sonarsim')
        meta = yaml.safe_load(open(os.environ['NAVSIM_MAP']))
        from PIL import Image
        image = os.path.join(os.path.dirname(os.environ['NAVSIM_MAP']), meta['image'])
        img = np.array(Image.open(image).convert('L'), float)
        self.occ = ((255.0 - img) / 255.0 > meta['occupied_thresh'])[::-1]
        self.res, self.org = meta['resolution'], meta['origin']
        yy, xx = np.nonzero(self.occ)
        self.wall_x = self.org[0] + (xx + 0.5) * self.res
        self.wall_y = self.org[1] + (yy + 0.5) * self.res
        self.obst = [Obstacle(s) for s in filter(None, os.environ.get('NAVSIM_SONAR_OBST', '').split(';'))]
        self.beam = math.radians(env_f('NAVSIM_SONAR_BEAM', 20.0))
        self.spurious = env_f('NAVSIM_SONAR_SPURIOUS', 0.0)
        self.silent_at = env_f('NAVSIM_SONAR_SILENT_AT', 1e9)
        self.sonar_off = os.environ.get('NAVSIM_SONAR_OFF', '0') == '1'
        self.pub_max = env_f('NAVSIM_SONAR_MAX', 2.0)
        from stm32_bridge.sonar_publish import SonarPublishGate
        self.gate = SonarPublishGate(os.environ.get('NAVSIM_SONAR_PUBLISH', 'every_frame'))
        self.sent, self.t_start = 0, None
        self.rng = np.random.default_rng(int(os.environ.get('NAVSIM_SEED', '0')))
        self.out = os.environ['NAVSIM_SONAR_OUT']
        self.pose = None
        self.t_goal0 = None
        self.readings = [(0, False)] * 4          # firmware registers (mm, valid)
        self.published = [float('nan')] * 4
        self.active, self.t_ready, self.t_next, self.pending = None, 0.0, 0.0, None
        self.cmd = {'ctrl': (0.0, 0.0), 'guard': (float('nan'), float('nan')), 'nav': (0.0, 0.0)}
        self.log = []
        ns = '/robot_01/'
        self.create_subscription(Odometry, ns + 'odom', self.on_odom, 20)
        self.create_subscription(GoalStatusArray, ns + 'navigate_to_pose/_action/status', self.on_status, 10)
        self.create_subscription(LaserScan, os.environ['NAVSIM_SCAN_TOPIC'], self.on_scan, 5)
        for key, topic in (('ctrl', 'cmd_vel_ctrl'), ('guard', 'cmd_vel_sonar'), ('nav', 'cmd_vel_nav')):
            self.create_subscription(Twist, ns + topic, self.on_cmd(key), 20)
        self.scan_pub = self.create_publisher(LaserScan, ns + 'scan', 5)
        self.range_pub = [self.create_publisher(Range, f'{ns}ultrasonic/sonar{i + 1}/range', 10) for i in range(4)]
        st = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL, reliability=ReliabilityPolicy.RELIABLE)
        self.create_publisher(TFMessage, '/tf_static', st).publish(TFMessage(transforms=[
            self.tfm(f'sonar{i + 1}_link', *SONARS[i]) for i in range(4)]))
        self.create_timer(0.005, self.firmware)
        self.create_timer(0.025, self.bridge)
        self.create_timer(0.05, self.record)
        self.create_timer(2.0, self.dump)

    def tfm(self, child, x, y, yaw):
        m = TransformStamped()
        m.header.frame_id, m.child_frame_id = 'base_link', child
        m.transform.translation.x, m.transform.translation.y = x, y
        m.transform.rotation.z, m.transform.rotation.w = math.sin(yaw / 2), math.cos(yaw / 2)
        return m

    def now(self):
        return self.get_clock().now().nanoseconds * 1e-9

    def tg(self):
        return None if self.t_goal0 is None else self.now() - self.t_goal0

    def on_cmd(self, key):
        def f(m):
            self.cmd[key] = (m.linear.x, m.angular.z)
        return f

    def on_odom(self, m):
        q = m.pose.pose.orientation
        self.pose = (m.pose.pose.position.x, m.pose.pose.position.y, 2 * math.atan2(q.z, q.w))

    def on_status(self, m):
        if self.t_goal0 is None and any(s.status == GoalStatus.STATUS_EXECUTING for s in m.status_list):
            self.t_goal0 = self.now()
            self.get_logger().info('goal executing: obstacle clock starts')

    def circles(self, kinds):
        tg = self.tg()
        out = [(p[0], p[1], o.r) for o in self.obst if o.kind in kinds for p in [o.at(tg)] if p is not None]
        return np.array(out).reshape(-1, 3)

    # -- sonar ----------------------------------------------------------------
    def measure(self, i):
        """Distance (m) of the first echo of sonar i, or None (no echo within 6 m)."""
        x, y, th = self.pose
        sx, sy, syaw = SONARS[i]
        c, s = math.cos(th), math.sin(th)
        ox, oy = x + c * sx - s * sy, y + s * sx + c * sy
        ang = th + syaw + np.linspace(-self.beam, self.beam, 15)
        steps = np.arange(0.02, MAX_MM / 1000.0, 0.01)
        px, py = ox + np.outer(np.cos(ang), steps), oy + np.outer(np.sin(ang), steps)
        ix = ((px - self.org[0]) / self.res).astype(int)
        iy = ((py - self.org[1]) / self.res).astype(int)
        ok = (ix >= 0) & (iy >= 0) & (ix < self.occ.shape[1]) & (iy < self.occ.shape[0])
        hit = np.zeros(ok.shape, bool)
        hit[ok] = self.occ[iy[ok], ix[ok]]
        for cx, cy, r in self.circles(('low', 'tall')):
            hit |= np.hypot(px - cx, py - cy) <= r
        d = steps[hit.argmax(1)][hit.any(1)]
        return float(d.min()) if d.size else None

    def firmware(self):
        if self.pose is None or self.sonar_off:
            return
        t = self.now()
        if self.active is not None:
            if t >= self.t_ready:
                self.readings[self.active] = self.pending
                self.active, self.t_next = None, t + GAP
            return
        if t < self.t_next:
            return
        i = self.rr = (getattr(self, 'rr', -1) + 1) % 4
        d = self.measure(i)
        if self.spurious > 0 and self.rng.random() < self.spurious:
            d = float(self.rng.uniform(0.25, 0.80))
        if d is None or 2 * d / C > ECHO_TIMEOUT:
            self.pending, echo = (0, False), ECHO_TIMEOUT
        else:
            mm = int(d * 1000)
            self.pending, echo = ((mm, True) if MIN_MM <= mm <= MAX_MM else (0, False)), 2 * d / C
        self.active, self.t_ready = i, t + echo

    def bridge(self):
        tg = self.tg()
        if self.sonar_off or (tg is not None and tg >= self.silent_at):
            return
        now = self.get_clock().now()
        stamp, t = now.to_msg(), now.nanoseconds * 1e-9
        self.t_start = t if self.t_start is None else self.t_start
        for i in range(4):
            mm, valid = self.readings[i]
            if not self.gate.due(i, (mm, valid), t):
                continue
            d = mm / 1000.0
            m = Range()
            m.header.stamp, m.header.frame_id = stamp, f'sonar{i + 1}_link'
            m.radiation_type, m.field_of_view, m.min_range, m.max_range = Range.ULTRASOUND, FOV, PUB_MIN, self.pub_max
            m.range = d if valid and PUB_MIN <= d <= self.pub_max else float('nan')
            self.published[i] = m.range
            self.range_pub[i].publish(m)
            self.sent += 1

    # -- LiDAR: tall obstacles join the map scan --------------------------------
    def on_scan(self, m):
        tall = self.circles(('tall',))
        if self.pose is not None and len(tall):
            x, y, th = self.pose
            lx, ly = x + LIDAR_X * math.cos(th), y + LIDAR_X * math.sin(th)
            a = th + m.angle_min + np.arange(len(m.ranges)) * m.angle_increment
            ux, uy = np.cos(a), np.sin(a)
            r = np.array(m.ranges, float)
            for cx, cy, rad in tall:
                fx, fy = lx - cx, ly - cy
                b = fx * ux + fy * uy
                disc = b * b - (fx * fx + fy * fy - rad * rad)
                tt = -b - np.sqrt(np.maximum(disc, 0))
                hit = (disc >= 0) & (tt > m.range_min)
                r = np.where(hit & (tt < r), tt, r)
            m.ranges = r.astype(np.float32).tolist()
        self.scan_pub.publish(m)

    # -- log ----------------------------------------------------------------
    def record(self):
        if self.pose is None:
            return
        row = [self.now(), *self.pose]
        for kinds in (('low',), ('tall',)):
            c = self.circles(kinds)
            row.append(float(footprint_clearance(self.pose, c[:, 0], c[:, 1], c[:, 2]).min())
                       if len(c) else float('inf'))
        near = np.hypot(self.wall_x - self.pose[0], self.wall_y - self.pose[1]) < 1.5
        row.append(float(footprint_clearance(self.pose, self.wall_x[near], self.wall_y[near], self.res / 2).min())
                   if near.any() else float('inf'))
        tg = self.tg()
        row += [*self.published, *self.cmd['ctrl'], *self.cmd['guard'], *self.cmd['nav'],
                tg if tg is not None else float('nan')]
        self.log.append(row)

    def dump(self):
        np.save(self.out + '.tmp.npy', np.array(self.log))
        os.replace(self.out + '.tmp.npy', self.out)


def main():
    rclpy.init()
    n = SonarSim()
    try:
        rclpy.spin(n)
    except (KeyboardInterrupt, Exception):
        pass
    n.dump()
    if n.t_start is not None:
        span = n.now() - n.t_start
        print(f'sonarsim: {n.gate.mode}: {n.sent} Range in {span:.1f} s = {n.sent / span:.1f} msg/s',
              flush=True)


if __name__ == '__main__':
    main()
