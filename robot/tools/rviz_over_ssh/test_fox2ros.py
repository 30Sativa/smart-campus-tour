"""fox2ros protocol, config and reconnect tests. No ROS needed (rclpy is only
imported by fox2ros.run_ros)."""
import base64
import hashlib
import json
import os
import socket
import struct
import sys
import threading
import time

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fox2ros as fx  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
TOPICS = os.path.join(HERE, 'fox2ros_topics.yaml')


# ------------------------------------------------------------------ frames

def server_frame(op, payload, fin=True):
    """Unmasked server frame."""
    n = len(payload)
    head = bytes([(0x80 if fin else 0) | op])
    if n < 126:
        head += bytes([n])
    elif n < 65536:
        head += bytes([126]) + struct.pack('>H', n)
    else:
        head += bytes([127]) + struct.pack('>Q', n)
    return head + payload


@pytest.mark.parametrize('n', [0, 1, 125, 126, 65535, 65536, 300000])
def test_client_frame_roundtrip_all_length_encodings(n):
    payload = os.urandom(n)
    frame = fx.encode_frame(fx.OP_BINARY, payload)
    assert frame[1] & 0x80, 'client frames must be masked'
    assert fx.FrameParser().feed(frame) == [(fx.OP_BINARY, payload)]


def test_parser_survives_arbitrary_chunking():
    msgs = [(fx.OP_TEXT, b'{"op":"x"}'), (fx.OP_BINARY, os.urandom(70000)), (fx.OP_PING, b'p')]
    stream = b''.join(server_frame(op, p) for op, p in msgs)
    parser, got = fx.FrameParser(), []
    for i in range(0, len(stream), 7):          # a timeout can split anywhere
        got += parser.feed(stream[i:i + 7])
    assert got == msgs


def test_parser_reassembles_fragments_with_interleaved_control_frame():
    stream = (server_frame(fx.OP_BINARY, b'ab', fin=False) + server_frame(fx.OP_PING, b'z')
              + server_frame(fx.OP_CONT, b'cd', fin=False) + server_frame(fx.OP_CONT, b'ef'))
    assert fx.FrameParser().feed(stream) == [(fx.OP_PING, b'z'), (fx.OP_BINARY, b'abcdef')]


def test_parser_rejects_orphan_continuation():
    with pytest.raises(fx.ProtocolError):
        fx.FrameParser().feed(server_frame(fx.OP_CONT, b'x'))


def accept_for(key):
    return base64.b64encode(hashlib.sha1((key + fx.WS_GUID).encode()).digest()).decode()


def test_handshake_checks_status_accept_and_protocol():
    key = 'dGhlIHNhbXBsZSBub25jZQ=='
    ok = (f'HTTP/1.1 101 Switching Protocols\r\nSec-WebSocket-Accept: {accept_for(key)}\r\n'
          f'Sec-WebSocket-Protocol: {fx.PROTOCOL}\r\n\r\n').encode()
    fx.check_handshake_response(ok, key)
    with pytest.raises(fx.ProtocolError, match='protocol mismatch'):
        fx.check_handshake_response(b'HTTP/1.1 400 Bad Request\r\n\r\n', key)
    with pytest.raises(fx.ProtocolError, match='Accept'):
        fx.check_handshake_response(ok.replace(accept_for(key).encode(), b'AAAA'), key)
    with pytest.raises(fx.ProtocolError, match='protocol'):
        old = ok.replace(fx.PROTOCOL.encode(), b'foxglove.websocket.v1')
        fx.check_handshake_response(old, key)
    assert f'Sec-WebSocket-Protocol: {fx.PROTOCOL}'.encode() in fx.handshake_request('h', 1, key)


# ------------------------------------------------------------------ config

def test_names_resolve_under_namespace_and_tf_stays_global():
    assert fx.resolve('scan', 'robot_01') == '/robot_01/scan'
    assert fx.resolve('scan', '/robot_01/') == '/robot_01/scan'
    assert fx.resolve('scan', '') == '/scan'
    assert fx.resolve('/tf', 'robot_01') == '/tf'


def test_shipped_topic_config_matches_navigation_rviz_needs():
    down = fx.load_config(TOPICS, 'robot_01')
    for t in ['/tf', '/tf_static', '/robot_01/map', '/robot_01/scan',
              '/robot_01/robot_description', '/robot_01/local_costmap/costmap',
              '/robot_01/amcl_pose', '/robot_01/particle_cloud']:
        assert t in down, t
    # Displays that request TRANSIENT_LOCAL get a latched laptop publisher.
    for t in ['/tf_static', '/robot_01/map', '/robot_01/robot_description',
              '/robot_01/local_costmap/costmap']:
        assert down[t].latched, t
    assert not down['/tf'].latched and not down['/robot_01/scan'].latched
    assert down['/tf_static'].depth >= 10, 'one sample per static TF publisher'
    assert '/robot_01/global_costmap/costmap' not in down, 'optional: 2.8 MB at 1 Hz'
    assert not any('initialpose' in t for t in down)
    down = fx.load_config(TOPICS, 'robot_01', enable=['global_costmap/costmap'])
    assert down['/robot_01/global_costmap/costmap'].snapshot_period >= 5


def test_config_rejects_typos(tmp_path):
    bad = tmp_path / 't.yaml'
    bad.write_text('downlink:\n  - {name: scan, lached: true}\n')
    with pytest.raises(ValueError, match='lached'):
        fx.load_config(str(bad), 'robot_01')
    with pytest.raises(ValueError, match='not in config'):
        fx.load_config(TOPICS, 'robot_01', enable=['global_costmap/costmp'])


def test_env_guard_refuses_robot_graph():
    assert fx.check_local_env({'ROS_LOCALHOST_ONLY': '1'}) == []
    assert fx.check_local_env({'ROS_LOCALHOST_ONLY': '1', 'ROS_DISCOVERY_SERVER': ''}) == []
    assert fx.check_local_env({'ROS_LOCALHOST_ONLY': '0'})
    assert fx.check_local_env({})
    # The robot's own environment (source-minipc after S2): must refuse. With a
    # Discovery Server the startup clash check is blind (found in E2E).
    robot_env = {'ROS_LOCALHOST_ONLY': '1', 'ROS_DISCOVERY_SERVER': '127.0.0.1:11811'}
    errs = fx.check_local_env(robot_env)
    assert errs and 'never on the robot' in errs[0]
    assert fx.check_local_env(dict(robot_env, ROS_DISCOVERY_SERVER='10.86.7.244:11811'))


@pytest.mark.parametrize('argv', [['--url', 'ws://10.86.7.244:8765'],
                                  ['--pose-url', 'tcp://10.86.7.244:8766'],
                                  ['--url', 'http://127.0.0.1:8765']])
def test_main_refuses_non_loopback_urls(monkeypatch, argv):
    monkeypatch.setenv('ROS_LOCALHOST_ONLY', '1')
    with pytest.raises(SystemExit):
        fx.main(argv)


def test_cdr_header_stamp_both_endians():
    le = b'\x00\x01\x00\x00' + struct.pack('<iI', 1792214322, 500000000) + b'rest'
    be = b'\x00\x00\x00\x00' + struct.pack('>iI', 7, 250000000)
    assert fx.cdr_header_stamp(le) == pytest.approx(1792214322.5)
    assert fx.cdr_header_stamp(be) == pytest.approx(7.25)
    assert fx.cdr_header_stamp(b'\x00\x01') is None


def test_clock_check_ignores_link_delay_but_catches_offset():
    c = fx.ClockCheck(tolerance=0.5)
    # Same clock, 0.05-3 s of link delay after a stall: never an alarm.
    delays = [3, 2.5, 2, 1, .4] + [.05] * 15
    assert all(c.add(100 + i + d, 100 + i) is None for i, d in enumerate(delays))
    ahead = fx.ClockCheck(tolerance=0.5)
    res = [ahead.add(100 + i + 2.0 + 0.05, 100 + i) for i in range(12)]
    assert res[:9] == [None] * 9 and res[-1] == pytest.approx(2.05)
    behind = fx.ClockCheck(tolerance=0.5)
    assert [behind.add(100 + i - 1.5, 100 + i) for i in range(10)][-1] == pytest.approx(-1.5)


# ----------------------------------------------------------------- session

def make_session(enable=(), clock=None):
    down = fx.load_config(TOPICS, 'robot_01', enable=enable)
    return fx.BridgeSession(down, **({'clock': clock} if clock else {}))


def sent(frames):
    return [json.loads(p) for op, p in frames if op == fx.OP_TEXT]


def msg_data(sub_id, payload=b'\x00\x01\x00\x00cdr'):
    return bytes([fx.SERVER_MESSAGE_DATA]) + struct.pack('<IQ', sub_id, 0) + payload


def advertise(*chans):
    return json.dumps({'op': 'advertise', 'channels': [
        {'id': cid, 'topic': t, 'encoding': enc, 'schemaName': 'x/msg/Y'}
        for cid, t, enc in chans]}).encode()


def test_warns_when_bridge_accepts_client_publishing(monkeypatch):
    # Record the call itself: other packages' tests (launch) reconfigure logging.
    warned = []
    monkeypatch.setattr(fx.log, 'warning', lambda msg, *a: warned.append(msg % a if a else msg))
    s = make_session()
    s.on_text(json.dumps({'op': 'serverInfo', 'capabilities': ['clientPublish']}).encode())
    assert warned and 'read-only' in warned[0]
    s.on_text(json.dumps({'op': 'serverInfo', 'capabilities': ['connectionGraph']}).encode())
    assert len(warned) == 1


def test_subscribes_only_configured_cdr_topics_once():
    s = make_session()
    [sub] = sent(s.on_text(advertise(
        (1, '/robot_01/scan', 'cdr'), (2, '/robot_01/cmd_vel', 'cdr'),
        (3, '/tf', 'json'), (4, '/tf_static', 'cdr'))))
    assert {x['channelId'] for x in sub['subscriptions']} == {1, 4}
    assert s.on_text(advertise((1, '/robot_01/scan', 'cdr'))) == []   # re-advertise: no duplicate


def test_message_routing_and_unknown_subscription_ignored():
    s = make_session()
    s.on_text(advertise((7, '/robot_01/scan', 'cdr')))
    out, msg = s.on_binary(msg_data(1, b'CDR'))
    assert out == [] and msg == ('/robot_01/scan', 'x/msg/Y', b'CDR')
    assert s.on_binary(msg_data(99)) == ([], None)
    assert s.on_binary(b'\x02junk') == ([], None)


def test_unadvertise_then_readvertise_with_new_channel_id():
    s = make_session()
    s.on_text(advertise((7, '/robot_01/scan', 'cdr')))
    s.on_text(json.dumps({'op': 'unadvertise', 'channelIds': [7]}).encode())
    assert s.on_binary(msg_data(1)) == ([], None)
    [sub] = sent(s.on_text(advertise((9, '/robot_01/scan', 'cdr'))))   # robot node restarted
    assert sub['subscriptions'][0]['channelId'] == 9
    _, msg = s.on_binary(msg_data(sub['subscriptions'][0]['id']))
    assert msg[0] == '/robot_01/scan'


def test_snapshot_topic_takes_one_message_then_pauses():
    now = [100.0]
    s = make_session(enable=['global_costmap/costmap'], clock=lambda: now[0])
    [sub] = sent(s.on_text(advertise((5, '/robot_01/global_costmap/costmap', 'cdr'))))
    sid = sub['subscriptions'][0]['id']
    out, msg = s.on_binary(msg_data(sid))
    assert msg is not None
    assert sent(out) == [{'op': 'unsubscribe', 'subscriptionIds': [sid]}]
    assert s.on_binary(msg_data(sid)) == ([], None), 'in-flight message after unsubscribe'
    now[0] += 5
    assert s.due() == []
    now[0] += 6
    [again] = sent(s.due())
    assert again['subscriptions'][0]['channelId'] == 5


def test_snapshot_forgotten_when_robot_stops_advertising():
    now = [0.0]
    s = make_session(enable=['global_costmap/costmap'], clock=lambda: now[0])
    [sub] = sent(s.on_text(advertise((5, '/robot_01/global_costmap/costmap', 'cdr'))))
    s.on_binary(msg_data(sub['subscriptions'][0]['id']))
    s.on_text(json.dumps({'op': 'unadvertise', 'channelIds': [5]}).encode())
    now[0] += 60
    assert s.due() == [] and s.resubscribe_at == {}


def test_missing_lists_topics_robot_does_not_advertise():
    s = make_session()
    s.on_text(advertise((1, '/robot_01/scan', 'cdr')))
    assert '/robot_01/map' in s.missing() and '/robot_01/scan' not in s.missing()


# --------------------------------------------------- link against a fake bridge

class FakeBridge:
    """Minimal foxglove.sdk.v1 server: advertises /robot_01/scan, streams it
    to subscribers, records client frames, can drop connections."""

    def __init__(self, protocol=fx.PROTOCOL):
        self.srv = socket.socket()
        self.srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.srv.bind(('127.0.0.1', 0))
        self.srv.listen()
        self.port = self.srv.getsockname()[1]
        self.protocol = protocol
        self.connections, self.client_frames, self.subscribes = 0, [], []
        self.conn = None
        self.silent = False
        self.stop = threading.Event()
        threading.Thread(target=self.serve, daemon=True).start()

    def serve(self):
        while not self.stop.is_set():
            try:
                c, _ = self.srv.accept()
            except OSError:
                return
            threading.Thread(target=self.handle, args=(c,), daemon=True).start()

    def handle(self, c):
        try:
            self.session(c)
        except OSError:
            pass                                  # client went away mid-handshake

    def session(self, c):
        req = b''
        while b'\r\n\r\n' not in req:
            chunk = c.recv(1024)
            if not chunk:
                return
            req += chunk
        key = [line.split(':', 1)[1].strip() for line in req.decode().split('\r\n')
               if line.lower().startswith('sec-websocket-key')][0]
        c.sendall((f'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n'
                   f'Connection: Upgrade\r\nSec-WebSocket-Accept: {accept_for(key)}\r\n'
                   f'Sec-WebSocket-Protocol: {self.protocol}\r\n\r\n').encode())
        self.connections += 1
        cid = 10 + self.connections               # channel ids change on every restart
        self.conn = c
        info = {'op': 'serverInfo', 'capabilities': ['clientPublish']}
        c.sendall(server_frame(fx.OP_TEXT, json.dumps(info).encode()))
        c.sendall(server_frame(fx.OP_TEXT, advertise((cid, '/robot_01/scan', 'cdr'))))
        parser, sub_id = fx.FrameParser(), None
        c.settimeout(0.05)
        try:
            while not self.stop.is_set() and self.conn is c:
                try:
                    data = c.recv(65536)
                    if not data:
                        return
                    for op, p in parser.feed(data):
                        if op == fx.OP_TEXT:
                            m = json.loads(p)
                            if m['op'] == 'subscribe':
                                self.subscribes.append(m['subscriptions'][0]['channelId'])
                                sub_id = m['subscriptions'][0]['id']
                        elif op == fx.OP_BINARY:
                            self.client_frames.append(p)
                        elif op == fx.OP_PING and not self.silent:
                            c.sendall(server_frame(fx.OP_PONG, p))
                except socket.timeout:
                    pass
                if sub_id is not None and not self.silent:
                    c.sendall(server_frame(fx.OP_BINARY, msg_data(sub_id, b'SCAN')))
        except OSError:
            return

    def drop(self):
        c, self.conn = self.conn, None
        c.shutdown(socket.SHUT_RDWR)
        c.close()

    def close(self):
        self.stop.set()
        self.srv.close()


def wait_for(cond, timeout=8.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.02)
    return False


def start_link(bridge, **kw):
    down = fx.load_config(TOPICS, 'robot_01')
    got, states = [], []
    link = fx.Link('127.0.0.1', bridge.port, down,
                   on_message=lambda t, s, c: got.append((t, c)), on_state=states.append, **kw)
    threading.Thread(target=link.run, daemon=True).start()
    return link, got, states


def test_link_streams_reconnects_and_resubscribes_after_bridge_restart():
    b = FakeBridge()
    link, got, states = start_link(b)
    try:
        assert wait_for(lambda: got), 'no data'
        assert got[0] == ('/robot_01/scan', b'SCAN')
        b.drop()                                            # Wi-Fi drop / bridge respawn
        assert wait_for(lambda: states.count(False) == 1)
        n = len(got)
        assert wait_for(lambda: b.connections == 2 and len(got) > n + 3), 'did not recover'
        assert b.subscribes == [11, 12], 'must subscribe to the new channel id'
        assert states[:3] == [True, False, True]
    finally:
        link.stop.set()
        b.close()


def test_link_detects_silent_dead_link():
    b = FakeBridge()
    link, got, states = start_link(b, dead_after=1.0, ping_interval=0.3)
    try:
        assert wait_for(lambda: got)
        b.silent = True                                     # TCP alive, nothing arrives
        assert wait_for(lambda: False in states, timeout=4), 'dead link not detected'
    finally:
        link.stop.set()
        b.close()


class FakeGuard:
    """Line-JSON server like initialpose_guard: READY on connect, then one
    FORWARDED reply per request."""

    def __init__(self):
        self.srv = socket.socket()
        self.srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.srv.bind(('127.0.0.1', 0))
        self.srv.listen()
        self.port = self.srv.getsockname()[1]
        self.requests, self.conn = [], None
        threading.Thread(target=self.serve, daemon=True).start()

    def serve(self):
        while True:
            try:
                c, _ = self.srv.accept()
            except OSError:
                return
            self.conn = c
            f = c.makefile('rwb')
            f.write(b'{"status": "READY", "text": "guard"}\n')
            f.flush()
            try:
                for line in f:
                    self.requests.append(json.loads(line))
                    f.write(b'{"status": "FORWARDED", "text": "ok"}\n')
                    f.flush()
            except OSError:
                pass

    def drop(self):
        self.conn.shutdown(socket.SHUT_RDWR)
        self.conn.close()


class Pose:
    """Duck-typed PoseWithCovarianceStamped."""

    def __init__(self):
        ns = type('ns', (), {})
        self.header, self.pose = ns(), ns()
        self.header.frame_id = 'map'
        self.pose.pose, self.pose.covariance = ns(), [0.0] * 36
        self.pose.pose.position, self.pose.pose.orientation = ns(), ns()
        p, q = self.pose.pose.position, self.pose.pose.orientation
        p.x, p.y, p.z, q.x, q.y, q.z, q.w = 1.0, 2.0, 0.0, 0.0, 0.0, 0.0, 1.0


def test_pose_request_carries_every_field_the_guard_requires():
    req = fx.pose_request(Pose())
    assert set(req) == {'op', 'frame_id', 'x', 'y', 'z', 'qx', 'qy', 'qz', 'qw', 'covariance'}
    assert req['op'] == 'initialpose' and len(req['covariance']) == 36


def test_pose_link_sends_reports_and_never_queues():
    g = FakeGuard()
    replies = []
    link = fx.PoseLink('127.0.0.1', g.port, lambda st, tx: replies.append(st))
    threading.Thread(target=link.run, daemon=True).start()
    try:
        assert wait_for(lambda: 'READY' in replies) and link.up
        assert link.send(fx.pose_request(Pose()))
        assert wait_for(lambda: 'FORWARDED' in replies) and g.requests[0]['x'] == 1.0
        g.drop()
        assert wait_for(lambda: 'DOWN' in replies)
        assert not link.send(fx.pose_request(Pose())), 'a stale pose must not be queued'
        assert wait_for(lambda: replies.count('READY') == 2), 'did not reconnect'
        assert len(g.requests) == 1
    finally:
        link.stop.set()
        g.srv.close()


def test_pose_link_is_down_until_the_guard_answers():
    """ssh -L accepts locally even when the robot end is gone: a bare TCP
    connect must not count as up, nor flood DOWN messages on every retry."""
    srv = socket.socket()
    srv.bind(('127.0.0.1', 0))
    srv.listen()
    port = srv.getsockname()[1]

    def accept_and_close():
        while True:
            try:
                c, _ = srv.accept()
            except OSError:
                return
            c.close()
    threading.Thread(target=accept_and_close, daemon=True).start()
    replies = []
    link = fx.PoseLink('127.0.0.1', port, lambda st, tx: replies.append(st), retry_max=0.2)
    threading.Thread(target=link.run, daemon=True).start()
    try:
        time.sleep(1.5)
        assert not link.up and not link.send(fx.pose_request(Pose()))
        assert replies == []
    finally:
        link.stop.set()
        srv.close()


def test_link_refuses_wrong_protocol():
    b = FakeBridge(protocol='foxglove.websocket.v1')
    link, got, states = start_link(b)
    try:
        time.sleep(1.5)
        assert states == [] and got == []
    finally:
        link.stop.set()
        b.close()


def test_pose_link_does_not_send_on_a_silent_connection():
    """Connected but the guard never said READY (robot end hung): no send."""
    srv = socket.socket()
    srv.bind(('127.0.0.1', 0))
    srv.listen()
    held = []
    threading.Thread(target=lambda: held.append(srv.accept()), daemon=True).start()
    link = fx.PoseLink('127.0.0.1', srv.getsockname()[1], lambda st, tx: None)
    threading.Thread(target=link.run, daemon=True).start()
    try:
        assert wait_for(lambda: held and link.sock is not None)
        assert not link.up and not link.send(fx.pose_request(Pose()))
    finally:
        link.stop.set()
        srv.close()
