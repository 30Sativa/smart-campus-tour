"""The real bridge executable, real rclpy and real pyserial against a pty firmware.

Unlike the other tests in this package it goes through Stm32BridgeNode.__init__,
launch-style parameters and the executor. It runs in a fresh interpreter because
other tests stub the ROS imports, on a private domain restricted to localhost,
and never opens a device. Skipped when ROS or pyserial is unavailable.

A pty is not cdc-acm: hangup and backpressure here only approximate USB.
"""

import json
import os
import pty
import signal
import subprocess
import sys
import tempfile
import threading
import time
import tty

_PKG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SKIPPED = 77


class Firmware:
    """Pty end of the wire: 50 Hz FB frames, records each complete line received."""

    def __init__(self, link):
        self.link = link
        self.received = []
        self.left = self.right = 0
        self.seq = 0
        self.yaw_cdeg = 0
        self.send_feedback = True
        self.running = True
        self.master = None
        # One loop iteration and a stall/reboot never interleave: the loop takes its
        # local copy of master under this lock.
        self.lock = threading.Lock()
        self._open_pty()
        threading.Thread(target=self._loop, daemon=True).start()

    def _open_pty(self):
        self.master, self.slave = pty.openpty()
        tty.setraw(self.master)
        tty.setraw(self.slave)
        os.set_blocking(self.master, False)
        if os.path.lexists(self.link):
            os.unlink(self.link)
        os.symlink(os.ttyname(self.slave), self.link)
        self.buffer = b''

    def reboot(self, silent_s):
        with self.lock:
            master, slave, self.master = self.master, self.slave, None
        os.close(slave)
        os.close(master)
        os.unlink(self.link)
        time.sleep(silent_s)
        self.left = self.right = 0
        self.yaw_cdeg = -2000
        self._open_pty()

    def stall_output(self):
        """Stop draining the bridge's output and keep the kernel buffer full.

        Two things freed room after a single fill, each enough for the bridge to keep
        writing ~10 s (CMD frames at 20 Hz), past this test's deadline for "stalled for
        more than" (an intermittent fail): the loop reading the master once more, and
        the tty layer moving queued bytes into the 4 KiB line-discipline buffer
        asynchronously. The lock stops the first; topping the buffer up until the
        firmware stops covers the second. The bridge still has to detect the stall.
        """
        with self.lock:
            self.master, slave = None, self.slave
        os.set_blocking(slave, False)

        def top_up():
            while self.running:
                try:
                    os.write(slave, b'x' * 256)
                except BlockingIOError:
                    time.sleep(0.005)
                except OSError:
                    return

        threading.Thread(target=top_up, daemon=True).start()

    def _loop(self):
        while self.running:
            with self.lock:
                master = self.master
                if master is not None:
                    try:
                        self.buffer += os.read(master, 4096)
                        while b'\n' in self.buffer:
                            line, self.buffer = self.buffer.split(b'\n', 1)
                            self.received.append((time.monotonic(), line.strip().decode()))
                    except (BlockingIOError, OSError):
                        pass
                    if self.send_feedback:
                        self.seq += 1
                        frame = (f'FB,{self.seq},{self.left},{self.right},20,OK,'
                                 f'{self.yaw_cdeg},1\r\n')
                        try:
                            os.write(master, frame.encode())
                        except (BlockingIOError, OSError):
                            pass
            time.sleep(0.02)

    def frames(self, start, end):
        return [line.split(',')[0] for stamp, line in self.received if start <= stamp < end]


def scenario(domain):
    try:
        import rclpy
        import serial  # noqa: F401
        from geometry_msgs.msg import Twist
        from nav_msgs.msg import Odometry
        from std_msgs.msg import Bool
    except ImportError:
        return _SKIPPED

    result = {}
    directory = tempfile.mkdtemp(prefix='stm32_bridge_e2e_')
    firmware = Firmware(os.path.join(directory, 'ttyFAKE'))
    # Unbuffered: this test polls the log, and a file would hold it back under load.
    env = dict(os.environ, ROS_DOMAIN_ID=domain, ROS_LOCALHOST_ONLY='1',
               RCUTILS_LOGGING_BUFFERED_STREAM='0',
               PYTHONPATH=_PKG_ROOT + os.pathsep + os.environ.get('PYTHONPATH', ''))
    for name in ('ROS_DISCOVERY_SERVER', 'ROS_SUPER_CLIENT', 'FASTRTPS_DEFAULT_PROFILES_FILE'):
        env.pop(name, None)
        os.environ.pop(name, None)
    os.environ.update(ROS_DOMAIN_ID=domain, ROS_LOCALHOST_ONLY='1')
    log_path = os.path.join(directory, 'bridge.log')
    with open(log_path, 'w') as log:
        bridge = subprocess.Popen(
            [sys.executable, '-c', 'from stm32_bridge.stm32_bridge_node import main; main()',
             '--ros-args', '-p', f'port:={firmware.link}', '-p', 'enable_head:=false',
             '-p', 'enable_contactor:=false', '-p', 'publish_tf:=false',
             '-p', 'odom_invert_left:=true', '-p', 'odom_invert_right:=true',
             '-p', 'ekf_toggle_service:=""'],
            env=env, stdout=log, stderr=subprocess.STDOUT)

    rclpy.init()
    node = rclpy.create_node('e2e_driver')
    command = node.create_publisher(Twist, 'cmd_vel', 10)
    odom = []
    node.create_subscription(Odometry, 'wheel/odom', lambda m: odom.append(
        (m.pose.pose.position.x, m.twist.twist.linear.x)), 10)
    link_ok = []
    node.create_subscription(Bool, 'stm32_link_ok', lambda m: link_ok.append(m.data), 10)
    drive = [False]

    def publish():
        msg = Twist()
        msg.linear.x = 0.2 if drive[0] else 0.0
        command.publish(msg)

    node.create_timer(0.05, publish)
    threading.Thread(target=rclpy.spin, args=(node,), daemon=True).start()

    def window(seconds):
        start = time.monotonic()
        time.sleep(seconds)
        frames = firmware.frames(start, time.monotonic())
        return {'CMD': frames.count('CMD'), 'STOP': frames.count('STOP')}

    deadline = time.monotonic() + 30.0
    while (not link_ok or not link_ok[-1]) and time.monotonic() < deadline:
        time.sleep(0.1)
    result['came_online'] = bool(link_ok and link_ok[-1])

    drive[0] = True
    result['healthy'] = window(1.0)
    firmware.send_feedback = False
    start = time.monotonic()
    time.sleep(0.15)
    firmware.send_feedback = True
    result['short_gap'] = {'STOP': firmware.frames(start, time.monotonic() + 0.5).count('STOP')}
    time.sleep(0.6)

    firmware.left -= 262
    firmware.right -= 262
    firmware.send_feedback = False
    time.sleep(0.7)
    result['feedback_lost'] = window(1.0)
    result['link_ok_while_lost'] = link_ok[-1]
    firmware.send_feedback = True
    result['feedback_back_streaming'] = window(1.5)
    drive[0] = False
    time.sleep(0.3)
    drive[0] = True
    result['after_idle'] = window(0.5)

    before_x, count_before = odom[-1][0], len(odom)
    firmware.reboot(0.4)
    result['after_reboot_streaming'] = window(3.0)
    after = odom[count_before:]
    result['odom_jump'] = max((abs(x - before_x) for x, _ in after), default=0.0)
    result['twist_peak'] = max((abs(v) for _, v in after), default=0.0)
    drive[0] = False
    time.sleep(0.4)
    drive[0] = True
    result['after_reboot_idle'] = window(0.5)

    firmware.stall_output()
    deadline = time.monotonic() + 10.0
    while time.monotonic() < deadline:
        with open(log_path) as text:
            result['stall_detected'] = 'stalled for more than' in text.read()
        if result['stall_detected']:
            break
        time.sleep(0.2)
    bridge.send_signal(signal.SIGINT)
    started = time.monotonic()
    try:
        result['exit_code'] = bridge.wait(8.0)
    except subprocess.TimeoutExpired:
        result['exit_code'] = 'hung'
        bridge.kill()
    result['exit_seconds'] = time.monotonic() - started
    firmware.running = False
    print(json.dumps(result))
    sys.stdout.flush()
    os._exit(0)


def test_real_process_over_a_pty():
    domain = str(120 + os.getpid() % 90)
    env = {key: value for key, value in os.environ.items() if key != 'PYTEST_CURRENT_TEST'}
    done = subprocess.run([sys.executable, __file__, domain], env=env, capture_output=True,
                          text=True, timeout=90)
    if done.returncode == _SKIPPED:
        import pytest
        pytest.skip('ROS 2 or pyserial is not available')
    assert done.returncode == 0, done.stderr[-2000:]
    result = json.loads(done.stdout.strip().splitlines()[-1])
    assert result['came_online'], result
    assert result['healthy']['CMD'] >= 12, result
    assert result['short_gap']['STOP'] == 0, result
    assert result['feedback_lost'] == {'CMD': 0, 'STOP': result['feedback_lost']['STOP']}, result
    assert result['link_ok_while_lost'] is False, result
    assert result['feedback_back_streaming']['CMD'] == 0, result
    assert result['after_idle']['CMD'] >= 5, result
    assert result['after_reboot_streaming']['CMD'] == 0, result
    assert result['odom_jump'] < 0.001, result
    assert result['twist_peak'] < 0.001, result
    assert result['after_reboot_idle']['CMD'] >= 5, result
    assert result['stall_detected'], result
    assert result['exit_code'] == 0 and result['exit_seconds'] < 3.0, result


if __name__ == '__main__':
    sys.exit(scenario(sys.argv[1]))
