"""Test contactor_ros.ContactorInterface khong can ROS (stub rclpy/std_*).

Firmware gia o muc giao thuc: CONTACTOR,<seq>,ON|OFF doi PA10, khung FB 24
truong mang trang thai o truong 23 va <seq> lenh cuoi da xu ly o truong 1."""
import os
import sys
import threading
import time
import types
from types import SimpleNamespace


def _stub(name):
    mod = types.ModuleType(name)
    sys.modules[name] = mod
    return mod


def _install_stubs():
    rclpy = sys.modules.get('rclpy') or _stub('rclpy')
    rcg = sys.modules.get('rclpy.callback_groups') or _stub('rclpy.callback_groups')
    rclpy.callback_groups = rcg
    rcg.ReentrantCallbackGroup = lambda: object()

    class Bool:
        def __init__(self, data=False):
            self.data = data

    std_msgs = sys.modules.get('std_msgs') or _stub('std_msgs')
    std_msgs_msg = sys.modules.get('std_msgs.msg') or _stub('std_msgs.msg')
    std_msgs.msg = std_msgs_msg
    std_msgs_msg.Bool = Bool
    std_srvs = sys.modules.get('std_srvs') or _stub('std_srvs')
    std_srvs_srv = sys.modules.get('std_srvs.srv') or _stub('std_srvs.srv')
    std_srvs.srv = std_srvs_srv
    std_srvs_srv.SetBool = type('SetBool', (), {})
    std_srvs_srv.Trigger = type('Trigger', (), {})


_install_stubs()
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from stm32_bridge import head_link as hl  # noqa: E402
from stm32_bridge.contactor_ros import ContactorInterface  # noqa: E402

FB19 = 'FB,{seq},0,0,20,STOP,0,1,0,0,0,0,0,0,0,0,0,0,0'


class FakeNode:
    def __init__(self, params=None):
        self._params, self.overrides = {}, params or {}
        self.published, self.services = [], {}

    def declare_parameter(self, name, default):
        self._params[name] = self.overrides.get(name, default)

    def get_parameter(self, name):
        return SimpleNamespace(value=self._params[name])

    def create_publisher(self, _t, topic, _q):
        return SimpleNamespace(publish=lambda m, topic=topic: self.published.append((topic, m.data)))

    def create_service(self, _t, name, cb, callback_group=None):
        self.services[name] = cb


class FakeStm32:
    def __init__(self, iface, with_field=True, drop_contactor=False):
        self.iface, self.with_field, self.drop = iface, with_field, drop_contactor
        self.lock = threading.Lock()
        self.seq, self.fb_seq, self.pa10 = 1, 0, 0
        self.sent, self.connected, self.running = [], True, True
        self.thread = threading.Thread(target=self._loop, daemon=True)

    def send(self, build):
        if not self.connected:
            return None
        with self.lock:
            seq = self.seq
            line = build(seq)
            self.seq = hl.next_seq(self.seq)
            self.sent.append(line)
            p = line.split(',')
            if p[0] == 'CONTACTOR' and self.drop:
                return seq                      # dong bi mat (hang doi RX tran)
            self.fb_seq = seq
            if p[0] == 'CONTACTOR':
                self.pa10 = 1 if p[2] == 'ON' else 0
        return seq

    def tick_stop(self):
        """Nhu bridge: STOP 20 Hz lam fb_seq tien len."""
        self.send(lambda s: f'STOP,{s}')

    def _loop(self):
        while self.running:
            time.sleep(0.02)
            self.tick_stop()
            with self.lock:
                line = FB19.format(seq=self.fb_seq)
                if self.with_field:
                    line += f',0,0,0,0,{self.pa10}'
            self.iface.on_feedback_line(line)

    def start(self):
        self.thread.start()
        time.sleep(0.06)
        return self

    def stop(self):
        self.running = False
        self.thread.join(timeout=1)


def make(**kw):
    node = FakeNode()
    holder = {}
    iface = ContactorInterface(node, lambda b: holder['hw'].send(b))
    hw = FakeStm32(iface, **kw)
    holder['hw'] = hw
    return node, iface, hw.start()


def call(node, on):
    return node.services['contactor/set'](SimpleNamespace(data=on), SimpleNamespace())


def test_on_off_confirmed_by_feedback():
    node, iface, hw = make()
    try:
        r = call(node, True)
        assert r.success and r.message == 'on' and hw.pa10 == 1
        assert any(s.startswith('CONTACTOR,') and s.endswith(',ON') for s in hw.sent)
        r = call(node, False)
        assert r.success and r.message == 'off' and hw.pa10 == 0
    finally:
        hw.stop()


def test_state_topic_on_change_and_periodic():
    node, iface, hw = make()
    try:
        time.sleep(0.1)
        call(node, True)
        time.sleep(0.1)
        call(node, False)
        time.sleep(1.2)
        states = [d for t, d in node.published if t == 'contactor/state']
        assert states[0] is False                       # trang thai dau sau boot
        assert True in states and states[-1] is False
        changes = [b for a, b in zip(states, states[1:]) if a != b]
        assert changes == [True, False]                 # khong lap thong bao doi
        assert len(states) >= 4                         # + 1 Hz khi khong doi
    finally:
        hw.stop()


def test_lost_command_is_not_confirmed():
    node, iface, hw = make(drop_contactor=True)
    try:
        r = call(node, True)
        assert not r.success and r.message == 'not_confirmed:state_is_off'
    finally:
        hw.stop()


def test_serial_unavailable():
    node, iface, hw = make()
    try:
        hw.connected = False
        r = call(node, True)
        assert not r.success and r.message == 'serial_unavailable'
    finally:
        hw.stop()


def test_firmware_without_contactor_field():
    node, iface, hw = make(with_field=False)
    try:
        r = call(node, True)
        assert not r.success and r.message == 'sent_but_firmware_has_no_contactor_feedback'
        assert not [1 for t, _ in node.published if t == 'contactor/state']
    finally:
        hw.stop()


def test_old_state_frame_does_not_confirm():
    """Khung FB cu (fb_seq < seq lenh) dang bao dung trang thai muon van
    khong duoc tinh la xac nhan... tru khi khung moi cung bao vay."""
    node, iface, hw = make()
    try:
        call(node, True)
        r = call(node, True)                            # da ON san: xac nhan ngay khi FB moi toi
        assert r.success and r.message == 'on'
    finally:
        hw.stop()
