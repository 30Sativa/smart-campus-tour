"""Send START -> POI_01 -> START style goals and log results. Usage: goals.py out.json x,y,yawrad [x,y,yawrad ...]"""
import sys, json, math, time, rclpy
from rclpy.action import ActionClient
from nav2_msgs.action import NavigateToPose
rclpy.init(); n = rclpy.create_node('navsim_goals')
c = ActionClient(n, NavigateToPose, '/robot_01/navigate_to_pose')
if not c.wait_for_server(timeout_sec=60): print('no nav2'); sys.exit(2)
time.sleep(3.0)
res = []
for g in sys.argv[2:]:
    x, y, yaw = (float(v) for v in g.split(','))
    goal = NavigateToPose.Goal(); goal.pose.header.frame_id = 'map'
    goal.pose.pose.position.x, goal.pose.pose.position.y = x, y
    goal.pose.pose.orientation.z, goal.pose.pose.orientation.w = math.sin(yaw / 2), math.cos(yaw / 2)
    t0 = n.get_clock().now().nanoseconds * 1e-9
    f = c.send_goal_async(goal); rclpy.spin_until_future_complete(n, f, timeout_sec=10)
    h = f.result()
    if not h or not h.accepted: res.append({'goal': [x, y, yaw], 'status': 'rejected'}); break
    rf = h.get_result_async(); rclpy.spin_until_future_complete(n, rf, timeout_sec=900)
    t1 = n.get_clock().now().nanoseconds * 1e-9
    st = rf.result().status if rf.done() else -1
    res.append({'goal': [x, y, yaw], 'status': st, 't0': t0, 't1': t1})
    print('goal', g, 'status', st, 'time %.1f' % (t1 - t0), flush=True)
    if st != 4: break
    time.sleep(3.0)
json.dump(res, open(sys.argv[1], 'w'))
