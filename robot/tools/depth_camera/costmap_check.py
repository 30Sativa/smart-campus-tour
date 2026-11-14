#!/usr/bin/env python3
"""Offline check of the depth layer in the real local costmap config (robot/docs/depth-camera.md).

Runs Humble's standalone nav2_costmap_2d with the local_costmap section of the Nav2 params,
feeds it synthetic TF, an empty LiDAR scan and synthetic depth clouds in the driver's optical
frame, and reads the published grid. No hardware, no Nav2 servers, nothing that moves.

Isolated: ROS_DOMAIN_ID 89, ROS_LOCALHOST_ONLY=1, no discovery server, nice 19.

  costmap_check.py [--params robot/ros2_ws/src/robot_control/config/nav2_params_v2.yaml] [--depth-layer voxel]

--depth-layer voxel swaps the depth layer for Humble's VoxelLayer (3D clearing) in the temporary
copy only, to compare; the params file is never written.

Exit 0 when every check holds. Some checks pin known LIMITATIONS (blind zone, stale marks):
they fail if a param change alters them, so the doc and the params cannot drift apart.
"""
import argparse, json, math, os, signal, struct, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
PARAMS = os.path.join(HERE, '..', '..', 'ros2_ws', 'src', 'robot_control', 'config', 'nav2_params_v2.yaml')
BASE_Z = 0.2068                         # base_footprint -> base_link (URDF)
CAM = (0.394, 0.0, 0.066)               # base_link -> camera_link (navigation.launch.py defaults)
LIDAR_Z = 0.266499969                   # base_link -> lidar_link (URDF): scan plane ~0.47 m above the floor


def child_env():
    env = {k: v for k, v in os.environ.items() if not k.startswith(('ROS_', 'AMENT', 'RMW_', 'FASTRTPS', 'FASTDDS'))}
    env.update(ROS_DOMAIN_ID='89', ROS_LOCALHOST_ONLY='1', RMW_IMPLEMENTATION='rmw_fastrtps_cpp')
    return env


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--params', default=PARAMS)
    ap.add_argument('--depth-layer', choices=('obstacle', 'voxel'), default='obstacle')
    ap.add_argument('--child', action='store_true', help=argparse.SUPPRESS)
    a = ap.parse_args()
    if not a.child:
        # re-exec inside a clean Humble environment on domain 89
        cmd = (f'source /opt/ros/humble/setup.bash && exec nice -n 19 {sys.executable} {os.path.abspath(__file__)} '
               f'--child --params {a.params} --depth-layer {a.depth_layer}')
        return subprocess.run(['bash', '-c', cmd], env=child_env()).returncode
    return run(a.params, a.depth_layer == 'voxel')


def run(params_path, voxel):
    import yaml
    import rclpy
    from geometry_msgs.msg import TransformStamped
    from lifecycle_msgs.srv import ChangeState
    from nav_msgs.msg import OccupancyGrid
    from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
    from sensor_msgs.msg import LaserScan, PointCloud2, PointField
    from tf2_ros import StaticTransformBroadcaster, TransformBroadcaster
    from nav2_msgs.srv import ClearEntireCostmap

    section = yaml.safe_load(open(params_path).read().replace('$(var robot_ns)', ''))
    local = section['local_costmap']['local_costmap']['ros__parameters']
    depth = local['depth_obstacle_layer']['pointcloud']
    if voxel:
        # 16 voxels x 0.08 m covers 0 .. 1.28 m, above max_obstacle_height
        local['depth_obstacle_layer'].update(plugin='nav2_costmap_2d::VoxelLayer', origin_z=0.0, z_resolution=0.08,
                                             z_voxels=16, mark_threshold=0, unknown_threshold=16, publish_voxel_map=False)
    tmp = tempfile.mkdtemp(prefix='depth_costmap_')
    pfile = os.path.join(tmp, 'costmap.yaml')
    yaml.safe_dump({'/**': {'ros__parameters': local}}, open(pfile, 'w'))
    log = open(os.path.join(tmp, 'costmap.log'), 'w')
    node_proc = subprocess.Popen(['ros2', 'run', 'nav2_costmap_2d', 'nav2_costmap_2d', '--ros-args', '--params-file', pfile],
                                 stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    rclpy.init()
    n = rclpy.create_node('depth_costmap_check')
    state = dict(rx=0.0, cloud=None, grids=0, grid=None)
    latched = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL, reliability=ReliabilityPolicy.RELIABLE)

    def on_grid(m):
        state['grids'] += 1
        state['grid'] = m
    n.create_subscription(OccupancyGrid, '/costmap/costmap', on_grid, latched)
    scan_pub = n.create_publisher(LaserScan, local['lidar_obstacle_layer']['scan']['topic'], 10)
    cloud_pub = n.create_publisher(PointCloud2, depth['topic'], 10)
    tfb, stb = TransformBroadcaster(n), StaticTransformBroadcaster(n)

    def tf(parent, child, xyz, q=(0.0, 0.0, 0.0, 1.0)):
        t = TransformStamped()
        t.header.stamp = n.get_clock().now().to_msg()
        t.header.frame_id, t.child_frame_id = parent, child
        t.transform.translation.x, t.transform.translation.y, t.transform.translation.z = xyz
        (t.transform.rotation.x, t.transform.rotation.y, t.transform.rotation.z, t.transform.rotation.w) = q
        return t
    # optical frame as the Astra driver publishes it: z forward, x right, y down
    stb.sendTransform([tf('base_footprint', 'base_link', (0.0, 0.0, BASE_Z)), tf('base_link', 'camera_link', CAM),
                       tf('camera_link', 'camera_depth_optical_frame', (0.0, 0.0, 0.0), (-0.5, 0.5, -0.5, 0.5)),
                       tf('base_link', 'lidar_link', (0.0, 0.0, LIDAR_Z))])

    def cam_origin():
        return (state['rx'] + CAM[0], CAM[1], BASE_Z + CAM[2])

    def tick():
        tfb.sendTransform(tf('odom', 'base_footprint', (state['rx'], 0.0, 0.0)))
        s = LaserScan()
        s.header.stamp, s.header.frame_id = n.get_clock().now().to_msg(), 'lidar_link'
        s.angle_min, s.angle_max, s.angle_increment = -math.pi, math.pi, math.radians(1.0)
        s.range_min, s.range_max = 0.15, 12.0
        s.ranges = [math.inf] * 360          # nothing at the LiDAR height (0.47 m): low obstacles are depth-only
        scan_pub.publish(s)
        if state['cloud'] is not None:
            ox, oy, oz = cam_origin()
            data = b''.join(struct.pack('<fff', -(y - oy), -(z - oz), x - ox) for x, y, z in state['cloud'])
            c = PointCloud2()
            c.header.stamp, c.header.frame_id = n.get_clock().now().to_msg(), 'camera_depth_optical_frame'
            c.height, c.width = 1, len(state['cloud'])
            c.fields = [PointField(name=k, offset=4 * i, datatype=PointField.FLOAT32, count=1) for i, k in enumerate('xyz')]
            c.point_step, c.row_step, c.is_bigendian, c.is_dense = 12, 12 * len(state['cloud']), False, False
            c.data = data
            cloud_pub.publish(c)
    n.create_timer(0.1, tick)

    def spin(sec):
        end = time.time() + sec
        while time.time() < end:
            rclpy.spin_once(n, timeout_sec=0.05)

    def marked(x, y):
        """Lethal anywhere in the 3x3 cells around (x, y): the rolling window snaps its origin to
        the resolution, so a point on a cell edge can land in either neighbour."""
        g = state['grid']
        if g is None:
            return None
        i0 = int(math.floor((x - g.info.origin.position.x) / g.info.resolution))
        j0 = int(math.floor((y - g.info.origin.position.y) / g.info.resolution))
        return any(g.data[j * g.info.width + i] == 100 for i in range(i0 - 1, i0 + 2) for j in range(j0 - 1, j0 + 2)
                   if 0 <= i < g.info.width and 0 <= j < g.info.height)

    def lethal_cells():
        g = state['grid']
        return sum(1 for v in g.data if v == 100) if g else None

    grid = lambda x0, x1, y0, y1, z0, z1, s=0.02: [(x0 + i * s, y0 + j * s, z0 + k * s)
                                                    for i in range(int(round((x1 - x0) / s)) + 1)
                                                    for j in range(int(round((y1 - y0) / s)) + 1)
                                                    for k in range(int(round((z1 - z0) / s)) + 1)]
    # world points in odom, z = height above the floor; the robot starts at the origin facing +x
    floor = grid(1.00, 1.45, -0.60, 0.60, 0.0, 0.0, 0.05)
    box = grid(1.20, 1.24, -0.10, 0.10, 0.0, 0.12)                    # 12 cm box
    flat = grid(1.00, 1.04, 0.45, 0.55, 0.0, 0.06)                     # 6 cm: a flat shoe, a cable cover
    person = grid(1.42, 1.46, -0.30, -0.20, 0.10, 1.00, 0.05)
    mid = [(1.30, 0.40, 1.00)]                                          # table top, under max_obstacle_height
    high = [(1.30, -0.50, 1.30)]                                        # above max_obstacle_height
    near = grid(0.82, 0.84, 0.25, 0.30, 0.15, 0.25)                    # 0.43 m from the camera: inside min range
    wall = grid(4.0, 4.0, -1.0, 1.0, 0.30, 1.00, 0.05)
    nans = [(math.nan, math.nan, math.nan)] * 50
    results = []

    def check(what, ok, detail=''):
        results.append(dict(check=what, ok=bool(ok), detail=detail))
        print(('PASS ' if ok else 'FAIL ') + what + (f'  [{detail}]' if detail else ''), flush=True)

    try:
        cli = n.create_client(ChangeState, '/costmap/costmap/change_state')
        if not cli.wait_for_service(timeout_sec=20):
            raise RuntimeError('costmap node did not come up; see ' + log.name)
        for tid in (1, 3):                                             # configure, activate
            req = ChangeState.Request()
            req.transition.id = tid
            f = cli.call_async(req)
            rclpy.spin_until_future_complete(n, f, timeout_sec=20)
        spin(3.0)
        g0 = state['grids']
        spin(3.0)
        check('camera off: costmap keeps updating from the LiDAR alone', state['grids'] - g0 >= 4,
              f'{state["grids"] - g0} grids in 3 s')
        check('camera off: nothing marked', lethal_cells() == 0, f'lethal cells {lethal_cells()}')

        state['cloud'] = floor + box + flat + person + mid + high + near + nans
        spin(3.0)
        cell = lambda pts: (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        check('12 cm box 0.83 m ahead of the camera is marked', marked(*cell(box)), f'marked {marked(*cell(box))}')
        check('floor (z < min_obstacle_height) is not marked', not marked(1.40, -0.55) and not marked(1.0, 0.0),
              f'marked {marked(1.40, -0.55)}, {marked(1.0, 0.0)}')
        check(f'LIMITATION: a 6 cm object is below min_obstacle_height {depth["min_obstacle_height"]} and is not marked',
              not marked(*cell(flat)), f'marked {marked(*cell(flat))}')
        check('person (legs to 1.0 m) is marked', marked(*cell(person)), f'marked {marked(*cell(person))}')
        check('table top at 1.0 m (<= max_obstacle_height) is marked', marked(*cell(mid)), f'marked {marked(*cell(mid))}')
        check(f'1.3 m overhang (> max_obstacle_height {depth["max_obstacle_height"]}) is not marked',
              not marked(*cell(high)), f'marked {marked(*cell(high))}')
        check(f'LIMITATION: an object 0.43 m from the camera (< obstacle_min_range {depth["obstacle_min_range"]}) is not marked',
              not marked(*cell(near)), f'marked {marked(*cell(near))}')
        check('NaN points are ignored (the node is still publishing)', node_proc.poll() is None and state['grid'] is not None)

        state['cloud'] = None                                             # camera dies
        g0 = state['grids']
        spin(3.0)
        check('camera stops: costmap keeps updating, node alive', state['grids'] - g0 >= 4 and node_proc.poll() is None,
              f'{state["grids"] - g0} grids in 3 s')
        check('camera stops: its last marks stay (no decay)', marked(*cell(box)) and marked(*cell(person)))

        state['cloud'] = floor + box + mid + nans                         # the person walks away, nothing behind
        spin(2.0)
        check('LIMITATION: person left, no return behind them (glossy floor only): the mark stays',
              marked(*cell(person)), f'marked {marked(*cell(person))}')
        state['cloud'] = floor + box + mid + wall + nans                  # a wall 4 m out gives clearing rays
        spin(2.0)
        # 2D raytrace clears the whole column; 3D rays to the wall only clear the voxels they cross
        check('person left, a wall behind them: ' + ('LIMITATION: low voxels stay' if voxel else 'the mark is cleared'),
              marked(*cell(person)) == voxel, f'marked {marked(*cell(person))}')

        def drive(to, cloud):
            state['cloud'] = cloud
            while abs(state['rx'] - to) > 1e-6:
                state['rx'] = round(state['rx'] + math.copysign(min(0.02, abs(to - state['rx'])), to - state['rx']), 4)
                spin(0.1)
            spin(2.0)
        bx = cell(box)
        drive(0.5, floor + box + nans)                                    # nothing visible behind the box
        check('box 0.33 m from the camera (blind zone), nothing behind: the mark is kept', marked(*bx),
              f'camera-box {bx[0] - cam_origin()[0]:.2f} m, marked {marked(*bx)}')
        clear = n.create_client(ClearEntireCostmap, '/costmap/clear_entirely_costmap')
        if clear.wait_for_service(timeout_sec=10):
            f = clear.call_async(ClearEntireCostmap.Request())
            rclpy.spin_until_future_complete(n, f, timeout_sec=10)
        spin(3.0)
        check('LIMITATION: a local-costmap clear (the BT recovery) erases it and the blind zone cannot restore it',
              not marked(*bx), f'marked {marked(*bx)}')
        drive(0.0, floor + box + nans)
        check('back at 0.83 m: the box is marked again', marked(*bx), f'marked {marked(*bx)}')
        drive(0.5, floor + box + wall + nans)                             # the usual scene: something behind it
        check('box in the blind zone with a wall behind: ' + ('kept (rays pass over it)' if voxel else
              'LIMITATION: rays over the box clear its cell, the mark is gone'),
              marked(*bx) == voxel, f'marked {marked(*bx)}')
    finally:
        try:
            os.killpg(node_proc.pid, signal.SIGINT)
            node_proc.wait(10)
        except (subprocess.TimeoutExpired, ProcessLookupError):
            os.killpg(node_proc.pid, signal.SIGKILL)
        n.destroy_node()
        rclpy.shutdown()
    ok = all(r['ok'] for r in results)
    print(json.dumps(dict(ok=ok, depth_layer='voxel' if voxel else 'obstacle', failed=[r['check'] for r in results if not r['ok']], log=log.name)))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
