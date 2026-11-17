"""Test head_ros.HeadInterface khong can ROS: stub rclpy/bus_interfaces/std_*,
node gia, va mot "firmware gia" phat khung FB theo PROTOCOL_FB.md tu lenh
nhan duoc (seq dung chung, head_seq, state, ERR,head_*)."""
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
    class _Msg:
        def __init__(self, **kw):
            self.header = SimpleNamespace(stamp=None)
            for k, v in kw.items():
                setattr(self, k, v)

    bi = _stub('bus_interfaces')
    bi_msg = _stub('bus_interfaces.msg')
    bi_action = _stub('bus_interfaces.action')
    bi.msg, bi.action = bi_msg, bi_action
    for n in ('HeadJog', 'HeadState', 'HeadStep'):
        setattr(bi_msg, n, type(n, (_Msg,), {}))

    class SetHead:
        class Goal(_Msg):
            MODE_ANGLE = 0
            MODE_HOME = 1

        class Result(_Msg):
            pass

        class Feedback(_Msg):
            pass

    bi_action.SetHead = SetHead
    bi_srv = _stub('bus_interfaces.srv')
    bi.srv = bi_srv

    class HeadSweep:
        class Request(_Msg):
            pass

    bi_srv.HeadSweep = HeadSweep

    rclpy = sys.modules.get('rclpy') or _stub('rclpy')
    ra = _stub('rclpy.action')
    rclpy.action = ra
    ra.ActionServer = lambda *a, **k: SimpleNamespace(args=a, kwargs=k)
    ra.CancelResponse = SimpleNamespace(ACCEPT=1, REJECT=0)
    ra.GoalResponse = SimpleNamespace(ACCEPT=1, REJECT=0)
    rcg = _stub('rclpy.callback_groups')
    rclpy.callback_groups = rcg
    rcg.ReentrantCallbackGroup = lambda: object()

    std_msgs = _stub('std_msgs')
    std_msgs_msg = _stub('std_msgs.msg')
    std_msgs.msg = std_msgs_msg
    std_msgs_msg.Bool = type('Bool', (_Msg,), {})

    std_srvs = _stub('std_srvs')
    std_srvs_srv = _stub('std_srvs.srv')
    std_srvs.srv = std_srvs_srv
    std_srvs_srv.Trigger = type('Trigger', (), {})
    std_srvs_srv.SetBool = type('SetBool', (), {})


_install_stubs()
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from stm32_bridge import head_link as hl  # noqa: E402
from stm32_bridge.head_ros import HeadInterface  # noqa: E402

FB19 = 'FB,{seq},0,0,20,STOP,0,1,0,0,0,0,0,0,0,0,0,0,0'


class FakeNode:
    def __init__(self, params=None):
        self._params = {}
        self.published = []
        self.services = {}
        self.subs = {}
        self.overrides = params or {}
        self.logs = []

    def declare_parameter(self, name, default):
        self._params[name] = self.overrides.get(name, default)

    def get_parameter(self, name):
        return SimpleNamespace(value=self._params[name])

    def create_publisher(self, _t, topic, _q):
        return SimpleNamespace(publish=lambda m, topic=topic: self.published.append((topic, m)))

    def create_subscription(self, _t, topic, cb, _q, callback_group=None):
        self.subs[topic] = cb

    def create_service(self, _t, name, cb, callback_group=None):
        self.services[name] = cb

    def get_clock(self):
        return SimpleNamespace(now=lambda: SimpleNamespace(to_msg=lambda: 0))

    def get_logger(self):
        return SimpleNamespace(warn=self.logs.append, info=self.logs.append)


class FakeFirmware:
    """Mo phong STM32 o muc giao thuc: seq dung chung, dau quay chay mat
    `move_s` giay moi lenh goc, HOME mat `home_s`, gioi han +/-170/+/-18."""

    def __init__(self, iface, move_s=0.3, home_s=0.5, with_head=True,
                 err_delay=0.0, with_contactor=True):
        self.iface = iface
        self.err_delay = err_delay          # ERR den SAU FB (firmware gioi han 20 ms)
        self.with_contactor = with_contactor
        self.lock = threading.Lock()
        self.seq = 1                      # nhu stm32_bridge: khong dung seq 0
        self.fb_seq = 0
        self.head_seq = 0
        self.state = hl.STATE_OFF
        self.pan = 0
        self.tilt = 0
        self.target = (0, 0)
        self.busy_until = 0.0
        self.contactor = 0
        self.move_s, self.home_s = move_s, home_s
        self.with_head = with_head
        self.sent = []
        self.running = True
        self.connected = True
        self.thread = threading.Thread(target=self._loop, daemon=True)

    def send(self, build):
        if not self.connected:
            return None
        with self.lock:
            seq = self.seq
            line = build(seq)
            self.seq = hl.next_seq(self.seq)
            self.sent.append(line)
            self._process(line)
        return seq

    def _process(self, line):
        p = line.split(',')
        seq = int(p[1])
        self.fb_seq = seq
        if p[0] == 'CONTACTOR':
            self.contactor = 1 if p[2] == 'ON' else 0
            return
        if p[0] != 'HEAD' or not self.with_head:
            return
        now = time.monotonic()
        ref = self.state in (hl.STATE_IDLE, hl.STATE_MOVING)
        if len(p) == 3:
            w = p[2]
            if w == 'HOME':
                if self.state in (hl.STATE_MOVING, hl.STATE_HOMING):
                    return self._err('head_busy')
                self.state, self.busy_until, self.target = hl.STATE_HOMING, now + self.home_s, (0, 0)
            elif w == 'OFF':
                self.state = hl.STATE_OFF
            elif w == 'ZERO':
                self.state, self.pan, self.tilt = hl.STATE_IDLE, 0, 0
            elif w == 'STOP':
                self.state = hl.STATE_NO_REF if self.state == hl.STATE_HOMING else (
                    hl.STATE_IDLE if ref else self.state)
                self.target = (self.pan, self.tilt)
            self.head_seq = seq
            return
        if len(p) == 4:
            if self.state == hl.STATE_HOMING:
                return self._err('head_busy')
            if not ref:
                return self._err('head_not_zeroed')
            pan, tilt = int(p[2]), int(p[3])
            if abs(pan) > 17000 or abs(tilt) > 1800:
                return self._err('head_limit')
            self.target = (pan, tilt)
            self.state, self.busy_until = hl.STATE_MOVING, now + self.move_s
            self.head_seq = seq
            return
        # STEP / JOG
        if not ref:
            return self._err('head_not_zeroed')
        if p[2] == 'STEP':
            # Nhu firmware: cong vao dich, chan o gioi han mem (PAN 0.6 do/buoc, TILT 0.36 do/buoc qua hop so 5:1).
            pan = max(-17000, min(17000, self.target[0] + int(p[3]) * 60))
            tilt = max(-1800, min(1800, self.target[1] + int(p[4]) * 36))
            self.target = (pan, tilt)
            self.state, self.busy_until = hl.STATE_MOVING, now + self.move_s
        self.head_seq = seq

    def _err(self, kind):
        if self.err_delay > 0.0:
            threading.Timer(self.err_delay, lambda: self.iface.on_error_line(f'ERR,{kind}')).start()
        else:
            self.iface.on_error_line(f'ERR,{kind}')

    def reset_mcu(self):
        """STM32 khoi dong lai: dau quay OFF, head_seq ve 0."""
        with self.lock:
            self.state, self.head_seq = hl.STATE_OFF, 0

    def _loop(self):
        while self.running:
            time.sleep(0.02)
            if not self.connected:
                continue
            with self.lock:
                now = time.monotonic()
                if self.state in (hl.STATE_MOVING, hl.STATE_HOMING) and now >= self.busy_until:
                    self.pan, self.tilt = self.target
                    self.state = hl.STATE_IDLE
                line = FB19.format(seq=self.fb_seq)
                if self.with_head:
                    line += f',{self.head_seq},{self.pan},{self.tilt},{self.state}'
                    if self.with_contactor:
                        line += f',{self.contactor}'
            self.iface.on_feedback_line(line)

    def start(self):
        self.thread.start()
        time.sleep(0.06)
        return self

    def stop(self):
        self.running = False
        self.thread.join(timeout=1)


class FakeGoalHandle:
    def __init__(self, mode, pan=0.0, tilt=0.0, cancel_after=None):
        from bus_interfaces.action import SetHead
        self.request = SetHead.Goal(mode=mode, pan_deg=pan, tilt_deg=tilt)
        self.feedback = []
        self.final = None
        self._t0 = time.monotonic()
        self._cancel_after = cancel_after

    @property
    def is_cancel_requested(self):
        return self._cancel_after is not None and time.monotonic() - self._t0 >= self._cancel_after

    def publish_feedback(self, fb):
        self.feedback.append(fb)

    def succeed(self):
        self.final = 'succeeded'

    def abort(self):
        self.final = 'aborted'

    def canceled(self):
        self.final = 'canceled'


def make(params=None, **fw_kw):
    # Mac dinh tat HOME tu dong de cac test cu kiem dung tung lenh; test rieng
    # ben duoi bat lai.
    # Khong ghi file nho goc PAN vao ~/.ros khi test; test rieng truyen duong dan tam.
    node = FakeNode({'head_auto_home': False, 'head_pan_memory_file': '', **(params or {})})
    holder = {}
    iface = HeadInterface(node, lambda build: holder['fw'].send(build))
    fw = FakeFirmware(iface, **fw_kw)
    holder['fw'] = fw
    return node, iface, fw.start()


def run_goal(iface, gh):
    return iface._execute(gh)


def test_home_then_angle_succeeds_only_after_idle():
    node, iface, fw = make()
    try:
        r = run_goal(iface, FakeGoalHandle(mode=1))
        assert r.success and r.message == 'homed' and fw.sent[-1].endswith(',HOME')
        gh = FakeGoalHandle(mode=0, pan=90.0, tilt=-15.0)
        r = run_goal(iface, gh)
        assert gh.final == 'succeeded' and r.success and r.message == 'reached'
        assert (r.pan_deg, r.tilt_deg) == (90.0, -15.0)
        assert gh.feedback and gh.feedback[0].state == hl.STATE_MOVING
        states = [m for t, m in node.published if t == 'head/state']
        assert states and states[-1].state == hl.STATE_IDLE and states[-1].referenced
    finally:
        fw.stop()


def test_rejections_carry_the_firmware_reason():
    node, iface, fw = make()
    try:
        r = run_goal(iface, FakeGoalHandle(mode=0, pan=10.0))
        assert not r.success and r.message == 'rejected:head_not_zeroed'
        run_goal(iface, FakeGoalHandle(mode=1))
        gh = FakeGoalHandle(mode=0, pan=175.0)
        r = run_goal(iface, gh)
        assert gh.final == 'aborted' and r.message == 'rejected:head_limit'
    finally:
        fw.stop()


def test_cancel_sends_head_stop():
    node, iface, fw = make(move_s=5.0)
    try:
        run_goal(iface, FakeGoalHandle(mode=1))
        gh = FakeGoalHandle(mode=0, pan=100.0, cancel_after=0.2)
        r = run_goal(iface, gh)
        assert gh.final == 'canceled' and not r.success
        assert fw.sent[-1].endswith(',STOP') and fw.sent[-1].startswith('HEAD,')
    finally:
        fw.stop()


def test_timeout_aborts_and_stops():
    node, iface, fw = make(params={'head_move_timeout': 0.4}, move_s=5.0)
    try:
        run_goal(iface, FakeGoalHandle(mode=1))
        gh = FakeGoalHandle(mode=0, pan=100.0)
        r = run_goal(iface, gh)
        assert gh.final == 'aborted' and r.message == 'timeout'
        assert fw.sent[-1].startswith('HEAD,') and fw.sent[-1].endswith(',STOP')
    finally:
        fw.stop()


def test_new_goal_supersedes_old():
    node, iface, fw = make(move_s=1.0)
    try:
        run_goal(iface, FakeGoalHandle(mode=1))
        first = FakeGoalHandle(mode=0, pan=50.0)
        out = {}
        t = threading.Thread(target=lambda: out.setdefault('r', run_goal(iface, first)))
        t.start()
        time.sleep(0.2)
        second = run_goal(iface, FakeGoalHandle(mode=0, pan=-50.0))
        t.join(timeout=5)
        assert out['r'].message == 'superseded' and first.final == 'aborted'
        assert second.success and second.pan_deg == -50.0
    finally:
        fw.stop()


def test_lost_feedback_is_reported():
    node, iface, fw = make(move_s=5.0)
    try:
        run_goal(iface, FakeGoalHandle(mode=1))
        fw.connected = False          # cap USB rut: send() tra None, khong con FB
        r = run_goal(iface, FakeGoalHandle(mode=0, pan=10.0))
        assert r.message == 'serial_unavailable'
    finally:
        fw.stop()


def test_old_firmware_disables_head():
    node, iface, fw = make(with_head=False)
    try:
        r = run_goal(iface, FakeGoalHandle(mode=1))
        assert not r.success and r.message == 'firmware_without_head'
        assert any('without' in str(x) for x in node.logs)
        node.subs['head/jog'](SimpleNamespace(pan=1, tilt=0))
        assert not any(s.startswith('HEAD,') for s in fw.sent)
    finally:
        fw.stop()


def test_services_stop_off_zero():
    node, iface, fw = make(move_s=5.0)
    try:
        resp = node.services['head/zero'](None, SimpleNamespace())
        assert resp.success and resp.message == 'zeroed'
        fw.send(lambda s: f'HEAD,{s},9000,0')
        time.sleep(0.1)
        resp = node.services['head/stop'](None, SimpleNamespace())
        assert resp.success
        resp = node.services['head/off'](None, SimpleNamespace())
        assert resp.success and resp.message == 'off'
        assert 'contactor/set' not in node.services     # contactor nam o contactor_ros.py
    finally:
        fw.stop()


def test_jog_topic_relay_and_deadman_via_timer():
    node, iface, fw = make()
    try:
        run_goal(iface, FakeGoalHandle(mode=1))
        n0 = len(fw.sent)
        node.subs['head/jog'](SimpleNamespace(pan=1, tilt=0))
        t0 = time.monotonic()
        while time.monotonic() - t0 < 0.6:     # nguon im lang sau lan dau
            iface.on_timer(time.monotonic())
            time.sleep(0.02)
        jogs = [s for s in fw.sent[n0:] if ',JOG,' in s]
        assert jogs[0].endswith(',JOG,1,0')
        assert jogs[-1].endswith(',JOG,0,0')    # deadman phia bridge
        assert sum(1 for s in jogs if s.endswith(',JOG,0,0')) == 1
        node.subs['head/step'](SimpleNamespace(pan_steps=0, tilt_steps=-1))
        assert fw.sent[-1].endswith(',STEP,0,-1')
    finally:
        fw.stop()


def test_reject_reason_found_even_when_err_arrives_after_fb():
    node, iface, fw = make(err_delay=0.06)
    try:
        run_goal(iface, FakeGoalHandle(mode=1))
        r = run_goal(iface, FakeGoalHandle(mode=0, pan=175.0))
        assert r.message == 'rejected:head_limit'
    finally:
        fw.stop()


def test_stm32_reset_during_home_is_reported():
    node, iface, fw = make(home_s=5.0)
    try:
        threading.Timer(0.3, fw.reset_mcu).start()
        r = run_goal(iface, FakeGoalHandle(mode=1))
        assert not r.success and r.message == 'aborted:stm32_reset'
    finally:
        fw.stop()


def _wait(cond, timeout=3.0):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        if cond():
            return True
        time.sleep(0.02)
    return False


def _homes(fw):
    return [s for s in fw.sent if s.endswith(',HOME')]


def test_auto_home_after_boot_and_after_stm32_reset_only():
    node, iface, fw = make(params={'head_auto_home': True})
    try:
        assert _wait(lambda: fw.state == hl.STATE_IDLE and len(_homes(fw)) == 1)
        assert any('auto-home done' in str(x) for x in node.logs)
        time.sleep(0.3)
        assert len(_homes(fw)) == 1, 'HOME tu dong chi mot lan sau khi boot'
        # Nguoi dung tat driver: khong duoc tu HOME lai.
        resp = node.services['head/off'](None, SimpleNamespace())
        assert resp.success
        time.sleep(0.4)
        assert len(_homes(fw)) == 1
        # STM32 khoi dong lai (head_seq=0, OFF): HOME lai.
        fw.reset_mcu()
        assert _wait(lambda: len(_homes(fw)) == 2 and fw.state == hl.STATE_IDLE)
    finally:
        fw.stop()


def test_auto_home_does_not_care_about_contactor():
    node, iface, fw = make(params={'head_auto_home': True})
    try:
        fw.contactor = 0                        # contactor tat
        assert _wait(lambda: fw.state == hl.STATE_IDLE and len(_homes(fw)) == 1)
        r = run_goal(iface, FakeGoalHandle(mode=0, pan=30.0, tilt=-18.0))
        assert r.success and not any(s.startswith('CONTACTOR') for s in fw.sent)
    finally:
        fw.stop()


def test_auto_home_off_by_parameter():
    node, iface, fw = make(params={'head_auto_home': False})
    try:
        time.sleep(0.3)
        assert not _homes(fw)
    finally:
        fw.stop()


def test_park_on_shutdown_sends_zero_angle():
    node, iface, fw = make()
    try:
        run_goal(iface, FakeGoalHandle(mode=1))
        r = run_goal(iface, FakeGoalHandle(mode=0, pan=90.0, tilt=10.0))
        assert r.success
        time.sleep(0.05)
        iface.shutdown()
        assert fw.sent[-1].startswith('HEAD,') and fw.sent[-1].endswith(',0,0')
        assert ',JOG,' not in fw.sent[-1]
    finally:
        fw.stop()


def test_no_park_without_reference_or_when_disabled():
    node, iface, fw = make()
    try:
        iface.shutdown()                       # chua HOME: khong co moc
        assert not any(s.startswith('HEAD,') for s in fw.sent)
    finally:
        fw.stop()
    node, iface, fw = make(params={'head_park_on_shutdown': False})
    try:
        run_goal(iface, FakeGoalHandle(mode=1))
        run_goal(iface, FakeGoalHandle(mode=0, pan=45.0))
        n = len(fw.sent)
        iface.shutdown()
        assert len(fw.sent) == n
    finally:
        fw.stop()


# ---- head/sweep: xoay tu dong trai -> phai -> ve cho cu ------------------------

def _steps(fw):
    return [s.split(',', 2)[2] for s in fw.sent if ',STEP,' in s]


def _homed(params=None, **fw_kw):
    node, iface, fw = make(params=params, **fw_kw)
    run_goal(iface, FakeGoalHandle(mode=1))
    return node, iface, fw


def _sweep(node):
    return node.services['head/sweep'](None, SimpleNamespace())


def test_sweep_goes_left_then_right_then_back_to_where_it_started():
    node, iface, fw = _homed(move_s=0.1)
    try:
        resp = _sweep(node)
        assert resp.success and resp.message == 'started'
        assert _wait(lambda: not iface._sweep_thread.is_alive(), 5.0)
        assert _steps(fw) == ['STEP,225,0', 'STEP,-450,0', 'STEP,225,0']   # 135 do = 225 buoc 0.6 do
        assert fw.pan == 0 and fw.state == hl.STATE_IDLE
    finally:
        fw.stop()


def test_sweep_shrinks_a_side_instead_of_hitting_the_soft_limit_and_still_returns():
    node, iface, fw = _homed(move_s=0.1)
    try:
        assert run_goal(iface, FakeGoalHandle(mode=0, pan=100.0)).success
        assert _sweep(node).success
        assert _wait(lambda: not iface._sweep_thread.is_alive(), 5.0)
        # Con 70 do toi +170: 116 buoc (69.6 do) sang trai, du 225 buoc sang phai.
        assert _steps(fw) == ['STEP,116,0', 'STEP,-341,0', 'STEP,225,0']
        assert fw.pan == 10000
        # Ve dung cho cu bang STEP: khong can lenh goc sua sai (HEAD,<seq>,<pan>,<tilt> co 3 dau phay).
        assert not any(s.startswith('HEAD,') and s.count(',') == 3 for s in fw.sent[-3:])
    finally:
        fw.stop()


def test_a_manual_button_stops_the_sweep_and_nothing_follows_it():
    node, iface, fw = _homed(move_s=0.4)
    try:
        assert _sweep(node).success
        assert _wait(lambda: len(_steps(fw)) == 1, 2.0)
        node.subs['head/jog'](SimpleNamespace(pan=-1, tilt=0))        # Operator giu nut
        assert _wait(lambda: not iface._sweep_thread.is_alive(), 3.0)
        after_jog = fw.sent[fw.sent.index(next(s for s in fw.sent if ',JOG,-1,0' in s)):]
        assert not any(',STEP,' in s for s in after_jog[1:])
        assert _steps(fw) == ['STEP,225,0']
    finally:
        fw.stop()


def test_a_release_without_an_active_jog_does_not_stop_the_sweep():
    node, iface, fw = _homed(move_s=0.1)
    try:
        node.subs['head/jog'](SimpleNamespace(pan=0, tilt=0))         # fleet_bridge nha nut truoc khi quet
        assert _sweep(node).success
        node.subs['head/jog'](SimpleNamespace(pan=0, tilt=0))
        assert _wait(lambda: not iface._sweep_thread.is_alive(), 5.0)
        assert len(_steps(fw)) == 3 and fw.pan == 0
    finally:
        fw.stop()


def test_sweep_is_refused_without_reference_while_moving_or_twice():
    node, iface, fw = make(move_s=0.5)
    try:
        assert _sweep(node).message == 'not_ready:off'
        run_goal(iface, FakeGoalHandle(mode=1))
        fw.send(lambda s: f'HEAD,{s},9000,0')
        time.sleep(0.1)
        assert _sweep(node).message == 'not_ready:moving'
        assert _wait(lambda: fw.state == hl.STATE_IDLE, 2.0)
        time.sleep(0.05)
        assert _sweep(node).success
        assert _sweep(node).message == 'already_sweeping'
    finally:
        fw.stop()


def test_sweep_of_zero_degrees_moves_nothing():
    node, iface, fw = _homed(params={'head_sweep_deg': 0.0})
    try:
        assert _sweep(node).success
        assert _wait(lambda: not iface._sweep_thread.is_alive(), 2.0)
        assert _steps(fw) == []
    finally:
        fw.stop()


def test_sweep_never_starts_from_a_position_a_just_sent_command_is_changing():
    # Nut tay vua gui ma firmware chua bao FB moi: luot quet khong duoc lay vi tri cu lam diem ve.
    node, iface, fw = _homed(move_s=0.5)
    try:
        node.subs['head/step'](SimpleNamespace(pan_steps=5, tilt_steps=0))
        resp = _sweep(node)
        assert not resp.success and resp.message == 'not_ready:moving'
        assert _steps(fw) == ['STEP,5,0']
    finally:
        fw.stop()


# ---- lenh tay trong luc quet: dung doan dang chay ----------------------------

def test_a_manual_step_during_a_sweep_stops_the_running_segment_before_stepping():
    # Firmware cong STEP vao DICH: khong co STOP truoc thi dau van quay het 135 do sang trai.
    node, iface, fw = _homed(move_s=0.5)
    try:
        assert _sweep(node).success
        assert _wait(lambda: len(_steps(fw)) == 1, 2.0)
        node.subs['head/step'](SimpleNamespace(pan_steps=-5, tilt_steps=0))
        assert _wait(lambda: not iface._sweep_thread.is_alive(), 3.0)
        stop_i = next(i for i, s in enumerate(fw.sent) if s.endswith(',STOP'))
        step_i = next(i for i, s in enumerate(fw.sent) if s.endswith(',STEP,-5,0'))
        assert stop_i == step_i - 1
        assert _wait(lambda: fw.state == hl.STATE_IDLE, 2.0)
        assert fw.pan == -300, 'dung tai cho roi nhich phai 5 buoc, khong chay toi 135 do trai'
        assert _steps(fw) == ['STEP,225,0', 'STEP,-5,0']
    finally:
        fw.stop()


def test_a_tilt_only_jog_during_a_sweep_also_stops_the_pan_segment():
    node, iface, fw = _homed(move_s=0.5)
    try:
        assert _sweep(node).success
        assert _wait(lambda: len(_steps(fw)) == 1, 2.0)
        node.subs['head/jog'](SimpleNamespace(pan=0, tilt=1))
        jog_i = next(i for i, s in enumerate(fw.sent) if s.endswith(',JOG,0,1'))
        assert fw.sent[jog_i - 1].endswith(',STOP')
    finally:
        fw.stop()


def test_a_manual_step_without_a_sweep_sends_no_stop():
    node, iface, fw = _homed(move_s=0.1)
    try:
        node.subs['head/step'](SimpleNamespace(pan_steps=3, tilt_steps=0))
        assert fw.sent[-1].endswith(',STEP,3,0') and not fw.sent[-2].endswith(',STOP')
    finally:
        fw.stop()


# ---- tat bridge: cho dau ve 0/0 xong -----------------------------------------

def test_park_on_shutdown_waits_until_the_head_is_back_at_zero():
    node, iface, fw = _homed(move_s=0.4)
    try:
        assert run_goal(iface, FakeGoalHandle(mode=0, pan=135.0)).success
        pumped = []
        t0 = time.monotonic()
        iface.shutdown(pump=lambda: pumped.append(1))
        assert time.monotonic() - t0 >= 0.35 and pumped
        assert fw.pan == 0 and fw.state == hl.STATE_IDLE
        assert any('Head park done' in str(x) for x in node.logs)
    finally:
        fw.stop()


def test_park_wait_gives_up_after_its_timeout():
    node, iface, fw = _homed(params={'head_park_timeout': 0.3}, move_s=5.0)
    try:
        fw.state, fw.pan = hl.STATE_IDLE, 9000
        time.sleep(0.05)
        t0 = time.monotonic()
        iface.shutdown(pump=lambda: None)
        assert time.monotonic() - t0 < 1.0
        assert any('Head park not confirmed' in str(x) for x in node.logs)
    finally:
        fw.stop()


# ---- nho goc PAN qua mat dien, HOME an toan -----------------------------------

def _memory(path):
    import json
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def test_auto_home_after_a_power_loss_far_left_turns_back_before_home(tmp_path):
    path = str(tmp_path / 'head_pan.json')
    node, iface, fw = make(params={'head_auto_home': True, 'head_pan_memory_file': path}, move_s=0.2)
    try:
        assert _wait(lambda: fw.state == hl.STATE_IDLE and len(_homes(fw)) == 1)
        assert run_goal(iface, FakeGoalHandle(mode=0, pan=135.0)).success
        assert _wait(lambda: (_memory(path) or {}).get('pan_deg') == 135.0)
        n = len(fw.sent)
        fw.reset_mcu()                                  # mat dien khi dau dang 135 do trai
        assert _wait(lambda: len(_homes(fw)) == 2 and fw.state == hl.STATE_IDLE, 5.0)
        after = [s.split(',', 2)[2] for s in fw.sent[n:]]
        assert after == ['ZERO', '-13500,0', 'HOME']
        assert _wait(lambda: _memory(path) == {'referenced': True, 'pan_deg': 0.0})
    finally:
        fw.stop()


def test_the_remembered_pan_stays_the_real_angle_while_turning_back(tmp_path):
    path = str(tmp_path / 'head_pan.json')
    node, iface, fw = make(params={'head_pan_memory_file': path})
    try:
        iface._pan_offset = 120.0                       # nhu ngay sau ZERO tam o 120 do trai
        run_goal(iface, FakeGoalHandle(mode=1))
        assert _wait(lambda: (_memory(path) or {}).get('pan_deg') == 120.0)
    finally:
        iface._pan_offset = 0.0
        fw.stop()


def test_auto_home_near_the_front_or_after_head_off_just_homes(tmp_path):
    path = str(tmp_path / 'head_pan.json')
    node, iface, fw = make(params={'head_auto_home': True, 'head_pan_memory_file': path}, move_s=0.1)
    try:
        assert _wait(lambda: fw.state == hl.STATE_IDLE and len(_homes(fw)) == 1)
        assert run_goal(iface, FakeGoalHandle(mode=0, pan=8.0)).success   # trong vung an toan
        assert _wait(lambda: (_memory(path) or {}).get('pan_deg') == 8.0)
        n = len(fw.sent)
        fw.reset_mcu()
        assert _wait(lambda: len(_homes(fw)) == 2 and fw.state == hl.STATE_IDLE)
        assert [s.split(',', 2)[2] for s in fw.sent[n:]] == ['HOME']
        # head/off: dau co the bi xoay tay -> khong con biet goc, khong dung goc cu.
        assert run_goal(iface, FakeGoalHandle(mode=0, pan=120.0)).success
        assert node.services['head/off'](None, SimpleNamespace()).success
        assert _wait(lambda: _memory(path) == {'referenced': False})
        n = len(fw.sent)
        fw.reset_mcu()
        assert _wait(lambda: len(_homes(fw)) == 3)
        assert [s.split(',', 2)[2] for s in fw.sent[n:]] == ['HOME']
    finally:
        fw.stop()


def test_a_manual_home_far_left_turns_to_the_front_first():
    node, iface, fw = _homed(move_s=0.1)
    try:
        assert run_goal(iface, FakeGoalHandle(mode=0, pan=135.0, tilt=10.0)).success
        n = len(fw.sent)
        r = run_goal(iface, FakeGoalHandle(mode=1))
        assert r.success and r.message == 'homed'
        assert [s.split(',', 2)[2] for s in fw.sent[n:]] == ['0,1000', 'HOME']
        r = run_goal(iface, FakeGoalHandle(mode=0, pan=-150.0))       # ben phai: HOME ngay
        n = len(fw.sent)
        assert run_goal(iface, FakeGoalHandle(mode=1)).success
        assert [s.split(',', 2)[2] for s in fw.sent[n:]] == ['HOME']
    finally:
        fw.stop()


def test_an_angle_that_is_not_a_number_is_rejected_without_a_command():
    node, iface, fw = _homed()
    try:
        n = len(fw.sent)
        gh = FakeGoalHandle(mode=0, pan=float('nan'))
        r = run_goal(iface, gh)
        assert gh.final == 'aborted' and r.message == 'rejected:invalid_angle'
        r = run_goal(iface, FakeGoalHandle(mode=0, pan=0.0, tilt=float('inf')))
        assert r.message == 'rejected:invalid_angle' and len(fw.sent) == n
    finally:
        fw.stop()


# ---- bien do quet theo POI (HeadSweep.amplitude_deg) --------------------------

def test_a_poi_amplitude_replaces_the_default_and_zero_keeps_it():
    node, iface, fw = _homed(move_s=0.1)
    try:
        resp = node.services['head/sweep'](SimpleNamespace(amplitude_deg=90.0), SimpleNamespace())
        assert resp.success
        assert _wait(lambda: not iface._sweep_thread.is_alive(), 5.0)
        assert _steps(fw) == ['STEP,150,0', 'STEP,-300,0', 'STEP,150,0']      # 90 do = 150 buoc 0.6 do
        assert node.services['head/sweep'](SimpleNamespace(amplitude_deg=0.0), SimpleNamespace()).success
        assert _wait(lambda: not iface._sweep_thread.is_alive(), 5.0)
        assert _steps(fw)[3:] == ['STEP,225,0', 'STEP,-450,0', 'STEP,225,0']   # 0 = head_sweep_deg (135)
    finally:
        fw.stop()


def test_a_negative_or_not_a_number_amplitude_is_refused():
    node, iface, fw = _homed()
    try:
        for bad in (-5.0, float('nan'), float('inf')):
            resp = node.services['head/sweep'](SimpleNamespace(amplitude_deg=bad), SimpleNamespace())
            assert not resp.success and resp.message == 'rejected:invalid_amplitude'
        assert _steps(fw) == []
    finally:
        fw.stop()
