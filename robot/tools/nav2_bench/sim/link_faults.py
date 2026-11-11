#!/usr/bin/env python3
"""Nav2-in-the-loop STM32 link faults: real Nav2, EKF, mode_manager and bridge.

Only the plant is simulated: a pty firmware emulator (CMD/STOP with the 300 ms
watchdog, FB with step counts and yaw) driving the fakebot2 kinematics and scan.
map->odom is fixed, so an EKF that invents motion shows up as a pose error.

    tools/nav2_bench/sim/link_faults.sh            # guards on
    tools/nav2_bench/sim/link_faults.sh --no-guards   # EKF pause and latch off

Runs on domain 86, localhost only. Opens no device and sends nothing to a robot.
"""
import json
import math
import os
import pty
import signal
import subprocess
import sys
import threading
import time
import tty

os.environ.setdefault('NAVSIM_START', '-0.319,-0.535,5.3')
os.environ.setdefault('NAVSIM_OUT', '/dev/null')
os.environ['NAVSIM_CMD_TOPIC'] = '/robot_01/unused_cmd'

import rclpy  # noqa: E402
from action_msgs.msg import GoalStatus  # noqa: E402
from geometry_msgs.msg import PoseStamped  # noqa: E402
from nav2_msgs.action import NavigateToPose  # noqa: E402
from rclpy.action import ActionClient  # noqa: E402
from rclpy.executors import MultiThreadedExecutor  # noqa: E402
from std_msgs.msg import Bool  # noqa: E402
from tf2_msgs.msg import TFMessage  # noqa: E402

from fakebot2 import FakeBot, compose, inverse  # noqa: E402

WHEEL_BASE, STEPS_PER_M = 0.4714, 26184.875
GOAL_A = (7.76, 7.75, -1.370)
GOAL_B = (-0.319, -0.535, 0.077)


class Plant(FakeBot):
    """Firmware over a pty plus the wheel kinematics; the EKF supplies odom TF."""

    def __init__(self, link):
        super().__init__()
        self.link_path = link
        self.left_mm_s = self.right_mm_s = 0.0
        self.last_cmd = 0.0
        self.left = self.right = 0.0
        self.boot_yaw = 0.0
        self.seq = 0
        self.last_fb_ms = int(self.now() * 1000.0)
        self.fb_on = True
        self.lock = threading.Lock()
        self.frames = []
        self.odom_pose = None
        self.map_odom = tuple(float(v) for v in (*os.environ['NAVSIM_START'].split(','),))
        self.map_odom = (self.map_odom[0], self.map_odom[1], math.radians(self.map_odom[2]))
        self.open_pty()
        self.create_subscription(TFMessage, '/tf', self.on_tf, 100)
        self.create_timer(0.02, self.fb)

    def open_pty(self):
        self.master, self.slave = pty.openpty()
        tty.setraw(self.master)
        tty.setraw(self.slave)
        os.set_blocking(self.master, False)
        if os.path.lexists(self.link_path):
            os.unlink(self.link_path)
        os.symlink(os.ttyname(self.slave), self.link_path)
        self.buf = b''

    def reboot(self, silent_s):
        """USB re-enumeration, counts and BNO085 zero restart, silent during boot."""
        with self.lock:
            master, slave, self.master = self.master, self.slave, None
        os.close(slave)
        os.close(master)
        os.unlink(self.link_path)
        self.left_mm_s = self.right_mm_s = 0.0
        time.sleep(silent_s)
        with self.lock:
            self.left = self.right = 0.0
            self.boot_yaw = self.pose[2] - math.radians(20.0)
            self.open_pty()

    def on_tf(self, msg):
        for tr in msg.transforms:
            if tr.child_frame_id == 'base_footprint' and tr.header.frame_id == 'odom':
                q = tr.transform.rotation
                self.odom_pose = (tr.transform.translation.x, tr.transform.translation.y,
                                  math.atan2(2 * q.w * q.z, 1 - 2 * q.z * q.z))

    def pub_map_odom(self):
        self.tf.publish(TFMessage(transforms=[self.tfm('map', 'odom', self.map_odom)]))

    def believed_error(self):
        if self.odom_pose is None:
            return None
        b = compose(self.map_odom, self.odom_pose)
        return math.hypot(b[0] - self.pose[0], b[1] - self.pose[1])

    def step(self):
        t = self.now()
        dt = t - self.t_last
        self.t_last = t
        with self.lock:
            if t - self.last_cmd > 0.3:
                self.left_mm_s = self.right_mm_s = 0.0
            left, right = self.left_mm_s / 1000.0, self.right_mm_s / 1000.0
            self.left += left * dt * STEPS_PER_M
            self.right += right * dt * STEPS_PER_M
        # The bridge inverts both wheel commands for the real drivetrain.
        v, w = -(left + right) / 2.0, (left - right) / WHEEL_BASE
        x, y, th = self.pose
        self.pose = [x + v * dt * math.cos(th + w * dt / 2), y + v * dt * math.sin(th + w * dt / 2), th + w * dt]
        self.speed = v

    def fb(self):
        with self.lock:
            master = self.master
            if master is None:
                return
            try:
                self.buf += os.read(master, 4096)
            except (BlockingIOError, OSError):
                pass
            while b'\n' in self.buf:
                line, self.buf = self.buf.split(b'\n', 1)
                self.on_line(line.strip().decode(errors='replace'))
            if self.fb_on:
                self.seq += 1
                yaw = math.degrees(math.atan2(math.sin(self.pose[2] - self.boot_yaw), math.cos(self.pose[2] - self.boot_yaw)))
                try:
                    t_ms = int(self.now() * 1000.0)
                    dt_ms, self.last_fb_ms = t_ms - self.last_fb_ms, t_ms
                    os.write(master, (f'FB,{self.seq},{int(self.left)},{int(self.right)},{dt_ms},OK,{int(yaw * 100)},1\r\n').encode())
                except (BlockingIOError, OSError):
                    pass

    def on_line(self, line):
        parts = line.split(',')
        self.frames.append((time.monotonic(), parts[0]))
        if parts[0] == 'CMD' and len(parts) == 4:
            self.left_mm_s, self.right_mm_s = float(parts[2]), float(parts[3])
            self.last_cmd = self.now()
        elif parts[0] == 'STOP':
            self.left_mm_s = self.right_mm_s = 0.0
            self.last_cmd = self.now()

    def dump(self):
        pass


class Run:
    def __init__(self, plant, guards, log_dir):
        self.plant, self.guards, self.log_dir = plant, guards, log_dir
        self.bridge = None
        self.client = ActionClient(plant, NavigateToPose, '/robot_01/navigate_to_pose')
        self.goal = None
        self.status = None
        self.link_ok = []
        plant.create_subscription(Bool, '/robot_01/stm32_link_ok', lambda m: self.link_ok.append(m.data), 10)

    def start_bridge(self):
        args = [sys.executable, '-c', 'from stm32_bridge.stm32_bridge_node import main; main()',
                '--ros-args', '-r', '__ns:=/robot_01', '-p', f'port:={self.plant.link_path}',
                '-p', 'enable_head:=false', '-p', 'enable_contactor:=false', '-p', 'publish_tf:=false',
                '-p', 'odom_invert_left:=true', '-p', 'odom_invert_right:=true']
        if not self.guards:
            args += ['-p', 'ekf_toggle_service:=""', '-p', 'feedback_timeout:=1.0']
        self.bridge = subprocess.Popen(args, stdout=open(os.path.join(self.log_dir, 'bridge.log'), 'a'),
                                       stderr=subprocess.STDOUT)

    def send(self):
        # The farther end, so a scenario never arrives while being observed.
        x, y, yaw = max((GOAL_A, GOAL_B), key=lambda g: math.hypot(
            g[0] - self.plant.pose[0], g[1] - self.plant.pose[1]))
        goal = NavigateToPose.Goal()
        p = PoseStamped()
        p.header.frame_id = 'map'
        p.pose.position.x, p.pose.position.y = x, y
        p.pose.orientation.z, p.pose.orientation.w = math.sin(yaw / 2), math.cos(yaw / 2)
        goal.pose = p
        self.status = 'sending'
        future = self.client.send_goal_async(goal)
        while not future.done():
            time.sleep(0.02)
        self.goal = future.result()
        if not self.goal.accepted:
            self.status = 'rejected'
            return False
        self.status = 'active'

        def done(result):
            self.status = {GoalStatus.STATUS_SUCCEEDED: 'SUCCEEDED', GoalStatus.STATUS_CANCELED: 'CANCELED',
                           GoalStatus.STATUS_ABORTED: 'ABORTED'}.get(result.result().status, 'OTHER')

        self.goal.get_result_async().add_done_callback(done)
        return True

    def drive_until_moving(self, seconds=12.0):
        """Send a goal, then wait until it is cruising."""
        if not self.send():
            return False
        t0 = time.monotonic()
        while time.monotonic() - t0 < 60.0:
            if abs(getattr(self.plant, 'speed', 0.0)) > 0.15 and time.monotonic() - t0 > seconds:
                return True
            if self.status != 'active':
                return False
            time.sleep(0.05)
        return False

    def cancel(self):
        if self.status == 'active':
            future = self.goal.cancel_goal_async()
            while not future.done():
                time.sleep(0.02)
            while self.status == 'active':
                time.sleep(0.05)
        time.sleep(1.5)

    def travelled(self, seconds):
        start = list(self.plant.pose)
        peak = 0.0
        t0 = time.monotonic()
        while time.monotonic() - t0 < seconds:
            peak = max(peak, abs(getattr(self.plant, 'speed', 0.0)))
            time.sleep(0.02)
        return math.hypot(self.plant.pose[0] - start[0], self.plant.pose[1] - start[1]), peak

    def wait_terminal(self, seconds):
        t0 = time.monotonic()
        while self.status == 'active' and time.monotonic() - t0 < seconds:
            time.sleep(0.05)
        return self.status

    def frames(self, start, end):
        names = [n for t, n in self.plant.frames if start <= t < end]
        return {'CMD': names.count('CMD'), 'STOP': names.count('STOP')}

    def recover_new_goal(self):
        """Motion must be possible again with a new goal."""
        if self.status == 'active':
            self.cancel()
        time.sleep(3.0)
        heading = self.plant.pose[2]
        self.send()
        dist, peak = self.travelled(12.0)      # a new leg may start with an in-place turn
        turned = abs(self.plant.pose[2] - heading)
        self.cancel()
        return (dist > 0.2 or turned > 0.3) and peak > 0.0, round(dist, 3), round(turned, 3)

    def gap(self, name, seconds):
        self.plant.fb_on = True
        moving = self.drive_until_moving()
        err0 = self.plant.believed_error()
        t0 = time.monotonic()
        self.plant.fb_on = False
        time.sleep(seconds)
        self.plant.fb_on = True
        t1 = time.monotonic()
        peak_err = max(self.plant.believed_error() or 0.0, err0 or 0.0)
        status_at_return = self.status
        after, peak = self.travelled(20.0)
        err1 = self.plant.believed_error()
        cmd_gap = self.frames(t0 + 0.5, t1)
        record = {'moving_before': moving, 'gap_s': seconds, 'cmd_during_gap': cmd_gap,
                  'goal_at_return': status_at_return, 'goal_20s_later': self.status,
                  'moved_20s_after_return_m': round(after, 3), 'peak_speed': round(peak, 3),
                  'pose_error_before': round(err0 or 0.0, 3), 'pose_error_after': round(err1 or 0.0, 3)}
        return name, record

    def reboot(self, silent_s=2.0):
        moving = self.drive_until_moving()
        err0 = self.plant.believed_error()
        self.plant.reboot(silent_s)
        after, peak = self.travelled(20.0)
        return 'mcu_reboot', {'moving_before': moving, 'goal_20s_later': self.status,
                              'moved_after_m': round(after, 3), 'peak_speed': round(peak, 3),
                              'pose_error_before': round(err0 or 0.0, 3),
                              'pose_error_after': round(self.plant.believed_error() or 0.0, 3)}

    def bridge_crash(self):
        moving = self.drive_until_moving()
        self.bridge.kill()
        self.bridge.wait()
        time.sleep(1.5)
        self.start_bridge()
        after, peak = self.travelled(20.0)
        return 'bridge_crash', {'moving_before': moving, 'goal_20s_later': self.status,
                                'moved_after_m': round(after, 3), 'peak_speed': round(peak, 3)}


def main():
    guards = '--no-guards' not in sys.argv
    out = os.environ['LINK_FAULTS_OUT']
    env = os.environ
    procs = []

    def spawn(args, name):
        procs.append(subprocess.Popen(args, env=env, stdout=open(os.path.join(out, name + '.log'), 'w'),
                                      stderr=subprocess.STDOUT, start_new_session=True))

    rclpy.init()
    plant = Plant(os.path.join(out, 'ttyFAKE'))
    run = Run(plant, guards, out)
    executor = MultiThreadedExecutor(num_threads=4)
    executor.add_node(plant)
    threading.Thread(target=executor.spin, daemon=True).start()
    ekf_yaml = env['LINK_FAULTS_SRC'] + '/robot_control/config/ekf.yaml'
    spawn(['/opt/ros/humble/lib/robot_localization/ekf_node', '--ros-args', '-r', '__ns:=/robot_01',
           '-r', '__node:=ekf_filter_node', '-r', 'odometry/filtered:=odom', '--params-file', ekf_yaml], 'ekf')
    spawn([sys.executable, '-c', 'from robot_control.mode_manager_node import main; main()', '--ros-args',
           '-r', '__ns:=/robot_01', '-p', 'initial_mode:=explore',
           '-p', f'require_stm32_link:={"true" if guards else "false"}'], 'mode_manager')
    run.start_bridge()
    spawn(['ros2', 'launch', env['LINK_FAULTS_SIM'] + '/sim.launch.py'], 'nav2')
    results = {}
    try:
        print('waiting for Nav2 ...', flush=True)
        if not run.client.wait_for_server(timeout_sec=120.0):
            raise RuntimeError('navigate_to_pose never came up')
        time.sleep(8.0)
        for action in (lambda: run.gap('gap_0.2s', 0.2), lambda: run.gap('gap_3s', 3.0), run.reboot, run.bridge_crash):
            name, record = action()
            if name == 'gap_0.2s':
                run.cancel()
            else:
                record['new_goal_moves'] = run.recover_new_goal()
            results[name] = record
            print(name, json.dumps(record), flush=True)
    finally:
        with open(os.path.join(out, 'result.json'), 'w') as f:
            json.dump({'guards': guards, 'results': results}, f, indent=1)
        run.bridge.send_signal(signal.SIGINT)
        for p in procs:
            try:
                os.killpg(p.pid, signal.SIGINT)
            except ProcessLookupError:
                pass
        time.sleep(4.0)
        for p in procs + [run.bridge]:
            try:
                os.killpg(p.pid, signal.SIGKILL) if p is not run.bridge else p.kill()
            except ProcessLookupError:
                pass
        os._exit(0)


if __name__ == '__main__':
    main()
