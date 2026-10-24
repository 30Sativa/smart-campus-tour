"""Kinematic stand-in for the real robot, for the offline Nav2 sim.

- /robot_01/cmd_vel_nav (velocity_smoother output) -> bridge model: pair-scale
  to 250 mm/s per wheel (wheel_base 0.4714), 0.09 s pure delay (fitted on the
  2026-10-15 bag), 0.5 s command timeout.
- Publishes odom->base_footprint (= true pose, i.e. a perfect EKF), /robot_01/odom,
  static base_footprint->base_link->lidar_link, a 900-beam scan ray-cast on
  map_fix.pgm from the TRUE pose, and map->odom = (true pose + localisation
  error) * odom^-1. The error is an AR(1) process stepped like AMCL
  (every 0.25 m or 0.2 rad): e <- a*e + N(0, s).
- Logs everything to $NAVSIM_OUT (npz) every 2 s.
Env: NAVSIM_START "x,y,yaw_deg", NAVSIM_NOISE "s_xy,s_yaw_deg", NAVSIM_SEED, NAVSIM_OUT,
NAVSIM_AR (error autocorrelation, see below), NAVSIM_OBST "x,y,r;..." (round obstacles NOT in the Nav2 map, only seen by the scan: replanning tests).
(derived from the 2026-10-16 navsim fakebot; obstacle/AR/range_max options added 2026-10-22.)
"""
import math, os, collections, numpy as np, yaml
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, DurabilityPolicy, ReliabilityPolicy
from geometry_msgs.msg import Twist, TransformStamped
from nav_msgs.msg import Odometry
from sensor_msgs.msg import LaserScan
from tf2_msgs.msg import TFMessage

HB, CAP, DELAY, TIMEOUT, A = 0.4714 / 2, 0.25, 0.09, 0.5, 0.7
N_BEAMS, RMAX, STEP = 900, 10.0, 0.02


def q(yaw):
    return 0.0, 0.0, math.sin(yaw / 2), math.cos(yaw / 2)


def compose(a, b):  # a * b for (x, y, yaw)
    c, s = math.cos(a[2]), math.sin(a[2])
    return (a[0] + c * b[0] - s * b[1], a[1] + s * b[0] + c * b[1], a[2] + b[2])


def inverse(a):
    c, s = math.cos(a[2]), math.sin(a[2])
    return (-c * a[0] - s * a[1], s * a[0] - c * a[1], -a[2])


class FakeBot(Node):
    def __init__(self):
        super().__init__('fakebot')
        x, y, yd = (float(v) for v in os.environ['NAVSIM_START'].split(','))
        self.pose = [x, y, math.radians(yd)]
        sxy, syaw = (float(v) for v in os.environ.get('NAVSIM_NOISE', '0,0').split(','))
        self.sxy, self.syaw = sxy, math.radians(syaw)
        # NAVSIM_AR (default 0.7 = original model). A higher value with innovations scaled by
        # sqrt((1-ar^2)/(1-0.7^2)) keeps the same stationary error size but makes it vary slowly,
        # like AMCL (white-ish yaw jitter paints phantom obstacles at grazing angles in long corridors).
        self.ar = float(os.environ.get('NAVSIM_AR', '0.7'))
        k = math.sqrt((1 - self.ar ** 2) / (1 - 0.7 ** 2)); self.sxy *= k; self.syaw *= k
        self.rng = np.random.default_rng(int(os.environ.get('NAVSIM_SEED', '0')))
        self.err = np.zeros(3)
        self.since = [0.0, 0.0]
        self.out = os.environ['NAVSIM_OUT']
        mp = os.path.expanduser('~/smart-campus-tour/robot/robot_maps/map2.yaml')
        meta = yaml.safe_load(open(mp))
        from PIL import Image
        img = np.array(Image.open(os.path.join(os.path.dirname(mp), meta['image'])).convert('L'), dtype=float)
        occ = (255.0 - img) / 255.0 > meta['occupied_thresh']
        self.occ = occ[::-1]  # row 0 = lowest y
        self.res, self.org = meta['resolution'], meta['origin']
        for spec in filter(None, os.environ.get('NAVSIM_OBST', '').split(';')):
            ox, oy, orad = (float(v) for v in spec.split(','))
            yy, xx = np.mgrid[0:self.occ.shape[0], 0:self.occ.shape[1]]
            cx = self.org[0] + (xx + 0.5) * self.res; cy = self.org[1] + (yy + 0.5) * self.res
            self.occ = self.occ | (np.hypot(cx - ox, cy - oy) <= orad)
        self.ang = -math.pi + np.arange(N_BEAMS) * (2 * math.pi / N_BEAMS)
        self.steps = np.arange(0.15, RMAX, STEP)
        self.queue = collections.deque()
        self.cmd = (0.0, 0.0, -1.0)
        self.applied = (0.0, 0.0, 1.0)
        self.ctrl = (0.0, 0.0)
        self.nav = (0.0, 0.0)
        self.log = []
        self.tf = self.create_publisher(TFMessage, '/tf', 50)
        st = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL, reliability=ReliabilityPolicy.RELIABLE)
        self.tfs = self.create_publisher(TFMessage, '/tf_static', st)
        self.odom = self.create_publisher(Odometry, '/robot_01/odom', 20)
        self.scan = self.create_publisher(LaserScan, os.environ.get('NAVSIM_SCAN_TOPIC', '/robot_01/scan'), 5)
        self.create_subscription(Twist, os.environ.get('NAVSIM_CMD_TOPIC', '/robot_01/cmd_vel_nav'), self.on_nav, 20)
        self.create_subscription(Twist, '/robot_01/cmd_vel_ctrl', self.on_ctrl, 20)
        self.tfs.publish(TFMessage(transforms=[self.tfm('base_footprint', 'base_link', (0, 0, 0)),
                                               self.tfm('base_link', 'lidar_link', (-0.0014, 0, 0), z=0.2665)]))
        self.t_last = self.now()
        self.create_timer(0.02, self.step)
        self.create_timer(0.1, self.do_scan)
        self.create_timer(0.05, self.pub_map_odom)
        self.create_timer(2.0, self.dump)

    def now(self):
        return self.get_clock().now().nanoseconds * 1e-9

    def tfm(self, parent, child, p, z=0.0, stamp=None):
        m = TransformStamped()
        m.header.frame_id, m.child_frame_id = parent, child
        m.header.stamp = stamp or self.get_clock().now().to_msg()
        m.transform.translation.x, m.transform.translation.y, m.transform.translation.z = float(p[0]), float(p[1]), float(z)
        r = m.transform.rotation
        r.x, r.y, r.z, r.w = q(float(p[2]))
        return m

    def on_nav(self, m):
        self.nav = (m.linear.x, m.angular.z)
        self.queue.append((self.now() + DELAY, m.linear.x, m.angular.z))

    def on_ctrl(self, m):
        self.ctrl = (m.linear.x, m.angular.z)

    def step(self):
        t = self.now(); dt = t - self.t_last; self.t_last = t
        while self.queue and self.queue[0][0] <= t:
            _, v, w = self.queue.popleft(); self.cmd = (v, w, t)
        v, w, tc = self.cmd
        if t - tc > TIMEOUT:
            v, w = 0.0, 0.0
        l, r = v - w * HB, v + w * HB
        peak = max(abs(l), abs(r)); sc = 1.0
        if peak > CAP:
            sc = CAP / peak; v, w = v * sc, w * sc
        self.applied = (v, w, sc)
        x, y, th = self.pose
        th2 = th + w * dt
        self.pose = [x + v * dt * math.cos(th + w * dt / 2), y + v * dt * math.sin(th + w * dt / 2), th2]
        self.since[0] += abs(v) * dt; self.since[1] += abs(w) * dt
        if self.since[0] >= 0.25 or self.since[1] >= 0.2:
            self.since = [0.0, 0.0]
            self.err = self.ar * self.err + self.rng.normal(0, [self.sxy, self.sxy, self.syaw])
        stamp = self.get_clock().now().to_msg()
        self.tf.publish(TFMessage(transforms=[self.tfm('odom', 'base_footprint', self.pose, stamp=stamp)]))
        o = Odometry(); o.header.stamp = stamp; o.header.frame_id = 'odom'; o.child_frame_id = 'base_footprint'
        o.pose.pose.position.x, o.pose.pose.position.y = self.pose[0], self.pose[1]
        rr = o.pose.pose.orientation; rr.x, rr.y, rr.z, rr.w = q(self.pose[2])
        o.twist.twist.linear.x, o.twist.twist.angular.z = v, w
        self.odom.publish(o)
        b = self.believed()
        self.log.append((t, *self.pose, *b, v, w, sc, *self.nav, *self.ctrl))

    def believed(self):
        e = self.err
        return (self.pose[0] + e[0], self.pose[1] + e[1], self.pose[2] + e[2])

    def pub_map_odom(self):
        # map->odom = believed * odom_pose^-1 ; odom pose == true pose
        mo = compose(self.believed(), inverse(self.pose))
        self.tf.publish(TFMessage(transforms=[self.tfm('map', 'odom', mo)]))

    def do_scan(self):
        x, y, th = self.pose
        lx, ly = x - 0.0014 * math.cos(th), y - 0.0014 * math.sin(th)
        a = th + self.ang
        px = lx + np.outer(np.cos(a), self.steps); py = ly + np.outer(np.sin(a), self.steps)
        ix = ((px - self.org[0]) / self.res).astype(int); iy = ((py - self.org[1]) / self.res).astype(int)
        ok = (ix >= 0) & (iy >= 0) & (ix < self.occ.shape[1]) & (iy < self.occ.shape[0])
        hit = np.zeros_like(ok); hit[ok] = self.occ[iy[ok], ix[ok]]
        first = np.where(hit.any(1), hit.argmax(1), -1)
        rng = np.where(first >= 0, self.steps[np.maximum(first, 0)], np.inf).astype(np.float32)
        m = LaserScan(); m.header.stamp = self.get_clock().now().to_msg(); m.header.frame_id = 'lidar_link'
        m.angle_min = -math.pi; m.angle_increment = 2 * math.pi / N_BEAMS
        m.angle_max = m.angle_min + (N_BEAMS - 1) * m.angle_increment
        m.scan_time = 0.1; m.range_min = 0.15
        # range_max must match the real RPLIDAR (25.0): with range_max == obstacle_max_range (12.0) and
        # inf_is_valid, Nav2 turned every no-return beam into an obstacle 12 m away (phantom walls, R2 bug).
        m.range_max = float(os.environ.get('NAVSIM_RANGE_MAX', '25.0'))
        m.ranges = rng.tolist()
        self.scan.publish(m)

    def dump(self):
        np.save(self.out + '.tmp.npy', np.array(self.log)); os.replace(self.out + '.tmp.npy', self.out)


def main():
    rclpy.init(); n = FakeBot()
    try:
        rclpy.spin(n)
    except (KeyboardInterrupt, Exception):
        pass
    n.dump()


if __name__ == '__main__':
    main()
