#!/usr/bin/env python3
"""Offline check that the behaviour tree never leaves two motion sources running
(robot/docs/nav2-baseline-v3.md). Real Nav2 stack + fakebot2 in domain 86, like run.sh.

FollowPath is forced to time out on its goal acknowledgement (server_timeout in a temporary
copy of the tree), which is what CPU load did on the robot on 14/11. One NavigateToPose goal
(START -> POI_01) runs for --duration s, then is cancelled. Counted on /robot_01/cmd_vel_ctrl:
"overlap" = the controller (v > 0.02) and the Spin behaviour (v = 0, |w| > 0.1) alternating
within 0.15 s at least 6 times in 2 s (one publisher cannot do that).

  bt_orphan_check.py --params nav2_params_v2.yaml|v3 [--force-ms 1] [--duration 90]
"""
import argparse, json, os, re, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'ros2_ws', 'src', 'robot_control', 'config'))
TREES = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'ros2_ws', 'src', 'robot_navigation', 'behavior_trees'))
SETUP = ('unset ROS_DISCOVERY_SERVER ROS_SUPER_CLIENT FASTRTPS_DEFAULT_PROFILES_FILE; '
         'export RMW_IMPLEMENTATION=rmw_fastrtps_cpp ROS_DOMAIN_ID=86 ROS_LOCALHOST_ONLY=1; set +u; '
         'source /opt/ros/humble/setup.bash; source $HOME/smart-campus-tour/robot/ros2_ws/install/setup.bash; '
         '[ -f $HOME/.cache/armtc/smoothws/install/setup.bash ] && source $HOME/.cache/armtc/smoothws/install/setup.bash; ')


def prepare(params, force_ms, tmp):
    import yaml
    src = params if os.path.isabs(params) else os.path.join(CFG, params)
    text = open(src).read()
    d = yaml.safe_load(text)
    bt = d['bt_navigator']['ros__parameters']
    tree_name = os.path.basename(bt['default_nav_to_pose_bt_xml'])
    tree = open(os.path.join(TREES, tree_name)).read()
    if force_ms:
        tree, n = re.subn(r'<FollowPath path="\{path\}" controller_id="FollowPath"/>',
                          f'<FollowPath path="{{path}}" controller_id="FollowPath" server_timeout="{force_ms}"/>', tree)
        assert n == 1
    tpath = os.path.join(tmp, tree_name)
    open(tpath, 'w').write(tree)
    text = text.replace(bt['default_nav_to_pose_bt_xml'], tpath)
    # the through-poses tree is loaded at startup too; point it at this checkout's file
    other = os.path.basename(bt['default_nav_through_poses_bt_xml'])
    text = text.replace(bt['default_nav_through_poses_bt_xml'], os.path.join(TREES, other))
    ppath = os.path.join(tmp, 'params.yaml')
    open(ppath, 'w').write(text)
    return ppath, tree_name, bt['default_server_timeout']


def monitor(duration, out):
    import math, rclpy
    from rclpy.action import ActionClient
    from geometry_msgs.msg import Twist
    from rcl_interfaces.msg import Log
    from nav2_msgs.action import NavigateToPose
    rclpy.init(); n = rclpy.create_node('bt_orphan_monitor')
    cmds, logs = [], []
    n.create_subscription(Twist, '/robot_01/cmd_vel_ctrl', lambda m: cmds.append((time.time(), m.linear.x, m.angular.z)), 50)
    n.create_subscription(Log, '/rosout', lambda m: logs.append((m.stamp.sec + m.stamp.nanosec * 1e-9, m.name, m.msg)), 200)
    c = ActionClient(n, NavigateToPose, '/robot_01/navigate_to_pose')
    if not c.wait_for_server(timeout_sec=90):
        return dict(error='no nav2')
    t = time.time() + 5
    while time.time() < t: rclpy.spin_once(n, timeout_sec=0.1)
    g = NavigateToPose.Goal(); g.pose.header.frame_id = 'map'
    g.pose.pose.position.x, g.pose.pose.position.y = 7.76, 7.75
    g.pose.pose.orientation.z, g.pose.pose.orientation.w = math.sin(-0.685), math.cos(-0.685)
    f = c.send_goal_async(g); rclpy.spin_until_future_complete(n, f, timeout_sec=10)
    h = f.result(); t0 = time.time(); rf = h.get_result_async() if h and h.accepted else None
    while time.time() - t0 < duration and not (rf and rf.done()):
        rclpy.spin_once(n, timeout_sec=0.05)
    status = rf.result().status if rf and rf.done() else None
    if rf and not rf.done():
        cf = h.cancel_goal_async(); rclpy.spin_until_future_complete(n, cf, timeout_sec=10)
    t = time.time() + 3
    while time.time() < t: rclpy.spin_once(n, timeout_sec=0.05)
    kind = lambda v, w: 'C' if v > 0.02 else ('S' if abs(v) <= 0.001 and abs(w) > 0.1 else '-')
    flips = [cmds[i][0] - t0 for i in range(1, len(cmds))
             if {kind(*cmds[i - 1][1:]), kind(*cmds[i][1:])} == {'C', 'S'} and cmds[i][0] - cmds[i - 1][0] < 0.15]
    episodes = []
    for f_ in flips:
        if episodes and f_ - episodes[-1][-1] < 2.0: episodes[-1].append(f_)
        else: episodes.append([f_])
    episodes = [e for e in episodes if len(e) >= 6]
    count = lambda pat: sum(1 for _, _, m in logs if pat in m)
    # controller commands (v > 0.02) while a Spin runs, by the behaviour server's own log stamps
    spins, start = [], None
    for t, nm, m in sorted(logs):
        if 'Running spin' in m: start = t
        elif start is not None and ('spin completed' in m or 'spin failed' in m or 'Aborting handle' in m and 'spin' in m):
            spins.append((start, t)); start = None
    during = [c for c in cmds if c[1] > 0.02 and any(a <= c[0] <= b for a, b in spins)]
    res = dict(nav_status=status, cmd_msgs=len(cmds), overlap_episodes=len(episodes),
               overlap_s=round(sum(e[-1] - e[0] for e in episodes), 1),
               overlap_at=[round(e[0], 1) for e in episodes],
               controller_cmds_during_spin=len(during),
               last_controller_cmd_after_spin_start_s=round(max((c[0] - a for c in during for a, b in spins
                                                                if a <= c[0] <= b), default=0.0), 3),
               followpath_ack_timeouts=sum(1 for _, nm, m in logs if 'Timed out while waiting' in m and 'follow_path' in m),
               spin_runs=count('Running spin'), controller_goals=count('Received a goal, begin computing'),
               cancel_failures=count('Failed to cancel'), goal_succeeded=count('Goal succeeded'))
    json.dump(dict(res, logs=[(round(t - t0, 2), nm, m) for t, nm, m in logs if t >= t0]), open(out, 'w'), indent=0)
    n.destroy_node(); rclpy.shutdown()
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--params', required=True)
    ap.add_argument('--force-ms', type=int, default=1, help='FollowPath server_timeout in the temp tree; 0 = unchanged')
    ap.add_argument('--duration', type=float, default=90)
    ap.add_argument('--child', help=argparse.SUPPRESS)
    a = ap.parse_args()
    if a.child:
        print(json.dumps(monitor(a.duration, a.child)))
        return 0
    tmp = tempfile.mkdtemp(prefix='bt_orphan_')
    ppath, tree, timeout = prepare(a.params, a.force_ms, tmp)
    env = dict(os.environ, NAVSIM_PARAMS=ppath, NAVSIM_OUT=os.path.join(tmp, 'bot.npy'), NAVSIM_START='-0.49,-0.41,-5',
               NAVSIM_SEED='1', NAVSIM_AR='0.7', NAVSIM_NOISE='0.015,0.6', ROS_LOG_DIR=os.path.join(tmp, 'roslog'))
    sh = lambda cmd, log: subprocess.Popen(['bash', '-c', SETUP + 'exec nice -n 10 ' + cmd], env=env, start_new_session=True,
                                           stdout=open(os.path.join(tmp, log), 'w'), stderr=subprocess.STDOUT)
    procs = [sh(f'python3 {HERE}/fakebot2.py', 'fakebot.log')]
    time.sleep(2)
    procs.append(sh(f'ros2 launch {HERE}/sim.launch.py', 'nav.log'))
    try:
        r = subprocess.run(['bash', '-c', SETUP + f'exec python3 {os.path.abspath(__file__)} --params x --duration {a.duration} '
                            f'--child {tmp}/result.json'], env=env, capture_output=True, text=True, timeout=a.duration + 200)
        res = json.loads(r.stdout.strip().splitlines()[-1]) if r.stdout.strip() else dict(error=r.stderr[-800:])
    finally:
        for p in procs:
            try: os.killpg(p.pid, signal.SIGINT)
            except ProcessLookupError: pass
        time.sleep(5)
        for p in procs:
            try: os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError: pass
    print(json.dumps(dict(params=os.path.basename(a.params), tree=tree, default_server_timeout=timeout,
                          forced_followpath_timeout_ms=a.force_ms, **res, dir=tmp)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
