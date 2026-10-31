"""Dieu khien dau quay PAN/TILT va contactor bang ban phim (test tren Linux).

Thay cho FE khi chua co kenh lenh backend -> robot. Dung cung topic/action/
service ma FE/backend se dung, nen test o day la test dung duong ROS that.

  ros2 run stm32_bridge head_teleop --ros-args -r __ns:=/robot_01

Phim:
  mui ten / WASD  nhan = 1 buoc, giu = quay lien tuc, nha = dung
  h   HOME (tim vat can roi ve 0 do, ~21 s)
  0   ve goc 0/0 (can da HOME)
  space  dung (head/stop)      o  tat driver (head/off)
  z   dat moc tay tai vi tri hien tai (head/zero)
  c   bat/tat contactor        q  thoat
"""
import select
import sys
import termios
import threading
import time
import tty

import rclpy
from rclpy.action import ActionClient
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from std_msgs.msg import Bool
from std_srvs.srv import SetBool, Trigger

from bus_interfaces.action import SetHead
from bus_interfaces.msg import HeadJog, HeadState, HeadStep

from stm32_bridge.head_keys import HoldDetector, parse_keys

STATE_NAMES = {0: 'OFF', 1: 'IDLE', 2: 'MOVING', 3: 'HOMING', 4: 'NO_REF'}
HELP = ('Mui ten/WASD: nhan=1 buoc, giu=quay | h=HOME 0=ve 0 space=dung '
        'o=tat driver z=moc tay c=contactor q=thoat')


class HeadTeleop(Node):
    def __init__(self):
        super().__init__('head_teleop')
        self.declare_parameter('step_size', 1)
        self.step_size = int(self.get_parameter('step_size').value)
        self.jog_pub = self.create_publisher(HeadJog, 'head/jog', 10)
        self.step_pub = self.create_publisher(HeadStep, 'head/step', 10)
        self.create_subscription(HeadState, 'head/state', self._on_state, 10)
        self.create_subscription(Bool, 'contactor/state', self._on_contactor, 10)
        self.action = ActionClient(self, SetHead, 'head/set')
        self.srv = {name: self.create_client(Trigger, f'head/{name}')
                    for name in ('stop', 'off', 'zero')}
        self.contactor_cli = self.create_client(SetBool, 'contactor/set')
        self.state = None
        self.contactor = None
        self.last_msg = ''
        self._goal = None

    # ---- trang thai ----------------------------------------------------------
    def _on_state(self, msg):
        self.state = msg

    def _on_contactor(self, msg):
        self.contactor = bool(msg.data)

    def status_line(self):
        if self.state is None:
            head = 'head/state: chua nhan (bridge chay chua? namespace dung chua?)'
        else:
            s = self.state
            head = (f'{STATE_NAMES.get(s.state, s.state):6} pan {s.pan_deg:7.2f} '
                    f'tilt {s.tilt_deg:6.2f} moc={"co" if s.referenced else "KHONG"}')
        con = {None: '?', True: 'BAT', False: 'tat'}[self.contactor]
        return f'{head} | contactor {con} | {self.last_msg}'

    def say(self, text):
        self.last_msg = text

    # ---- lenh ----------------------------------------------------------------
    def jog(self, pan, tilt):
        self.jog_pub.publish(HeadJog(pan=pan, tilt=tilt))

    def step(self, pan, tilt):
        n = self.step_size
        self.step_pub.publish(HeadStep(pan_steps=pan * n, tilt_steps=tilt * n))

    def goal(self, mode, pan=0.0, tilt=0.0):
        if not self.action.server_is_ready():
            self.say('action head/set chua san sang')
            return
        label = 'HOME' if mode == SetHead.Goal.MODE_HOME else f'goc {pan}/{tilt}'
        self.say(f'{label}: dang gui...')
        fut = self.action.send_goal_async(SetHead.Goal(mode=mode, pan_deg=pan, tilt_deg=tilt))

        def accepted(f):
            handle = f.result()
            if not handle.accepted:
                self.say(f'{label}: bi tu choi')
                return
            self._goal = handle
            self.say(f'{label}: dang chay')
            handle.get_result_async().add_done_callback(
                lambda r: self.say(f'{label}: {r.result().result.message}'))
        fut.add_done_callback(accepted)

    def trigger(self, name):
        cli = self.srv[name]
        if not cli.service_is_ready():
            self.say(f'head/{name} chua san sang')
            return
        cli.call_async(Trigger.Request()).add_done_callback(
            lambda f: self.say(f'head/{name}: {f.result().message}'))

    def toggle_contactor(self):
        if not self.contactor_cli.service_is_ready():
            self.say('contactor/set chua san sang')
            return
        want = not bool(self.contactor)
        self.say(f'contactor -> {"BAT" if want else "tat"}...')
        self.contactor_cli.call_async(SetBool.Request(data=want)).add_done_callback(
            lambda f: self.say(f'contactor/set: {f.result().message}'))


def main(args=None):
    if not sys.stdin.isatty():
        print('head_teleop can mot terminal that (khong chay qua ros2 launch).')
        return 1
    rclpy.init(args=args)
    node = HeadTeleop()
    executor = MultiThreadedExecutor(num_threads=2)
    executor.add_node(node)
    threading.Thread(target=executor.spin, daemon=True).start()

    hold = HoldDetector()
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    pending = ''
    last_draw = 0.0
    print(HELP)
    try:
        tty.setcbreak(fd)
        while True:
            ready, _, _ = select.select([sys.stdin], [], [], 0.02)
            now = time.monotonic()
            actions = []
            quit_now = False
            if ready:
                import os
                pending += os.read(fd, 64).decode(errors='ignore')
                keys, pending = parse_keys(pending)
                for k in keys:
                    if k == 'q':
                        quit_now = True
                    elif k == ' ':
                        actions += hold.release()
                        node.trigger('stop')
                    elif k == 'h':
                        node.goal(SetHead.Goal.MODE_HOME)
                    elif k == '0':
                        node.goal(SetHead.Goal.MODE_ANGLE, 0.0, 0.0)
                    elif k == 'o':
                        actions += hold.release()
                        node.trigger('off')
                    elif k == 'z':
                        node.trigger('zero')
                    elif k == 'c':
                        node.toggle_contactor()
                    else:
                        actions += hold.on_key(k, now)
            actions += hold.tick(now)
            for kind, (pan, tilt) in actions:
                if kind == 'step':
                    node.step(pan, tilt)
                else:
                    node.jog(pan, tilt)
            if quit_now:
                for _, (pan, tilt) in hold.release():
                    node.jog(pan, tilt)
                break
            if now - last_draw > 0.1:
                last_draw = now
                sys.stdout.write('\r\x1b[K' + node.status_line())
                sys.stdout.flush()
    except KeyboardInterrupt:
        node.jog(0, 0)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
        print()
        time.sleep(0.1)          # cho JOG,0,0 kip di
        executor.shutdown()
        node.destroy_node()
        rclpy.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main())
