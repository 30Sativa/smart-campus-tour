#!/usr/bin/env python3
"""fox2ros: laptop-side adapter that shows the robot in a laptop-local RViz2.

The robot runs foxglove_bridge on 127.0.0.1 only (robot_navigation
debug_bridge.launch.py). The laptop reaches it through an SSH tunnel, and this
adapter republishes the robot's CDR bytes, unchanged, into the laptop's own
DDS graph (ROS_LOCALHOST_ONLY=1). The laptop never joins the robot's DDS graph,
so a slow or lost laptop link cannot block a robot publisher.

Robot -> laptop: the topics in fox2ros_topics.yaml, through the read-only bridge.
Laptop -> robot: only RViz "2D Pose Estimate", as one JSON line to the robot's
initialpose_guard (its own loopback port, same SSH tunnel). The guard checks
it (robot stationary, frame, values) before AMCL sees it; its verdict comes
back on the same connection and is printed here.

The protocol part (WebSocket framing, foxglove.sdk.v1 session state) has no ROS
dependency so it can be unit tested anywhere; rclpy is imported only by main().
"""
import argparse
import base64
import hashlib
import json
import logging
import os
import socket
import struct
import threading
import time

import yaml

PROTOCOL = 'foxglove.sdk.v1'
WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
OP_CONT, OP_TEXT, OP_BINARY, OP_CLOSE, OP_PING, OP_PONG = 0, 1, 2, 8, 9, 10
SERVER_MESSAGE_DATA = 0x01   # [op][u32 subscription id][u64 log time][payload]
LOOPBACK_HOSTS = ('127.0.0.1', 'localhost', '::1')
CLASH_TOPICS = ('/tf', '/tf_static')   # always published by the robot itself

log = logging.getLogger('fox2ros')


class ProtocolError(Exception):
    pass


def text_frame(obj):
    return OP_TEXT, json.dumps(obj).encode()


# --------------------------------------------------------------- WebSocket --

def encode_frame(opcode, payload, mask=None):
    """Client frame (always masked, RFC 6455 5.3)."""
    mask = os.urandom(4) if mask is None else mask
    n = len(payload)
    if n < 126:
        length = bytes([0x80 | n])
    elif n < 65536:
        length = bytes([0x80 | 126]) + struct.pack('>H', n)
    else:
        length = bytes([0x80 | 127]) + struct.pack('>Q', n)
    body = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))
    return bytes([0x80 | opcode]) + length + mask + body


class FrameParser:
    """Incremental parser: feed() any chunk, get complete messages back.

    Buffering here (not blocking reads of exact sizes) means a socket timeout
    in the middle of a large frame never desynchronises the stream."""

    def __init__(self):
        self.buf = bytearray()
        self.partial_op = None
        self.partial = bytearray()

    def feed(self, data):
        self.buf += data
        out = []
        while True:
            frame = self._take_frame()
            if frame is None:
                return out
            fin, op, payload = frame
            if op >= 8:                       # control frames are never fragmented
                out.append((op, payload))
            elif op == OP_CONT:
                if self.partial_op is None:
                    raise ProtocolError('continuation without a first fragment')
                self.partial += payload
                if fin:
                    out.append((self.partial_op, bytes(self.partial)))
                    self.partial_op, self.partial = None, bytearray()
            elif fin:
                out.append((op, payload))
            else:
                self.partial_op, self.partial = op, bytearray(payload)

    def _take_frame(self):
        b = self.buf
        if len(b) < 2:
            return None
        fin, op, masked, n = b[0] & 0x80, b[0] & 0x0f, b[1] & 0x80, b[1] & 0x7f
        pos = 2
        if n == 126:
            if len(b) < 4:
                return None
            n, pos = struct.unpack('>H', b[2:4])[0], 4
        elif n == 127:
            if len(b) < 10:
                return None
            n, pos = struct.unpack('>Q', b[2:10])[0], 10
        mask = None
        if masked:
            if len(b) < pos + 4:
                return None
            mask, pos = bytes(b[pos:pos + 4]), pos + 4
        if len(b) < pos + n:
            return None
        payload = bytes(b[pos:pos + n])
        del b[:pos + n]
        if mask:
            payload = bytes(x ^ mask[i & 3] for i, x in enumerate(payload))
        return bool(fin), op, payload


def handshake_request(host, port, key):
    return (f'GET / HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n'
            f'Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n'
            f'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: {PROTOCOL}\r\n\r\n').encode()


def check_handshake_response(head, key):
    """head: response bytes up to and including the blank line."""
    lines = head.decode('latin-1').split('\r\n')
    if not lines[0].startswith('HTTP/1.1 101'):
        hint = ' (bridge protocol mismatch?)' if ' 400 ' in lines[0] else ''
        raise ProtocolError(f'handshake refused: {lines[0]}{hint}')
    headers = {}
    for line in lines[1:]:
        if ':' in line:
            k, v = line.split(':', 1)
            headers[k.strip().lower()] = v.strip()
    expected = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
    if headers.get('sec-websocket-accept') != expected:
        raise ProtocolError('bad Sec-WebSocket-Accept')
    if headers.get('sec-websocket-protocol') != PROTOCOL:
        raise ProtocolError(f'server chose protocol {headers.get("sec-websocket-protocol")!r}')


# ------------------------------------------------------------------ config --

def resolve(name, namespace):
    if name.startswith('/'):
        return name
    ns = '/' + namespace.strip('/') if namespace.strip('/') else ''
    return f'{ns}/{name}'


class Downlink:
    KEYS = {'name', 'latched', 'depth', 'snapshot_period', 'optional'}

    def __init__(self, topic, latched=False, depth=1, snapshot_period=None, optional=False):
        if depth < 1:
            raise ValueError(f'{topic}: depth must be >= 1')
        if snapshot_period is not None and snapshot_period < 1.0:
            raise ValueError(f'{topic}: snapshot_period must be >= 1 s')
        self.topic, self.latched, self.depth = topic, latched, depth
        self.snapshot_period, self.optional = snapshot_period, optional


def load_config(path, namespace, enable=()):
    """Return {topic: Downlink}. Optional downlinks are only used when named
    in `enable` (by their configured name)."""
    with open(path) as f:
        cfg = yaml.safe_load(f)
    unknown = set(cfg) - {'downlink'}
    if unknown:
        raise ValueError(f'unknown top-level keys {sorted(unknown)}')
    downlinks, names = {}, set()
    for d in cfg.get('downlink', []):
        bad = set(d) - Downlink.KEYS
        if bad:
            raise ValueError(f'{d.get("name")}: unknown keys {sorted(bad)}')
        names.add(d['name'])
        if d.get('optional') and d['name'] not in enable:
            continue
        topic = resolve(d['name'], namespace)
        downlinks[topic] = Downlink(topic, **{k: v for k, v in d.items() if k != 'name'})
    missing = set(enable) - names
    if missing:
        raise ValueError(f'--enable: not in config: {sorted(missing)}')
    return downlinks


def cdr_header_stamp(cdr):
    """Stamp (s) of a CDR message that starts with std_msgs/Header, or None."""
    if len(cdr) < 12 or cdr[1] not in (0, 1):
        return None
    fmt = '<iI' if cdr[1] == 1 else '>iI'
    sec, nsec = struct.unpack(fmt, cdr[4:12])
    return sec + nsec * 1e-9


class ClockCheck:
    """Laptop clock vs robot sensor stamps. Link delay only ever adds to
    (laptop_now - stamp), so the minimum over a window approaches the clock
    offset and a backlog after a stall cannot raise a false alarm."""

    def __init__(self, tolerance, window=20, min_samples=10):
        self.tolerance, self.samples, self.min_samples = tolerance, [], min_samples
        self.window = window

    def add(self, laptop_now, stamp):
        """Return the estimated offset when it exceeds the tolerance, else None."""
        self.samples = (self.samples + [laptop_now - stamp])[-self.window:]
        if len(self.samples) < self.min_samples:
            return None
        est = min(self.samples)
        return est if abs(est) > self.tolerance else None


def check_local_env(environ):
    """The adapter must publish into a laptop-local graph only. Republishing
    /tf and /map into the robot's own graph would corrupt it (and loop back
    through the bridge). The robot always sets ROS_DISCOVERY_SERVER
    (source-minipc); a laptop-local graph never needs one, and with one the
    startup clash check below cannot see other publishers."""
    errors = []
    if environ.get('ROS_LOCALHOST_ONLY') != '1':
        errors.append('ROS_LOCALHOST_ONLY must be 1 (laptop-local graph only)')
    if environ.get('ROS_DISCOVERY_SERVER'):
        errors.append(f'ROS_DISCOVERY_SERVER={environ["ROS_DISCOVERY_SERVER"]} is set: unset it. '
                      'fox2ros runs on the laptop, in a graph of its own, never on the robot')
    return errors


# ----------------------------------------------------------------- session --

class BridgeSession:
    """foxglove.sdk.v1 client state for one connection. Pure: returns the
    frames to send and the decoded messages; owns no socket."""

    def __init__(self, downlinks, clock=time.monotonic):
        self.downlinks, self.clock = downlinks, clock
        self.channels = {}        # server channel id -> (topic, schema)
        self.sub_of_topic = {}    # topic -> subscription id
        self.topic_of_sub = {}    # subscription id -> topic
        self.resubscribe_at = {}  # snapshot topic -> monotonic time
        self.next_sub_id = 1
        self.server_info = None

    def on_text(self, payload):
        msg = json.loads(payload)
        op = msg.get('op')
        if op == 'serverInfo':
            self.server_info = msg
            if 'clientPublish' in msg.get('capabilities', []):
                log.warning('robot bridge accepts client publishing: it should be read-only '
                            '(robot_navigation/config/debug_bridge.yaml)')
            return []
        if op == 'advertise':
            return self._subscribe(msg.get('channels', []))
        if op == 'unadvertise':
            for cid in msg.get('channelIds', []):
                topic, _ = self.channels.pop(cid, (None, None))
                sid = self.sub_of_topic.pop(topic, None) if topic else None
                if sid is not None:
                    self.topic_of_sub.pop(sid, None)
                    log.info('robot stopped publishing %s', topic)
            return []
        if op == 'status':
            level = {0: logging.INFO, 1: logging.WARNING}.get(msg.get('level'), logging.ERROR)
            log.log(level, 'robot bridge: %s', msg.get('message'))
            return []
        return []

    def _subscribe(self, channels, now=None):
        subs = []
        for ch in channels:
            topic, cid = ch.get('topic'), ch.get('id')
            self.channels[cid] = (topic, ch.get('schemaName'))
            if topic not in self.downlinks or ch.get('encoding') != 'cdr':
                continue
            if topic in self.sub_of_topic:
                continue
            subs.append(self._new_sub(topic, cid))
        return [text_frame({'op': 'subscribe', 'subscriptions': subs})] if subs else []

    def _new_sub(self, topic, cid):
        sid = self.next_sub_id
        self.next_sub_id += 1
        self.sub_of_topic[topic], self.topic_of_sub[sid] = sid, topic
        self.resubscribe_at.pop(topic, None)
        return {'id': sid, 'channelId': cid}

    def on_binary(self, payload):
        """Returns (frames to send, (topic, schema, cdr) or None)."""
        if not payload or payload[0] != SERVER_MESSAGE_DATA or len(payload) < 13:
            return [], None
        sid = struct.unpack('<I', payload[1:5])[0]
        topic = self.topic_of_sub.get(sid)
        if topic is None:
            return [], None                      # late message of a dropped subscription
        schema = next((s for t, s in self.channels.values() if t == topic), None)
        out = []
        period = self.downlinks[topic].snapshot_period
        if period:                                # one message, then pause the stream
            del self.sub_of_topic[topic], self.topic_of_sub[sid]
            self.resubscribe_at[topic] = self.clock() + period
            out.append(text_frame({'op': 'unsubscribe', 'subscriptionIds': [sid]}))
        return out, (topic, schema, payload[13:])

    def due(self):
        """Snapshot topics whose pause is over."""
        now, subs = self.clock(), []
        for topic, t in list(self.resubscribe_at.items()):
            if t > now:
                continue
            cid = next((c for c, (tp, _) in self.channels.items() if tp == topic), None)
            if cid is None:
                del self.resubscribe_at[topic]   # robot no longer advertises it
                continue
            subs.append(self._new_sub(topic, cid))
        return [text_frame({'op': 'subscribe', 'subscriptions': subs})] if subs else []

    def missing(self):
        advertised = {t for t, _ in self.channels.values()}
        return sorted(t for t in self.downlinks if t not in advertised)


# -------------------------------------------------------------------- link --

class Link:
    """Keeps one WebSocket session alive: connect, read, ping, reconnect.

    on_message(topic, schema, cdr) runs on the link thread; on_state(bool) is
    called on every up/down change."""

    def __init__(self, host, port, downlinks, on_message, on_state,
                 ping_interval=2.0, dead_after=10.0, retry_max=5.0):
        self.host, self.port = host, port
        self.downlinks = downlinks
        self.on_message, self.on_state = on_message, on_state
        self.ping_interval, self.dead_after, self.retry_max = ping_interval, dead_after, retry_max
        self.sock, self.session = None, None
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.connects = 0

    @property
    def up(self):
        return self.sock is not None

    def send(self, frames):
        with self.lock:
            if self.sock is None:
                return False
            for op, payload in frames:
                self.sock.sendall(encode_frame(op, payload))
            return True

    def run(self):
        delay, last_error = 1.0, None
        while not self.stop.is_set():
            try:
                self._session()
                delay = 1.0
            except (OSError, ProtocolError, ValueError) as e:
                if self.session is not None:
                    delay, last_error = 1.0, None   # it was up: retry fast
                if str(e) != last_error:            # log each new reason once
                    log.warning('robot link: %s', e)
                    last_error = str(e)
            finally:
                self._close()
            if self.stop.wait(delay):
                break
            delay = min(delay * 2, self.retry_max)

    def _close(self):
        was_up = self.session is not None
        with self.lock:
            if self.sock is not None:
                try:
                    self.sock.close()
                except OSError:
                    pass
            self.sock, self.session = None, None
        if was_up:
            self.on_state(False)

    def _session(self):
        s = socket.create_connection((self.host, self.port), timeout=3.0)
        s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        key = base64.b64encode(os.urandom(16)).decode()
        s.sendall(handshake_request(self.host, self.port, key))
        head = b''
        while b'\r\n\r\n' not in head:
            chunk = s.recv(4096)
            if not chunk:
                raise ProtocolError('connection closed during handshake'
                                    ' (is the SSH tunnel up and the robot bridge running?)')
            head += chunk
        head, rest = head.split(b'\r\n\r\n', 1)
        check_handshake_response(head + b'\r\n\r\n', key)
        s.settimeout(0.5)
        session = BridgeSession(self.downlinks)
        parser = FrameParser()
        with self.lock:
            self.sock = s
        self.session = session
        self.connects += 1
        self.on_state(True)
        last_rx = last_ping = time.monotonic()
        pending = parser.feed(rest)
        while not self.stop.is_set():
            for op, payload in pending:
                last_rx = time.monotonic()
                if op == OP_TEXT:
                    self.send(session.on_text(payload))
                elif op == OP_BINARY:
                    out, msg = session.on_binary(payload)
                    self.send(out)
                    if msg:
                        self.on_message(*msg)
                elif op == OP_PING:
                    self.send([(OP_PONG, payload)])
                elif op == OP_CLOSE:
                    raise ProtocolError('robot bridge closed the connection')
            now = time.monotonic()
            if now - last_rx > self.dead_after:
                raise ProtocolError(f'no data from robot for {self.dead_after:.0f} s')
            if now - last_ping > self.ping_interval:
                self.send([(OP_PING, b'fox2ros')])
                last_ping = now
            self.send(session.due())
            try:
                chunk = s.recv(65536)
            except socket.timeout:
                pending = []
                continue
            if not chunk:
                raise ProtocolError('robot link closed')
            pending = parser.feed(chunk)


# --------------------------------------------------------------- pose link --

def pose_request(msg):
    """PoseWithCovarianceStamped (anything with that shape) -> guard request."""
    p, q = msg.pose.pose.position, msg.pose.pose.orientation
    return {'op': 'initialpose', 'frame_id': msg.header.frame_id,
            'x': p.x, 'y': p.y, 'z': p.z, 'qx': q.x, 'qy': q.y, 'qz': q.z, 'qw': q.w,
            'covariance': [float(v) for v in msg.pose.covariance]}


class PoseLink:
    """Connection to initialpose_guard (line JSON, through the tunnel).
    on_reply(status, text) runs on the link thread. send() never queues: an
    initial pose that cannot go now must not arrive later."""

    def __init__(self, host, port, on_reply, retry_max=5.0):
        self.host, self.port, self.on_reply, self.retry_max = host, port, on_reply, retry_max
        self.sock = None
        self.ready = False   # the guard answered READY on this connection
        self.lock = threading.Lock()
        self.stop = threading.Event()

    @property
    def up(self):
        return self.ready

    def send(self, request):
        data = (json.dumps(request) + '\n').encode()
        with self.lock:
            if self.sock is None or not self.ready:
                return False
            try:
                self.sock.sendall(data)
                return True
            except OSError:
                return False

    def run(self):
        delay, last_error = 1.0, None
        while not self.stop.is_set():
            try:
                s = socket.create_connection((self.host, self.port), timeout=3.0)
                s.settimeout(0.5)
                with self.lock:
                    self.sock = s
                buf, last_error, delay = b'', None, 1.0
                while not self.stop.is_set():
                    try:
                        chunk = s.recv(4096)
                    except socket.timeout:
                        continue
                    if not chunk:
                        raise ConnectionError('closed by robot')
                    buf += chunk
                    while b'\n' in buf:
                        line, buf = buf.split(b'\n', 1)
                        try:
                            r = json.loads(line)
                            if r.get('status') == 'READY':
                                self.ready = True
                            self.on_reply(str(r.get('status')), str(r.get('text')))
                        except ValueError:
                            self.on_reply('ERROR', f'unreadable reply {line[:80]!r}')
            except (OSError, ConnectionError) as e:
                if str(e) != last_error:
                    log.warning('initial pose link: %s', e)
                    last_error = str(e)
            finally:
                with self.lock:
                    if self.sock is not None:
                        try:
                            self.sock.close()
                        except OSError:
                            pass
                    # The local tunnel end accepts even when the robot side is
                    # gone; only a connection the guard answered counts as up.
                    was_up, self.sock, self.ready = self.ready, None, False
                if was_up:
                    self.on_reply('DOWN', 'initial pose link lost; reconnecting')
            if self.stop.wait(delay):
                break
            delay = min(delay * 2, self.retry_max)


# --------------------------------------------------------------------- ROS --

def run_ros(args, downlinks):
    import rclpy
    from geometry_msgs.msg import PoseStamped, PoseWithCovarianceStamped
    from rclpy.node import Node
    from rclpy.qos import DurabilityPolicy, HistoryPolicy, QoSProfile, ReliabilityPolicy
    from rosidl_runtime_py.utilities import get_message

    rclpy.init()
    node = Node('fox2ros', start_parameter_services=False)
    rlog = node.get_logger()
    pubs, pubs_lock = {}, threading.Lock()
    stats = {t: 0 for t in downlinks}
    clock = ClockCheck(args.clock_tolerance)
    state = {'clock_sampled': 0.0, 'clock_warned': 0.0}
    scan_topic = resolve('scan', args.namespace)

    def qos(d):
        # RELIABLE + TRANSIENT_LOCAL offers satisfy every RViz request
        # (reliable/best effort, volatile/transient local). Streams stay
        # VOLATILE so a late RViz display never draws an old sample.
        return QoSProfile(history=HistoryPolicy.KEEP_LAST, depth=d.depth,
                          reliability=ReliabilityPolicy.RELIABLE,
                          durability=DurabilityPolicy.TRANSIENT_LOCAL if d.latched
                          else DurabilityPolicy.VOLATILE)

    def on_message(topic, schema, cdr):
        with pubs_lock:
            pub = pubs.get(topic)
            if pub is None:
                pub = pubs[topic] = node.create_publisher(get_message(schema), topic,
                                                          qos(downlinks[topic]))
        pub.publish(cdr)
        stats[topic] += 1
        now = time.monotonic()
        if topic == scan_topic and now - state['clock_sampled'] > 0.5:
            state['clock_sampled'] = now
            stamp = cdr_header_stamp(cdr)
            off = clock.add(time.time(), stamp) if stamp else None
            if off is not None and now - state['clock_warned'] > 60:
                state['clock_warned'] = now
                side = 'ahead of' if off > 0 else 'behind'
                rlog.warning(f'laptop clock is {abs(off):.1f} s {side} the robot: RViz may drop '
                             'data as too old/new. Sync the laptop clock (NTP). '
                             'Initial poses are re-stamped on the robot and are not affected.')

    def on_state(up):
        if up:
            rlog.info(f'robot data link UP ({args.url}); subscribing {len(downlinks)} topics')
        else:
            rlog.warning('robot data link DOWN: RViz keeps the last data; reconnecting')

    def on_reply(status, text):
        line = f'[robot] {status}: {text}'
        if status in ('READY', 'FORWARDED', 'ACCEPTED'):
            rlog.info(line)
        else:
            rlog.warning(line)

    host, port = args.url.split('//', 1)[1].rsplit(':', 1)
    link = Link(host, int(port), downlinks, on_message, on_state)
    phost, pport = args.pose_url.split('//', 1)[1].rsplit(':', 1)
    pose_link = PoseLink(phost, int(pport), on_reply)

    def on_initialpose(msg):
        if pose_link.send(pose_request(msg)):
            rlog.info('initial pose sent to robot; waiting for its verdict')
        else:
            rlog.error('initial pose NOT sent: link to the robot is down (nothing is queued)')

    initialpose = resolve('initialpose', args.namespace)
    node.create_subscription(PoseWithCovarianceStamped, initialpose, on_initialpose,
                             QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE))
    # RViz "Nav2 Goal" publishes here too; say clearly that nothing moves.
    node.create_subscription(
        PoseStamped, resolve('goal_pose', args.namespace),
        lambda m: rlog.warning('Nav2 Goal is NOT sent to the robot: this RViz is a debug view. '
                               'Send goals on the robot (or through the backend).'),
        QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE))

    # Refuse to start inside a graph that already has the robot's data (for
    # example on the robot itself, or with a bag playing): duplicate /tf.
    time.sleep(args.discovery_wait)
    clashes = [t for t in downlinks if node.count_publishers(t) > 0]   # simple discovery sees all
    if clashes:
        rlog.fatal(f'this graph already has publishers on {clashes}: fox2ros must run in a '
                   'laptop-local graph with nothing else publishing robot data. Refusing.')
        node.destroy_node()
        rclpy.try_shutdown()
        return 2

    def report():
        others = [t for t in CLASH_TOPICS if t in pubs and node.count_publishers(t) > 1]
        if others:
            rlog.error(f'another publisher appeared on {others} in this laptop graph: RViz now '
                       'sees two sources (a bag or sim running here?)')
        if link.session is not None:
            missing = link.session.missing()
            if missing:
                rlog.info(f'not advertised by robot (not running there?): {missing}')
        busy = {t: n for t, n in stats.items() if n}
        rlog.info(f'messages last {args.stats_period:.0f} s: {busy or "none"}')
        for t in stats:
            stats[t] = 0

    node.create_timer(args.stats_period, report)
    threading.Thread(target=link.run, name='robot-data', daemon=True).start()
    threading.Thread(target=pose_link.run, name='robot-pose', daemon=True).start()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        link.stop.set()
        pose_link.stop.set()
        node.destroy_node()
        rclpy.try_shutdown()
    return 0


def is_loopback_url(url, scheme):
    if not url.startswith(scheme + '://'):
        return False
    host = url[len(scheme) + 3:].rsplit(':', 1)[0]
    return host in LOOPBACK_HOSTS


def main(argv=None):
    here = os.path.dirname(os.path.abspath(__file__))
    p = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    p.add_argument('--url', default='ws://127.0.0.1:8765',
                   help='local end of the SSH tunnel to the robot bridge (never the robot IP: '
                        'the bridge listens on the robot loopback only)')
    p.add_argument('--pose-url', default='tcp://127.0.0.1:8766',
                   help='local end of the SSH tunnel to initialpose_guard')
    p.add_argument('--namespace', default='robot_01', help='robot_id the robot was launched with')
    p.add_argument('--topics', default=os.path.join(here, 'fox2ros_topics.yaml'))
    p.add_argument('--enable', default='', help='comma list of optional downlinks, e.g. '
                   'global_costmap/costmap')
    p.add_argument('--stats-period', type=float, default=60.0)
    p.add_argument('--clock-tolerance', type=float, default=0.5)
    p.add_argument('--discovery-wait', type=float, default=2.0)
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format='[fox2ros] %(levelname)s %(message)s')
    if not is_loopback_url(args.url, 'ws'):
        p.error('--url must be ws://127.0.0.1:<port> (the local end of the SSH tunnel)')
    if not is_loopback_url(args.pose_url, 'tcp'):
        p.error('--pose-url must be tcp://127.0.0.1:<port> (the local end of the SSH tunnel)')
    errors = check_local_env(os.environ)
    if errors:
        for e in errors:
            log.error(e)
        return 2
    enable = [e for e in args.enable.split(',') if e]
    return run_ros(args, load_config(args.topics, args.namespace, enable))


if __name__ == '__main__':
    raise SystemExit(main())
