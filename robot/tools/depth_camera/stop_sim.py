#!/usr/bin/env python3
"""Offline closed loop: does the robot stop before a low obstacle that only the depth camera sees?
(robot/docs/depth-camera.md). Real Humble nav2_costmap_2d with the local_costmap section of the Nav2
params, synthetic depth cloud (12 cm box, optional wall behind it) in the driver's optical frame, an
empty LiDAR scan, and a model of the rest of the chain:

  RPP (Humble isCollisionImminent: footprint outline lethal within min(v*T, carrot 0.8 m))
  controller_server 10 Hz, publishes zero while a collision is reported (failure_tolerance)
  velocity_smoother +-0.5 m/s^2, then a pure actuation delay (--delay, bridge + STM32 + motors)
  the Astra returns nothing closer than 0.6 m

The model reads the published grid, so the temporary copy publishes at the costmap update rate.
Scenarios: the box is there from the start, or appears suddenly at a front gap; after the stop,
K BT-style "clear entirely" calls (the controller then sees an empty costmap until the next update)
to measure the creep. Isolated: ROS_DOMAIN_ID 89, localhost only, nice.

  stop_sim.py [--T 1.0 4.0] [--delay 0.15] [--appear none 0.5 0.65 0.8 1.0] [--clears 8]
"""
import argparse, json, math, os, signal, struct, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
PARAMS = os.path.join(HERE, '..', '..', 'ros2_ws', 'src', 'robot_control', 'config', 'nav2_params_v3.yaml')
BZ, CAM = 0.2068, (0.394, 0.0, 0.066)
FP = [(0.4011, 0.28145), (-0.4011, 0.28145), (-0.4011, -0.28135), (0.4011, -0.28135)]
BOX_X = 2.6                                   # world x of the box's near face; the robot starts at x = 0


def child_env():
    env = {k: v for k, v in os.environ.items() if not k.startswith(('ROS_', 'AMENT', 'RMW_', 'FASTRTPS', 'FASTDDS'))}
    env.update(ROS_DOMAIN_ID='89', ROS_LOCALHOST_ONLY='1', RMW_IMPLEMENTATION='rmw_fastrtps_cpp')
    return env


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--T', type=float, nargs='+', default=[1.0, 4.0])
    ap.add_argument('--delay', type=float, nargs='+', default=[0.15])
    ap.add_argument('--appear', nargs='+', default=['none', '0.5', '0.65', '0.8', '1.0'])
    ap.add_argument('--wall', choices=('yes', 'no'), default='yes')
    ap.add_argument('--clears', type=int, default=8)
    ap.add_argument('--params', default=PARAMS)
    ap.add_argument('--child', action='store_true', help=argparse.SUPPRESS)
    a = ap.parse_args()
    if not a.child:
        cmd = f'source /opt/ros/humble/setup.bash && exec nice -n 10 {sys.executable} {os.path.abspath(__file__)} --child ' + \
              ' '.join(sys.argv[1:])
        return subprocess.run(['bash', '-c', cmd], env=child_env()).returncode
    return run(a)


def run(a):
    import yaml
    import rclpy
    from geometry_msgs.msg import TransformStamped
    from lifecycle_msgs.srv import ChangeState
    from nav_msgs.msg import OccupancyGrid
    from nav2_msgs.srv import ClearEntireCostmap
    from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
    from sensor_msgs.msg import LaserScan, PointCloud2, PointField
    from tf2_ros import StaticTransformBroadcaster, TransformBroadcaster
    local = yaml.safe_load(open(a.params).read().replace('$(var robot_ns)', ''))['local_costmap']['local_costmap']['ros__parameters']
    # the real controller reads the costmap at its update rate; the model reads the published grid
    local['publish_frequency'] = local['update_frequency']
    tmp = tempfile.mkdtemp(prefix='stop_sim_'); pf = os.path.join(tmp, 'p.yaml')
    yaml.safe_dump({'/**': {'ros__parameters': local}}, open(pf, 'w'))
    node = subprocess.Popen(['ros2', 'run', 'nav2_costmap_2d', 'nav2_costmap_2d', '--ros-args', '--params-file', pf],
                            stdout=open(os.path.join(tmp, 'costmap.log'), 'w'), stderr=subprocess.STDOUT, start_new_session=True)
    rclpy.init(); n = rclpy.create_node('depth_stop_sim')
    S = dict(x=0.0, g=None, box=False, gstamp=0.0)
    def on_grid(m): S['g'] = m; S['gstamp'] = time.time()
    n.create_subscription(OccupancyGrid, '/costmap/costmap', on_grid,
                          QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL, reliability=ReliabilityPolicy.RELIABLE))
    sp = n.create_publisher(LaserScan, '/scan', 10); cp = n.create_publisher(PointCloud2, '/camera/depth/points', 10)
    tfb, stb = TransformBroadcaster(n), StaticTransformBroadcaster(n)
    def tf(p, c, xyz, q=(0.0, 0.0, 0.0, 1.0)):
        t = TransformStamped(); t.header.stamp = n.get_clock().now().to_msg(); t.header.frame_id, t.child_frame_id = p, c
        t.transform.translation.x, t.transform.translation.y, t.transform.translation.z = map(float, xyz)
        t.transform.rotation.x, t.transform.rotation.y, t.transform.rotation.z, t.transform.rotation.w = q; return t
    stb.sendTransform([tf('base_footprint', 'base_link', (0, 0, BZ)), tf('base_link', 'camera_link', CAM),
                       tf('camera_link', 'camera_depth_optical_frame', (0, 0, 0), (-0.5, 0.5, -0.5, 0.5)),
                       tf('base_link', 'lidar_link', (0, 0, 0.2665))])
    grid = lambda x0, x1, y0, y1, z0, z1, s=0.02: [(x0 + i * s, y0 + j * s, z0 + k * s) for i in range(int(round((x1 - x0) / s)) + 1)
                                                    for j in range(int(round((y1 - y0) / s)) + 1) for k in range(int(round((z1 - z0) / s)) + 1)]
    box = grid(BOX_X, BOX_X + 0.04, -0.10, 0.10, 0.0, 0.12)
    wall = grid(BOX_X + 2.5, BOX_X + 2.5, -1.0, 1.0, 0.30, 1.0, 0.05) if a.wall == 'yes' else []
    last_cloud = [0.0]
    def publish():
        tfb.sendTransform(tf('odom', 'base_footprint', (S['x'], 0, 0)))
        now = time.time()
        if now - last_cloud[0] < 0.058:          # ~17 Hz, the measured rate
            return
        last_cloud[0] = now
        s = LaserScan(); s.header.stamp = n.get_clock().now().to_msg(); s.header.frame_id = 'lidar_link'
        s.angle_min, s.angle_max, s.angle_increment, s.range_min, s.range_max = -math.pi, math.pi, math.radians(1), 0.15, 12.0
        s.ranges = [math.inf] * 360; sp.publish(s)
        o = (S['x'] + CAM[0], 0.0, BZ + CAM[2])
        pts = [p for p in (box if S['box'] else []) + wall if math.dist(p, o) >= 0.6]
        c = PointCloud2(); c.header.stamp = s.header.stamp; c.header.frame_id = 'camera_depth_optical_frame'
        c.height, c.width = 1, len(pts); c.fields = [PointField(name=k, offset=4 * i, datatype=7, count=1) for i, k in enumerate('xyz')]
        c.point_step, c.row_step, c.is_dense = 12, 12 * len(pts), True
        c.data = b''.join(struct.pack('<fff', -(y - o[1]), -(z - o[2]), x - o[0]) for x, y, z in pts); cp.publish(c)
    def lethal_outline(x):
        g = S['g']
        if g is None: return False
        ox, oy, res, W, H = g.info.origin.position.x, g.info.origin.position.y, g.info.resolution, g.info.width, g.info.height
        pts = [(x + px, py) for px, py in FP]
        for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
            m = int(math.hypot(bx - ax, by - ay) / (res * 0.5)) + 1
            for k in range(m + 1):
                u = k / m; i = int((ax + u * (bx - ax) - ox) / res); j = int((ay + u * (by - ay) - oy) / res)
                if 0 <= i < W and 0 <= j < H and g.data[j * W + i] == 100: return True
        return False
    def imminent(T, v=0.2):
        if lethal_outline(S['x']): return True
        pt = 0.05 / v; i, d = 1, 0.0
        while i * pt < T:
            i += 1; d += pt * v
            if d > 0.8: break
            if lethal_outline(S['x'] + d): return True
        return False
    def box_marked():
        g = S['g']
        if g is None: return False
        res = g.info.resolution; i0 = int((BOX_X + 0.02 - g.info.origin.position.x) / res); j0 = int(-g.info.origin.position.y / res)
        return any(g.data[j * g.info.width + i] == 100 for i in range(i0 - 1, i0 + 2) for j in range(j0 - 2, j0 + 3)
                   if 0 <= i < g.info.width and 0 <= j < g.info.height)
    def spin(sec):
        e = time.time() + sec
        while time.time() < e: publish(); rclpy.spin_once(n, timeout_sec=0.005)
    clear_cli = n.create_client(ClearEntireCostmap, '/costmap/clear_entirely_costmap')
    def clear():
        f = clear_cli.call_async(ClearEntireCostmap.Request()); rclpy.spin_until_future_complete(n, f, timeout_sec=5)
    results = []
    try:
        cli = n.create_client(ChangeState, '/costmap/costmap/change_state'); cli.wait_for_service(timeout_sec=30)
        for tid in (1, 3):
            r = ChangeState.Request(); r.transition.id = tid; f = cli.call_async(r); rclpy.spin_until_future_complete(n, f, timeout_sec=20)
        clear_cli.wait_for_service(timeout_sec=10)
        spin(2.0)
        for T in a.T:
            for delay in a.delay:
                for appear in a.appear:
                    S['x'], S['box'] = 0.0, appear == 'none'
                    clear(); spin(1.0)
                    # state: commanded (controller), smoothed, actual (delayed)
                    v_cmd, v_s, hist, t, dt = 0.2, 0.0, [], 0.0, 0.05
                    detect = zero_at = None; t_ctrl = 0.0; hit = False
                    while t < 30.0:
                        gap = BOX_X - (S['x'] + 0.4011)
                        if not S['box'] and appear != 'none' and gap <= float(appear):
                            S['box'] = True; t_app = t
                        if t >= t_ctrl:                                  # controller cycle, 10 Hz
                            t_ctrl += 0.1
                            if imminent(T):
                                if detect is None: detect = (t, gap)
                                v_cmd = 0.0
                            elif detect is None:
                                v_cmd = 0.2
                        v_s = min(v_s + 0.5 * dt, v_cmd) if v_cmd > v_s else max(v_s - 0.5 * dt, v_cmd)
                        hist.append(v_s)
                        v_act = hist[-1 - int(round(delay / dt))] if len(hist) > int(round(delay / dt)) else 0.0
                        S['x'] += v_act * dt
                        if gap <= 0.0: hit = True; break
                        if detect and v_act == 0.0 and v_s == 0.0: break
                        spin(dt); t += dt
                    res = dict(T=T, delay=delay, appear=appear, wall=a.wall, hit=hit,
                               detected_at_gap=round(detect[1], 3) if detect else None,
                               stopped_gap=None if hit else round(BOX_X - (S['x'] + 0.4011), 3),
                               camera_box_m=None if hit else round(BOX_X - (S['x'] + CAM[0]), 3))
                    if not hit and detect:
                        spin(1.0); res['marked_while_stopped'] = box_marked()
                        # BT recovery clears: until the next costmap update the controller sees nothing
                        creep0 = S['x']
                        for _ in range(a.clears):
                            clear(); t0 = time.time(); v_s2 = 0.0
                            while time.time() - t0 < 0.4:
                                go = not imminent(T)
                                v_s2 = min(v_s2 + 0.5 * 0.02, 0.2) if go else max(v_s2 - 0.5 * 0.02, 0.0)
                                S['x'] += v_s2 * 0.02; spin(0.02)
                            spin(0.3)
                        res['creep_after_clears_m'] = round(S['x'] - creep0, 3)
                        res['camera_box_after_clears_m'] = round(BOX_X - (S['x'] + CAM[0]), 3)
                        res['still_blocked'] = imminent(T)
                    results.append(res); print(json.dumps(res), flush=True)
    finally:
        os.killpg(node.pid, signal.SIGINT); node.wait(10); n.destroy_node(); rclpy.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main())
