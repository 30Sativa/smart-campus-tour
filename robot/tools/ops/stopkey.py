#!/usr/bin/env python3
"""Pre-connected software stop for supervised tests. Keep it open in its own terminal.

    Enter      -> mode_manager emergency_stop=true (cmd_vel forced to zero every cycle,
                  overriding Nav2 and teleop) AND cancel every NavigateToPose goal, in parallel
    r + Enter  -> release the software stop (asks "yes"; cancelled goals stay cancelled)
    q + Enter  -> quit without changing anything

    stopkey.py [namespace=/robot_01]

This is not the hardware E-stop and does not cut motor power. Release order and the
hardware E-stop rule: robot/docs/test-readiness-2026-11-10.md §4.1. Moved into the repo
from ~/.cache/armtc/analysis/stopkey.py (same behaviour).
"""
import sys
import threading
import time

import rclpy
from action_msgs.srv import CancelGoal
from rclpy.executors import SingleThreadedExecutor
from std_srvs.srv import SetBool


def call(client, request, label, timeout=3.0):
    t0 = time.time()
    future = client.call_async(request)
    while not future.done() and time.time() - t0 < timeout:
        time.sleep(0.005)
    result = future.result() if future.done() else None
    print(f'  {label}: {"no reply in %.0f s!" % timeout if result is None else result} '
          f'({(time.time() - t0) * 1e3:.0f} ms)', flush=True)
    return result


def main(argv):
    ns = argv[1] if len(argv) > 1 else '/robot_01'
    rclpy.init()
    node = rclpy.create_node('stop_key')
    estop = node.create_client(SetBool, ns + '/emergency_stop')
    cancel = node.create_client(CancelGoal, ns + '/navigate_to_pose/_action/cancel_goal')
    executor = SingleThreadedExecutor()
    executor.add_node(node)
    spinner = threading.Thread(target=executor.spin, daemon=True)
    spinner.start()
    for name, client in (('emergency_stop', estop), ('cancel_goal', cancel)):
        while not client.wait_for_service(timeout_sec=1.0):
            print(f'waiting for {ns}/{name} ...', flush=True)
    print('READY: Enter = STOP (e-stop + cancel all goals), r = release, q = quit', flush=True)
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        cmd = line.strip().lower()
        if cmd == '':
            print(f'STOP at {time.strftime("%H:%M:%S")}', flush=True)
            threads = [threading.Thread(target=call, args=(estop, SetBool.Request(data=True), 'emergency_stop')),
                       threading.Thread(target=call, args=(cancel, CancelGoal.Request(), 'cancel all goals'))]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
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
