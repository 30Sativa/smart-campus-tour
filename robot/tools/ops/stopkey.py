#!/usr/bin/env python3
"""Pre-connected software stop for supervised tests. Keep it open in its own terminal.

    Enter      -> mode_manager emergency_stop=true (cmd_vel forced to zero every cycle,
                  overriding Nav2 and teleop) AND cancel every NavigateToPose goal, in parallel,
                  then CONFIRM: the service said success, emergency_stop_state is true and
                  every cmd_vel in the next 0.5 s is zero. Anything less is NOT CONFIRMED.
    r + Enter  -> release the software stop (asks "yes"; cancelled goals stay cancelled)
    q + Enter  -> quit without changing anything

    stopkey.py [namespace=/robot_01]

This is a SOFTWARE stop. It does not cut motor power: the STM32 still powers the
drivers and a fault below mode_manager (bridge, firmware) is not covered. The
hardware E-stop is the physical button. Release order and the
hardware E-stop rule: robot/docs/test-readiness-2026-11-10.md §4.1. Moved into the repo
from ~/.cache/armtc/analysis/stopkey.py (same behaviour).
"""
import sys
import threading
import time

import rclpy
from action_msgs.srv import CancelGoal
from geometry_msgs.msg import Twist
from rclpy.executors import SingleThreadedExecutor
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from std_msgs.msg import Bool
from std_srvs.srv import SetBool

CONFIRM_WINDOW_S = 0.5
MIN_CMD_MESSAGES = 3          # mode_manager publishes cmd_vel at 20 Hz


class Watch:
    """Latest emergency_stop_state and the cmd_vel messages seen since mark()."""

    def __init__(self, node, ns):
        self.lock = threading.Lock()
        self.estop_state = None
        self.since = None
        self.cmds = []
        latched = QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE,
                             durability=DurabilityPolicy.TRANSIENT_LOCAL)
        node.create_subscription(Bool, ns + '/emergency_stop_state', self._state, latched)
        node.create_subscription(Twist, ns + '/cmd_vel', self._cmd, 10)

    def _state(self, msg):
        with self.lock:
            self.estop_state = msg.data

    def _cmd(self, msg):
        with self.lock:
            if self.since is not None and time.time() >= self.since:
                self.cmds.append(max(abs(msg.linear.x), abs(msg.linear.y), abs(msg.angular.z)))

    def mark(self, start):
        with self.lock:
            self.since, self.cmds = start, []

    def snapshot(self):
        with self.lock:
            return self.estop_state, list(self.cmds)


def confirm_stop(watch, estop_result):
    """Returns (confirmed, reason). Waits CONFIRM_WINDOW_S of cmd_vel after the reply."""
    if estop_result is None or not getattr(estop_result, 'success', False):
        return False, 'emergency_stop service did not answer success'
    watch.mark(time.time())
    time.sleep(CONFIRM_WINDOW_S)
    state, cmds = watch.snapshot()
    if state is not True:
        return False, f'emergency_stop_state is {state!r}, not true'
    if len(cmds) < MIN_CMD_MESSAGES:
        return False, f'only {len(cmds)} cmd_vel message(s) in {CONFIRM_WINDOW_S} s; cannot see the output'
    if max(cmds) > 0.0:
        return False, f'cmd_vel not zero (max {max(cmds):.3f})'
    return True, f'cmd_vel = 0 in {len(cmds)} messages over {CONFIRM_WINDOW_S} s, emergency_stop_state = true'


def call(client, request, label, timeout=3.0, out=None):
    t0 = time.time()
    future = client.call_async(request)
    while not future.done() and time.time() - t0 < timeout:
        time.sleep(0.005)
    result = future.result() if future.done() else None
    print(f'  {label}: {"no reply in %.0f s!" % timeout if result is None else result} '
          f'({(time.time() - t0) * 1e3:.0f} ms)', flush=True)
    if out is not None:
        out.append(result)
    return result


def main(argv):
    ns = argv[1] if len(argv) > 1 else '/robot_01'
    rclpy.init()
    node = rclpy.create_node('stop_key')
    estop = node.create_client(SetBool, ns + '/emergency_stop')
    cancel = node.create_client(CancelGoal, ns + '/navigate_to_pose/_action/cancel_goal')
    watch = Watch(node, ns)
    executor = SingleThreadedExecutor()
    executor.add_node(node)
    spinner = threading.Thread(target=executor.spin, daemon=True)
    spinner.start()
    for name, client in (('emergency_stop', estop), ('cancel_goal', cancel)):
        while not client.wait_for_service(timeout_sec=1.0):
            print(f'waiting for {ns}/{name} ...', flush=True)
    print('READY: Enter = SOFTWARE STOP (cmd_vel forced to 0 + cancel all goals), r = release, q = quit', flush=True)
    print('       This does NOT cut motor power. The hardware E-stop is the physical button.', flush=True)
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        cmd = line.strip().lower()
        if cmd == '':
            print(f'STOP at {time.strftime("%H:%M:%S")}', flush=True)
            replies = []
            threads = [threading.Thread(target=call, args=(estop, SetBool.Request(data=True), 'emergency_stop'),
                                        kwargs={'out': replies}),
                       threading.Thread(target=call, args=(cancel, CancelGoal.Request(), 'cancel all goals'))]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            ok, reason = confirm_stop(watch, replies[0] if replies else None)
            if ok:
                print(f'SOFTWARE STOP CONFIRMED: {reason}. Motor power is NOT cut.', flush=True)
            else:
                print(f'SOFTWARE STOP NOT CONFIRMED: {reason}. PRESS THE HARDWARE E-STOP.', flush=True)
        elif cmd == 'r':
            print('release emergency stop? type yes: ', end='', flush=True)
            if sys.stdin.readline().strip() == 'yes':
                call(estop, SetBool.Request(data=False), 'release')
        elif cmd == 'q':
            break
    executor.shutdown(timeout_sec=1.0)
    spinner.join(timeout=2.0)
    node.destroy_node()
    rclpy.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
