"""One NavigateToPose goal for a sonar scenario; writes OUT.json.

Usage: sonar_goals.py OUT.json x,y,yaw_rad
Env: NAVSIM_CANCEL_AT (s after acceptance: cancel the goal, the "explicit
cancellation" case), NAVSIM_GOAL_TIMEOUT (s, default 300: past it the goal is
reported HUNG and cancelled; a cancel not answered in 15 s is CANCEL_HUNG).
Statuses: SUCCEEDED, CANCELED, ABORTED (Nav2's own result), REJECTED, HUNG, CANCEL_HUNG.
"""
import json
import math
import os
import sys
import time

import rclpy
from action_msgs.msg import GoalStatus
from nav2_msgs.action import NavigateToPose
from rclpy.action import ActionClient

NAMES = {GoalStatus.STATUS_SUCCEEDED: 'SUCCEEDED', GoalStatus.STATUS_CANCELED: 'CANCELED',
         GoalStatus.STATUS_ABORTED: 'ABORTED'}


def main():
    out, spec = sys.argv[1], sys.argv[2]
    cancel_at = float(os.environ.get('NAVSIM_CANCEL_AT', 'inf'))
    timeout = float(os.environ.get('NAVSIM_GOAL_TIMEOUT', '300'))
    rclpy.init()
    n = rclpy.create_node('sonar_goals')
    c = ActionClient(n, NavigateToPose, '/robot_01/navigate_to_pose')
    res = {'goal': spec, 'status': 'NO_NAV2'}
    if not c.wait_for_server(timeout_sec=90):
        json.dump(res, open(out, 'w'))
        sys.exit(2)
    time.sleep(5.0)
    x, y, yaw = (float(v) for v in spec.split(','))
    goal = NavigateToPose.Goal()
    goal.pose.header.frame_id = 'map'
    goal.pose.pose.position.x, goal.pose.pose.position.y = x, y
    goal.pose.pose.orientation.z, goal.pose.pose.orientation.w = math.sin(yaw / 2), math.cos(yaw / 2)
    f = c.send_goal_async(goal)
    rclpy.spin_until_future_complete(n, f, timeout_sec=10)
    h = f.result()
    if not h or not h.accepted:
        res['status'] = 'REJECTED'
        json.dump(res, open(out, 'w'))
        return
    t0 = time.time()
    rf = h.get_result_async()
    cancel_sent = None
    while not rf.done():
        rclpy.spin_once(n, timeout_sec=0.1)
        el = time.time() - t0
        if cancel_sent is None and (el >= cancel_at or el >= timeout):
            res['cancel_reason'] = 'requested' if el >= cancel_at else 'timeout'
            h.cancel_goal_async()
            cancel_sent = time.time()
        if cancel_sent is not None and time.time() - cancel_sent > 15.0:
            break
    res['t'] = time.time() - t0
    if rf.done():
        st = NAMES.get(rf.result().status, str(rf.result().status))
        res['status'] = 'HUNG' if res.get('cancel_reason') == 'timeout' else st
    else:
        res['status'] = 'CANCEL_HUNG'
    if cancel_sent is not None:
        res['cancel_after'] = cancel_sent - t0
    print('goal', spec, res['status'], 'time %.1f' % res['t'], flush=True)
    json.dump(res, open(out, 'w'))


if __name__ == '__main__':
    main()
