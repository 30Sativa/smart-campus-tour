import json
import math
import os
import sys
import threading
import time

import pytest
from builtin_interfaces.msg import Time
from geometry_msgs.msg import PoseWithCovarianceStamped

from robot_navigation.initialpose_guard import (PoseServer, check_request, describe_result,
                                                normalized, parse_request, yaw_of)

TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'tools',
                     'rviz_over_ssh')

LIMITS = {'max_linear': 0.02, 'max_angular': 0.05, 'odom_timeout': 0.5, 'min_interval': 1.0}
NOW = 1000.0
STILL = (NOW - 0.05, 0.0, 0.0)


def pose(frame='map', x=1.0, y=2.0, yaw=0.5, q=None):
    m = PoseWithCovarianceStamped()
    m.header.frame_id = frame
    o = m.pose.pose.orientation
    if q is None:
        o.z, o.w = math.sin(yaw / 2), math.cos(yaw / 2)
    else:
        o.x, o.y, o.z, o.w = q
    m.pose.pose.position.x, m.pose.pose.position.y = x, y
    return m


def check(msg, odom=STILL, last=None):
    return check_request(msg, 'map', odom, NOW, last, LIMITS)


def test_accepts_stationary_well_formed_request():
    assert check(pose()) == (True, 'ok')
    assert check(pose(frame='/map'))[0], 'leading slash is the same frame'


@pytest.mark.parametrize('odom,word', [
    ((NOW, 0.10, 0.0), 'moving'),
    ((NOW, 0.0, 0.30), 'moving'),
    ((NOW - 2.0, 0.0, 0.0), 'old'),
    (None, 'no odom'),
])
def test_rejects_when_motion_cannot_be_excluded(odom, word):
    ok, reason = check(pose(), odom=odom)
    assert not ok and word in reason


def test_rejects_wrong_frame_bad_values_and_double_click():
    ok, reason = check(pose(frame='odom'))
    assert not ok and 'Fixed Frame' in reason
    assert not check(pose(x=float('nan')))[0]
    bad = pose()
    bad.pose.covariance[0] = float('inf')
    assert not check(bad)[0]
    assert not check(pose(q=(0.0, 0.0, 0.0, 0.0)))[0]
    ok, reason = check(pose(), last=NOW - 0.3)
    assert not ok and 'previous' in reason
    assert check(pose(), last=NOW - 1.5)[0]


def test_normalized_uses_robot_stamp_and_unit_quaternion():
    stamp = Time(sec=42, nanosec=7)
    out = normalized(pose(frame='/map', q=(0.0, 0.0, 0.6, 0.8 * 2)), stamp)
    q = out.pose.pose.orientation
    assert out.header.stamp == stamp and out.header.frame_id == 'map'
    assert math.isclose(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2, 1.0)


def test_yaw_and_result_reporting():
    assert math.isclose(yaw_of(pose(yaw=-2.0).pose.pose.orientation), -2.0, abs_tol=1e-9)
    status, text = describe_result((1.0, 2.0, 3.1), (1.1, 2.0, -3.1), 0.25, 0.2)
    assert status == 'ACCEPTED', 'yaw wraps around +-pi'
    status, text = describe_result((1.0, 2.0, 0.0), (1.6, 2.0, 0.0), 0.25, 0.2)
    assert status == 'DIFFERENT' and '0.60 m' in text


def request(**over):
    r = {'op': 'initialpose', 'frame_id': 'map', 'x': 1.0, 'y': 2.0, 'z': 0.0,
         'qx': 0.0, 'qy': 0.0, 'qz': 0.0, 'qw': 1.0, 'covariance': [0.0] * 36}
    r.update(over)
    return json.dumps(r).encode()


def test_parse_request_builds_the_pose():
    m = parse_request(request(x=-0.49, covariance=[0.25] + [0.0] * 35))
    assert m.header.frame_id == 'map' and m.pose.pose.position.x == -0.49
    assert m.pose.covariance[0] == 0.25 and m.pose.pose.orientation.w == 1.0


@pytest.mark.parametrize('line,word', [
    (b'not json', 'JSON'),
    (json.dumps({'op': 'cmd_vel', 'x': 1}).encode(), 'initialpose'),
    (request(extra=1), 'unknown'),
    (json.dumps({'op': 'initialpose'}).encode(), 'missing'),
    (request(covariance=[0.0] * 35), '36'),
    (request(x='1'), 'numbers'),
    (request(x=True), 'numbers'),
    (request(frame_id=3), 'string'),
])
def test_parse_request_is_strict(line, word):
    with pytest.raises(ValueError, match=word):
        parse_request(line)


def test_pose_server_listens_on_loopback_only_and_limits_line_length():
    seen = []
    srv = PoseServer(0, lambda line, reply: (seen.append(line), reply('OK', 'got it'))).start()
    try:
        assert srv.server.server_address[0] == '127.0.0.1'
        import socket
        c = socket.create_connection(('127.0.0.1', srv.port), timeout=2)
        f = c.makefile('rwb')
        f.write(b'{"a": 1}\n')
        f.flush()
        assert json.loads(f.readline())['status'] == 'OK'
        f.write(b'x' * 9000 + b'\n')
        f.flush()
        assert json.loads(f.readline())['status'] == 'ERROR'
        assert f.readline() == b'', 'server closes after an oversized line'
    finally:
        srv.close()


def test_guard_protocol_with_the_laptop_adapter():
    """fox2ros.PoseLink (laptop) against PoseServer + parse_request (robot)."""
    sys.path.insert(0, TOOLS)
    import fox2ros
    got = []

    def on_line(line, reply):
        msg = parse_request(line)
        got.append(msg)
        reply('FORWARDED', f'x {msg.pose.pose.position.x:.2f}')

    srv = PoseServer(0, on_line, on_connect=lambda reply: reply('READY', 'guard')).start()
    replies = []
    link = fox2ros.PoseLink('127.0.0.1', srv.port, lambda st, tx: replies.append((st, tx)))
    threading.Thread(target=link.run, daemon=True).start()
    try:
        end = time.time() + 5
        while not link.up and time.time() < end:
            time.sleep(0.02)
        assert link.send(fox2ros.pose_request(pose(x=-0.49, y=-0.41, yaw=-0.087)))
        while len(replies) < 2 and time.time() < end:
            time.sleep(0.02)
        assert replies == [('READY', 'guard'), ('FORWARDED', 'x -0.49')]
        assert math.isclose(yaw_of(got[0].pose.pose.orientation), -0.087, abs_tol=1e-9)
    finally:
        link.stop.set()
        srv.close()


@pytest.fixture
def live_guard(monkeypatch):
    """The real node in its own context: loopback only, random domain, never
    the robot's discovery server (these tests may run on the robot)."""
    import random
    import socket
    import rclpy
    from nav_msgs.msg import Odometry
    from rclpy.executors import SingleThreadedExecutor
    from rclpy.parameter import Parameter
    from robot_navigation.initialpose_guard import InitialPoseGuard
    for var in ('ROS_DISCOVERY_SERVER', 'ROS_SUPER_CLIENT', 'FASTRTPS_DEFAULT_PROFILES_FILE'):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv('ROS_LOCALHOST_ONLY', '1')
    ctx = rclpy.Context()
    rclpy.init(context=ctx, domain_id=random.randint(150, 230))
    guard = InitialPoseGuard(context=ctx, parameter_overrides=[
        Parameter('listen_port', value=0), Parameter('confirm_timeout', value=1.0),
        Parameter('odom_wait', value=1.5), Parameter('min_interval', value=0.0)])
    odom_node = rclpy.create_node('fake_ekf', context=ctx)
    pub = odom_node.create_publisher(Odometry, 'odom', 10)
    speed = {'v': None}

    def tick():
        if speed['v'] is not None:
            m = Odometry()
            m.header.stamp = odom_node.get_clock().now().to_msg()
            m.twist.twist.linear.x = speed['v']
            pub.publish(m)
    odom_node.create_timer(0.04, tick)
    ex = SingleThreadedExecutor(context=ctx)
    ex.add_node(guard)
    ex.add_node(odom_node)
    threading.Thread(target=ex.spin, daemon=True).start()
    conn = socket.create_connection(('127.0.0.1', guard.server.port), timeout=5)
    f = conn.makefile('rwb')

    def ask(**over):
        f.write(request(**over) + b'\n')
        f.flush()
        return json.loads(f.readline())

    def next_reply():
        return json.loads(f.readline())
    ask.next_reply = next_reply
    assert json.loads(f.readline())['status'] == 'READY'
    yield speed, ask
    conn.close()
    ex.shutdown()
    guard.destroy_node()
    odom_node.destroy_node()
    rclpy.shutdown(context=ctx)


def test_live_guard_forwards_only_when_stationary(live_guard):
    speed, ask = live_guard
    speed['v'] = None
    r = ask()
    assert r['status'] == 'REJECTED' and 'no odom' in r['text']
    speed['v'] = 0.2
    r = ask()
    assert r['status'] == 'REJECTED' and 'moving' in r['text']
    speed['v'] = 0.0
    assert ask()['status'] == 'FORWARDED'
    # No AMCL here: after confirm_timeout the guard says so instead of staying silent.
    r = ask.next_reply()
    assert r['status'] == 'NO_ANSWER'
