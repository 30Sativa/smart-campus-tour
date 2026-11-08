"""Unit tests for route_test.py (no ROS needed; Nav2 is faked at the client boundary)."""
import json
import math
import os
import signal
import subprocess
import sys
import threading
import time
import types

import pytest
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import route_test as rt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
EXAMPLE = os.path.join(HERE, 'route.example.yaml')


def poi(poi_id, yaw=0.0, **over):
    z, w = rt.quat_from_yaw(yaw)
    data = {'id': poi_id, 'name': poi_id, 'map_yaml': 'map2.yaml', 'frame_id': 'map',
            'pose': {'x': 1.0, 'y': 2.0, 'yaw': yaw,
                     'quaternion': {'x': 0.0, 'y': 0.0, 'z': z, 'w': w}},
            'verified': False}
    data.update(over)
    return data


def write(tmp_path, name, data):
    p = tmp_path / name
    p.write_text(yaml.safe_dump(data), encoding='utf-8')
    return str(p)


def route_file(tmp_path, n_pois=3, **over):
    write(tmp_path, 'poi_start.yaml', poi('START'))
    entries = []
    for i in range(1, n_pois + 1):
        write(tmp_path, f'poi_{i}.yaml', poi(f'POI_{i}', yaw=0.5))
        entries.append({'poi_file': f'poi_{i}.yaml'})
    data = {'route_id': 'R1', 'map_yaml': 'map2.yaml', 'frame_id': 'map', 'default_dwell_s': 5,
            'start': {'poi_file': 'poi_start.yaml'}, 'pois': entries,
            'end_mode': 'return_to_start'}
    data.update(over)
    return write(tmp_path, 'route.yaml', {k: v for k, v in data.items() if v is not ...})


# ---------------------------------------------------------------- route + plan

def test_route_order_dwell_timeout(tmp_path):
    path = route_file(tmp_path, pois=[{'poi_file': 'poi_1.yaml', 'dwell_s': 0, 'timeout_s': 60},
                                      {'poi_file': 'poi_2.yaml'}])
    plan = rt.build_plan(rt.load_route(path))
    assert [leg['id'] for leg in plan['legs']] == ['POI_1', 'POI_2', 'END:START']
    assert [leg['dwell_s'] for leg in plan['legs']] == [0, 5, 0]
    assert rt.leg_timeout(plan['legs'][0], 300) == 60
    assert rt.leg_timeout(plan['legs'][1], 300) == 300


@pytest.mark.parametrize('n_pois, kw, ids, scope', [
    (3, {}, ['POI_1', 'POI_2', 'POI_3', 'END:START'], 'full_route'),
    (3, {'max_points': 1}, ['POI_1'], 'single_point'),
    (3, {'max_points': 2}, ['POI_1', 'POI_2'], 'partial'),
    (3, {'max_points': 1, 'with_end': True}, ['POI_1', 'END:START'], 'partial'),
    # --max-points phu du POI van bo chang ket thuc, nen chua phai full_route.
    (3, {'max_points': 3}, ['POI_1', 'POI_2', 'POI_3'], 'partial'),
    (3, {'max_points': 9}, ['POI_1', 'POI_2', 'POI_3'], 'partial'),
    (3, {'max_points': 3, 'with_end': True}, ['POI_1', 'POI_2', 'POI_3', 'END:START'],
     'full_route'),
    (1, {'max_points': 1}, ['POI_1'], 'single_point'),
])
def test_plan_max_points_with_end_scope(tmp_path, n_pois, kw, ids, scope):
    plan = rt.build_plan(rt.load_route(route_file(tmp_path, n_pois=n_pois)), **kw)
    assert [leg['id'] for leg in plan['legs']] == ids
    assert plan['scope'] == scope
    assert [leg['index'] for leg in plan['legs']] == list(range(1, len(ids) + 1))


def test_end_mode_none_is_full_without_end_leg(tmp_path):
    plan = rt.build_plan(rt.load_route(route_file(tmp_path, end_mode='none')))
    assert [leg['kind'] for leg in plan['legs']] == ['poi', 'poi', 'poi']
    assert plan['scope'] == 'full_route'


@pytest.mark.parametrize('over, msg', [
    ({'route_id': ...}, 'route_id'),
    ({'map_yaml': ...}, 'map_yaml'),
    ({'frame_id': ...}, 'frame_id'),
    ({'end_mode': ...}, 'end_mode'),
    ({'end_mode': 'goto'}, 'end_mode'),
    ({'pois': []}, 'pois'),
    ({'start': ...}, 'poi_file'),
    ({'start': {'poi_file': 'poi_start.yaml', 'dwell_s': 3}}, 'dwell_s'),
    ({'revision': 3}, 'revision'),
    ({'default_dwell_s': -1}, 'default_dwell_s'),
    ({'end_timeout_s': 0}, 'end_timeout_s'),
    ({'end_timeout_s': 'abc'}, 'end_timeout_s'),
    ({'end_mode': 'none', 'end_timeout_s': 600}, 'end_timeout_s'),
    ({'default_dwell_s': '.nan'}, 'default_dwell_s'),
    ({'default_dwell_s': True}, 'default_dwell_s'),
    # Khong co duong nao khai bao toa do truc tiep trong file tuyen.
    ({'pois': [{'id': 'X', 'x': 1.0, 'y': 2.0, 'yaw': 0.0}]}, 'poi_file'),
    ({'pois': [{'poi_file': 'poi_1.yaml', 'x': 1.0}]}, r"\['x'\]"),
    ({'pois': [{'poi_file': 'poi_1.yaml', 'dwell': 30}]}, 'dwell'),
    ({'pois': [{'poi_file': 'poi_1.yaml', 'dwell_s': -1}]}, 'dwell_s'),
    ({'pois': [{'poi_file': 'poi_1.yaml', 'dwell_s': 'abc'}]}, 'dwell_s'),
    ({'pois': [{'poi_file': 'poi_1.yaml', 'timeout_s': 0}]}, 'timeout_s'),
    ({'pois': [{'poi_file': 'missing.yaml'}]}, 'missing.yaml'),
    ({'pois': [{'poi_file': 'poi_1.yaml'}, {'poi_file': 'poi_1.yaml'}]}, 'trung'),
    ({'pois': [{'poi_file': 'poi_start.yaml'}]}, 'trung'),
])
def test_invalid_routes_rejected(tmp_path, over, msg):
    with pytest.raises(rt.RouteError, match=msg):
        rt.load_route(route_file(tmp_path, **over))


def good_quat(yaw=0.0):
    return poi('X', yaw)['pose']['quaternion']


@pytest.mark.parametrize('bad, msg', [
    (poi('P', map_yaml='map1.yaml'), 'map1.yaml'),
    ({k: v for k, v in poi('P').items() if k != 'map_yaml'}, 'None'),
    (poi('P', frame_id='odom'), 'odom'),
    ({k: v for k, v in poi('P').items() if k != 'id'}, 'id'),
    (poi('P', pose=None), 'pose'),
    (poi('P', pose={'x': 1.0, 'y': 2.0, 'yaw': 0.0}), 'quaternion'),
    (poi('P', pose={'x': 1.0, 'y': 2.0, 'yaw': 0.5, 'quaternion': good_quat(-0.5)}), 'lech'),
    (poi('P', pose={'x': float('nan'), 'y': 2.0, 'yaw': 0.0, 'quaternion': good_quat()}), 'x'),
    (poi('P', pose={'x': 'abc', 'y': 2.0, 'yaw': 0.0, 'quaternion': good_quat()}), 'x'),
    (poi('P', pose={'y': 2.0, 'yaw': 0.0, 'quaternion': good_quat()}), 'x'),
    (poi('P', pose={'x': 1.0, 'y': 2.0, 'yaw': 0.0,
                    'quaternion': {'x': 0.0, 'y': 0.0, 'z': 0.0, 'w': 2.0}}), 'chuan hoa'),
    (poi('P', pose={'x': 1.0, 'y': 2.0, 'yaw': 0.0,
                    'quaternion': {'x': 1.0, 'y': 0.0, 'z': 0.0, 'w': 0.0}}), '2D'),
])
def test_bad_poi_file_rejected(tmp_path, bad, msg):
    write(tmp_path, 'bad.yaml', bad)
    path = route_file(tmp_path, pois=[{'poi_file': 'bad.yaml'}])
    with pytest.raises(rt.RouteError, match=msg):
        rt.load_route(path)


def test_broken_yaml_is_route_error(tmp_path):
    p = tmp_path / 'r.yaml'
    p.write_text('route_id: [unclosed', encoding='utf-8')
    with pytest.raises(rt.RouteError):
        rt.load_route(str(p))


def test_example_route_loads_against_repo_pois():
    plan = rt.build_plan(rt.load_route(EXAMPLE))
    assert [leg['id'] for leg in plan['legs']] == ['POI_01', 'POI_02', 'POI_03', 'END:START']
    assert plan['legs'][0]['x'] == 8.164 and plan['legs'][-1]['x'] == -0.319
    assert plan['legs'][2]['x'] == 42.460 and plan['scope'] == 'full_route'
    assert rt.leg_timeout(plan['legs'][-1], 300) == 600
    assert rt.leg_timeout(plan['legs'][0], 300) == 300


def test_end_timeout_applies_to_end_leg_only(tmp_path):
    route = rt.load_route(route_file(tmp_path, end_timeout_s=450))
    assert route['end']['timeout_s'] == 450 and 'timeout_s' not in route['start']


def test_pose_error_wraps_angle():
    dxy, dyaw = rt.pose_error({'x': 0, 'y': 0, 'yaw': math.pi - 0.05},
                              {'x': 0.3, 'y': 0.4, 'yaw': -math.pi + 0.05})
    assert abs(dxy - 0.5) < 1e-9 and abs(dyaw - math.degrees(0.1)) < 1e-6


def test_quat_roundtrip():
    for yaw in (-3.0, -1.37, 0.0, 0.077, 2.5):
        z, w = rt.quat_from_yaw(yaw)
        assert abs(rt.yaw_from_quat(z, w) - yaw) < 1e-9


# ---------------------------------------------------------------- CLI

def test_dry_run_never_imports_ros_or_writes_log(tmp_path, capsys, monkeypatch):
    monkeypatch.setitem(sys.modules, 'rclpy', None)  # import rclpy -> ImportError
    monkeypatch.setenv('AMR_RUN_DIR', str(tmp_path / 'logs'))
    assert rt.main([EXAMPLE, '--dry-run']) == 0
    assert 'full_route' in capsys.readouterr().out
    assert not (tmp_path / 'logs').exists()


@pytest.mark.parametrize('extra', [['--max-points', '0'], ['--max-points', '-1'],
                                   ['--leg-timeout', '0'], ['--leg-timeout', 'nan']])
def test_bad_cli_values_exit_2(extra):
    assert rt.main([EXAMPLE, '--dry-run', *extra]) == 2


def test_bad_route_exit_2_without_touching_ros(tmp_path, monkeypatch):
    monkeypatch.setitem(sys.modules, 'rclpy', None)
    assert rt.main([route_file(tmp_path, pois=[{'poi_file': 'missing.yaml'}])]) == 2


def test_no_ros_environment_exit_1(tmp_path, monkeypatch):
    monkeypatch.setitem(sys.modules, 'rclpy', None)
    assert rt.main([EXAMPLE, '--no-confirm', '--log-dir', str(tmp_path)]) == 1


def test_exit_codes():
    assert rt.exit_code_for(None) == 0
    assert rt.exit_code_for('user_stop') == 130
    assert rt.exit_code_for('user_exit_before_start') == 130
    assert rt.exit_code_for('nav2_unavailable') == 1
    assert rt.exit_code_for('leg_failed:POI_1:ABORTED') == 1


# ---------------------------------------------------------------- log

def test_each_run_gets_a_new_dir(tmp_path, monkeypatch):
    monkeypatch.setenv('HOME', str(tmp_path))
    monkeypatch.setenv('USERPROFILE', str(tmp_path))
    monkeypatch.delenv('AMR_RUN_DIR', raising=False)
    a, b = rt.make_run_dir(None, 'R/1'), rt.make_run_dir(None, 'R/1')
    assert a != b
    assert os.path.dirname(a) == os.path.join(str(tmp_path), 'amr_logs', 'runs')
    assert '_route_R_1_' in os.path.basename(a)

    session = tmp_path / 'session'
    monkeypatch.setenv('AMR_RUN_DIR', str(session))
    c, d = rt.make_run_dir(None, 'R1'), rt.make_run_dir(None, 'R1')
    assert c != d and os.path.dirname(c) == str(session)
    assert os.path.dirname(rt.make_run_dir(str(tmp_path / 'x'), 'R1')) == str(tmp_path / 'x')


def test_run_log_writes_jsonl_and_summary(tmp_path):
    log = rt.RunLog(str(tmp_path))
    log.event('run_start', route_id='Tuyến')
    log.event('run_end', completed=False)
    log.write_summary({'completed': False})
    log.close()
    lines = (tmp_path / 'events.jsonl').read_text(encoding='utf-8').splitlines()
    assert [json.loads(line)['event'] for line in lines] == ['run_start', 'run_end']
    assert json.loads(lines[0])['route_id'] == 'Tuyến'
    assert json.loads((tmp_path / 'summary.json').read_text(encoding='utf-8')) == {'completed': False}


# ---------------------------------------------------------------- Nav2 fake

class FakeFuture:
    def __init__(self):
        self._done = threading.Event()
        self._value = None
        self._exc = None
        self._cbs = []

    def set_result(self, value):
        self._value = value
        self._done.set()
        for cb in self._cbs:
            cb(self)

    def set_exception(self, exc):
        self._exc = exc
        self.set_result(None)

    def done(self):
        return self._done.is_set()

    def result(self):
        if self._exc is not None:
            raise self._exc
        return self._value

    def add_done_callback(self, cb):
        if self.done():
            cb(self)
        else:
            self._cbs.append(cb)


def done_future(value):
    f = FakeFuture()
    f.set_result(value)
    return f


class FakeHandle:
    accepted = True

    def __init__(self, result_status=None, on_cancel=5, cancel_raises=False):
        self.result_future = FakeFuture()
        self.cancel_calls = 0
        self.on_cancel = on_cancel  # status Nav2 tra sau cancel; None = khong bao gio tra
        self.cancel_raises = cancel_raises
        if result_status is not None:
            self.finish(result_status)

    def finish(self, status):
        self.result_future.set_result(types.SimpleNamespace(status=status))

    def get_result_async(self):
        return self.result_future

    def cancel_goal_async(self):
        self.cancel_calls += 1
        if self.cancel_raises:
            raise RuntimeError('context invalid')
        if self.on_cancel is not None and not self.result_future.done():
            self.finish(self.on_cancel)
        return done_future(types.SimpleNamespace(goals_canceling=[1]))


class FakeClient:
    """Moi send_goal_async tra mot handle/future da kich ban, ghi lai goal da gui."""

    def __init__(self, *scripted):
        self.scripted = list(scripted)
        self.sent = []

    def send_goal_async(self, goal, feedback_callback=None):
        self.sent.append(goal)
        item = self.scripted.pop(0)
        if feedback_callback is not None:
            feedback_callback(types.SimpleNamespace(feedback=types.SimpleNamespace(
                number_of_recoveries=2, distance_remaining=0.1)))
        return item if isinstance(item, FakeFuture) else done_future(item)


def make_runner(client, pose=None):
    logs = []
    runner = rt.Nav2GoalRunner(client, lambda target: target, lambda: pose, logs.append)
    return runner, logs


TARGET = {'id': 'P', 'x': 1.0, 'y': 2.0, 'yaw': 0.0}


@pytest.fixture(autouse=True)
def fast_timeouts(monkeypatch):
    for name, value in (('ACCEPT_TIMEOUT_S', 0.05), ('LATE_ACCEPT_WAIT_S', 1.0),
                        ('CANCEL_ACK_TIMEOUT_S', 0.05), ('CANCEL_RESULT_TIMEOUT_S', 0.05)):
        monkeypatch.setattr(rt, name, value)


def test_goal_succeeds_with_error_measured():
    handle = FakeHandle(result_status=4)
    runner, _ = make_runner(FakeClient(handle), pose={'x': 1.3, 'y': 2.4, 'yaw': math.radians(10)})
    rec = runner.execute(TARGET, 5.0, threading.Event())
    assert rec['outcome'] == 'SUCCEEDED' and rec['nav_status'] == 4
    assert rec['cancel_confirmed'] is None and handle.cancel_calls == 0
    assert rec['error_xy_m'] == 0.5 and rec['error_yaw_deg'] == 10.0
    assert rec['number_of_recoveries'] == 2
    assert runner.active is None


def test_aborted_goal_is_reported_without_cancel():
    handle = FakeHandle(result_status=6)
    runner, _ = make_runner(FakeClient(handle))
    rec = runner.execute(TARGET, 5.0, threading.Event())
    assert rec['outcome'] == 'ABORTED' and handle.cancel_calls == 0
    assert rec['final_pose'] is None and 'error_xy_m' not in rec


def test_rejected_goal():
    runner, _ = make_runner(FakeClient(types.SimpleNamespace(accepted=False)))
    assert runner.execute(TARGET, 5.0, threading.Event())['outcome'] == 'REJECTED'


def test_timeout_cancels_and_confirms():
    handle = FakeHandle()
    runner, logs = make_runner(FakeClient(handle))
    rec = runner.execute(TARGET, 0.05, threading.Event())
    assert rec['outcome'] == 'TIMEOUT' and handle.cancel_calls == 1
    assert rec['nav_status'] == 5 and rec['cancel_confirmed'] is True
    assert runner.active is None
    assert not any('E-STOP' in line for line in logs)


def test_user_stop_cancels_and_confirms():
    handle = FakeHandle()
    runner, _ = make_runner(FakeClient(handle))
    stop = threading.Event()
    stop.set()
    rec = runner.execute(TARGET, 60.0, stop)
    assert rec['outcome'] == 'USER_STOP' and handle.cancel_calls == 1
    assert rec['cancel_confirmed'] is True


def test_goal_finishing_during_cancel_counts_as_ended():
    handle = FakeHandle(on_cancel=4)
    runner, _ = make_runner(FakeClient(handle))
    rec = runner.execute(TARGET, 0.05, threading.Event())
    assert rec['outcome'] == 'TIMEOUT' and rec['nav_status'] == 4
    assert rec['cancel_confirmed'] is True


def test_cancel_without_result_warns_estop():
    handle = FakeHandle(on_cancel=None)
    runner, logs = make_runner(FakeClient(handle))
    rec = runner.execute(TARGET, 0.05, threading.Event())
    assert rec['outcome'] == 'TIMEOUT' and rec['cancel_confirmed'] is False
    assert rec['nav_status'] is None
    assert any('DÙNG E-STOP' in line for line in logs)
    assert runner.active is not None  # lop ngoai con thay goal chua ket thuc


def test_cancel_call_raising_warns_estop():
    handle = FakeHandle(cancel_raises=True)
    runner, logs = make_runner(FakeClient(handle))
    rec = runner.execute(TARGET, 0.05, threading.Event())
    assert rec['cancel_confirmed'] is False
    assert any('DÙNG E-STOP' in line for line in logs)


def test_unexpected_exception_with_active_goal_cancels(monkeypatch):
    handle = FakeHandle()
    runner, _ = make_runner(FakeClient(handle))
    real_wait = rt.wait_future
    calls = []

    def wait_raises_on_result(future, timeout=None, stop_event=None):
        calls.append(future)
        if len(calls) == 2:  # lan doi result dau tien, goal dang chay
            raise RuntimeError('boom')
        return real_wait(future, timeout, stop_event)

    monkeypatch.setattr(rt, 'wait_future', wait_raises_on_result)
    rec = runner.execute(TARGET, 5.0, threading.Event())
    assert rec['outcome'] == 'ERROR' and 'boom' in rec['error']
    assert handle.cancel_calls == 1 and rec['cancel_confirmed'] is True


def test_late_accept_is_cancelled_immediately():
    pending = FakeFuture()
    handle = FakeHandle()
    runner, _ = make_runner(FakeClient(pending))
    timer = threading.Timer(0.4, pending.set_result, args=(handle,))  # sau ACCEPT_TIMEOUT_S
    timer.start()
    rec = runner.execute(TARGET, 60.0, threading.Event())
    timer.join()
    assert rec['outcome'] == 'ACCEPT_TIMEOUT' and handle.cancel_calls == 1
    assert rec['cancel_confirmed'] is True and runner.active is None


def test_never_accepted_warns_estop():
    runner, logs = make_runner(FakeClient(FakeFuture()))
    rec = runner.execute(TARGET, 60.0, threading.Event())
    assert rec['outcome'] == 'ACCEPT_TIMEOUT' and rec['cancel_confirmed'] is False
    assert any('DÙNG E-STOP' in line for line in logs)


def test_late_rejection_needs_no_cancel():
    pending = FakeFuture()
    runner, logs = make_runner(FakeClient(pending))
    timer = threading.Timer(0.4, pending.set_result,
                            args=(types.SimpleNamespace(accepted=False),))
    timer.start()
    rec = runner.execute(TARGET, 60.0, threading.Event())
    timer.join()
    assert rec['outcome'] == 'ACCEPT_TIMEOUT' and rec['cancel_confirmed'] is None
    assert not any('E-STOP' in line for line in logs)


# ---------------------------------------------------------------- route loop

class MemLog:
    def __init__(self):
        self.events = []

    def event(self, name, **data):
        self.events.append((name, data))

    def names(self):
        return [name for name, _ in self.events]


def script(outcomes, on_execute=None):
    """Thay Nav2GoalRunner.execute: tra outcome theo kich ban, ghi leg da gui."""
    sent = []

    def execute(leg, _timeout, stop_event):
        sent.append(leg['id'])
        if on_execute is not None:
            on_execute(leg, stop_event)
        return {'outcome': outcomes[len(sent) - 1], 'nav_s': 1.0, 'cancel_confirmed': None,
                'number_of_recoveries': 0}
    return execute, sent


def plan_for(tmp_path, dwell=0.01, **kw):
    return rt.build_plan(rt.load_route(route_file(tmp_path, default_dwell_s=dwell)), **kw)


def run_loop(plan, execute, stop=None):
    log, legs = MemLog(), []
    reason = rt.run_legs(plan, execute, log, stop or threading.Event(), lambda _m: None,
                         300.0, legs)
    return reason, legs, log


def test_full_route_runs_in_order(tmp_path):
    execute, sent = script(['SUCCEEDED'] * 4)
    plan = plan_for(tmp_path)
    reason, legs, log = run_loop(plan, execute)
    assert reason is None
    assert sent == ['POI_1', 'POI_2', 'POI_3', 'END:START']
    assert log.names() == ['leg_start', 'leg_end', 'dwell_end'] * 3 + ['leg_start', 'leg_end']
    summary = rt.summarize({'route_id': 'R', 'map_yaml': 'm', 'end_mode': 'return_to_start'},
                           plan, legs, reason, 10.0)
    assert summary['completed'] is True and summary['scope'] == 'full_route'
    assert summary['total_nav_s'] == 4.0 and summary['total_dwell_s'] > 0


@pytest.mark.parametrize('failure', ['ABORTED', 'REJECTED', 'TIMEOUT', 'ACCEPT_TIMEOUT', 'ERROR'])
def test_failed_leg_stops_chain(tmp_path, failure):
    execute, sent = script(['SUCCEEDED', failure, 'SUCCEEDED', 'SUCCEEDED'])
    plan = plan_for(tmp_path)
    reason, legs, log = run_loop(plan, execute)
    assert sent == ['POI_1', 'POI_2']  # khong gui diem tiep, khong chay chang ket thuc
    assert reason == f'leg_failed:POI_2:{failure}'
    assert rt.exit_code_for(reason) == 1
    assert log.names()[-1] == 'leg_end'
    # Ke hoach full nhung bi dung giua chung thi khong duoc ghi full_route.
    summary = rt.summarize({'route_id': 'R', 'map_yaml': 'm', 'end_mode': 'return_to_start'},
                           plan, legs, reason, 10.0)
    assert summary['completed'] is False
    assert summary['scope'] == 'partial' and summary['planned_scope'] == 'full_route'


def test_user_stop_during_leg(tmp_path):
    stop = threading.Event()
    execute, sent = script(['USER_STOP'], on_execute=lambda _l, s: s.set())
    reason, _, _ = run_loop(plan_for(tmp_path), execute, stop)
    assert sent == ['POI_1'] and reason == 'user_stop' and rt.exit_code_for(reason) == 130


def test_rejected_after_ctrl_c_counts_as_user_stop(tmp_path):
    stop = threading.Event()
    execute, _ = script(['REJECTED'], on_execute=lambda _l, s: s.set())
    assert run_loop(plan_for(tmp_path), execute, stop)[0] == 'user_stop'


def test_ctrl_c_during_dwell_stops_chain(tmp_path):
    stop = threading.Event()
    timer = threading.Timer(0.05, stop.set)
    execute, sent = script(['SUCCEEDED'] * 4, on_execute=lambda _l, _s: timer.start())
    reason, legs, log = run_loop(plan_for(tmp_path, dwell=30), execute, stop)
    assert sent == ['POI_1'] and reason == 'user_stop'
    dwell = dict(log.events)['dwell_end']
    assert dwell['interrupted'] is True and dwell['dwell_actual_s'] < 5
    assert legs[0]['dwell_actual_s'] < 5


def test_next_goal_waits_for_dwell(tmp_path):
    stamps = []
    execute, _ = script(['SUCCEEDED'] * 4,
                        on_execute=lambda _l, _s: stamps.append(rt.time.monotonic()))
    run_loop(plan_for(tmp_path, dwell=0.1), execute)
    assert stamps[1] - stamps[0] >= 0.09


def test_partial_plan_scope_is_kept_on_success(tmp_path):
    plan = plan_for(tmp_path, max_points=1)
    execute, _ = script(['SUCCEEDED'])
    reason, legs, _ = run_loop(plan, execute)
    summary = rt.summarize({'route_id': 'R', 'map_yaml': 'm', 'end_mode': 'return_to_start'},
                           plan, legs, reason, 1.0)
    assert summary['completed'] is True and summary['scope'] == 'single_point'


# ---------------------------------------------------------------- end-to-end, tin hieu that

# ROS duoc thay bang stub o muc module; tien trinh, signal handler va thread spin la that.
STUB_DRIVER = r'''
import os, signal, sys, time, types
sys.path.insert(0, sys.argv.pop(1))
import route_test as rt
import test_route_test as t

MODE = os.environ['FAKE_NAV2']
BRIDGE = os.environ.get('FAKE_BRIDGE', 'telemetry')
ACTIVE_GOAL = os.environ.get('FAKE_ACTIVE_GOAL') == '1'
rt.CANCEL_ACK_TIMEOUT_S = rt.CANCEL_RESULT_TIMEOUT_S = float(os.environ['FAKE_CANCEL_WAIT'])
signal.signal(signal.SIGINT, signal.default_int_handler)
NS = types.SimpleNamespace


def module(name, **attrs):
    mod = types.ModuleType(name)
    mod.__dict__.update(attrs)
    sys.modules[name] = mod


class ActionClient:
    def __init__(self, _node, _action, _name):
        pass

    def wait_for_server(self, timeout_sec=None):
        return MODE != 'no_server'

    def send_goal_async(self, _goal, feedback_callback=None):
        print('GOAL_SENT', flush=True)
        if MODE == 'succeed':
            return t.done_future(t.FakeHandle(result_status=4))
        return t.done_future(t.FakeHandle(on_cancel=None if MODE == 'ignore_cancel' else 5))


def init(signal_handler_options=None):
    assert signal_handler_options == 'NO'


class Executor:
    def add_node(self, _node):
        pass

    def spin_once(self, timeout_sec=None):
        time.sleep(timeout_sec)


class Buffer:
    def lookup_transform(self, *_a, **_k):
        return NS(transform=NS(translation=NS(x=1.0, y=2.0), rotation=NS(x=0, y=0, z=0, w=1)))


def goal():
    return NS(pose=NS(header=NS(), pose=NS(position=NS(), orientation=NS())))


class ParamClient:
    def wait_for_service(self, timeout_sec=None):
        return BRIDGE != 'absent'

    def call_async(self, _request):
        return t.done_future(NS(values=[NS(type=1, bool_value=BRIDGE == 'commands')]))


def create_subscription(_type, _topic, callback, _qos):
    callback(NS(status_list=[NS(status=2)] if ACTIVE_GOAL else []))


node = NS(get_clock=lambda: NS(now=lambda: NS(to_msg=lambda: None)), destroy_node=lambda: None,
          create_client=lambda _type, _name: ParamClient(), destroy_client=lambda _c: None,
          create_subscription=create_subscription, destroy_subscription=lambda _s: None)
module('rclpy', init=init, create_node=lambda _n: node, ok=lambda: True, shutdown=lambda: None)
module('rclpy.action', ActionClient=ActionClient)
module('rclpy.duration', Duration=lambda seconds: seconds)
module('rclpy.executors', SingleThreadedExecutor=Executor)
module('rclpy.qos', QoSProfile=lambda **_k: None, ReliabilityPolicy=NS(RELIABLE=1), DurabilityPolicy=NS(TRANSIENT_LOCAL=1))
module('action_msgs')
module('action_msgs.msg', GoalStatusArray=object)
module('rcl_interfaces')
module('rcl_interfaces.srv', GetParameters=NS(Request=lambda: NS()))
module('rclpy.signals', SignalHandlerOptions=NS(NO='NO'))
module('rclpy.time', Time=lambda: None)
module('nav2_msgs', action=None)
module('nav2_msgs.action', NavigateToPose=NS(Goal=goal))
module('tf2_ros', Buffer=Buffer, TransformListener=lambda _b, _n: None)
sys.exit(rt.main(sys.argv[1:]))
'''

needs_posix = pytest.mark.skipif(os.name == 'nt', reason='can tin hieu POSIX')


def start_stubbed(tmp_path, mode, route, *args, cancel_wait=0.3, bridge='telemetry', active_goal=False):
    env = dict(os.environ, FAKE_NAV2=mode, FAKE_CANCEL_WAIT=str(cancel_wait), PYTHONUTF8='1',
               FAKE_BRIDGE=bridge, FAKE_ACTIVE_GOAL='1' if active_goal else '0')
    return subprocess.Popen(
        [sys.executable, '-B', '-c', STUB_DRIVER, HERE, route, '--log-dir', str(tmp_path / 'logs'),
         *args], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)


def read_until(proc, marker):
    seen = b''
    while marker not in seen:
        ch = proc.stdout.read(1)
        assert ch, f'tien trinh thoat truoc khi in {marker!r}: {seen!r}'
        seen += ch
    return seen.decode('utf-8', 'replace')


def finish(proc, tmp_path):
    out = proc.communicate(timeout=20)[0].decode('utf-8', 'replace')
    run_dir = next((tmp_path / 'logs').iterdir())
    summary = json.loads((run_dir / 'summary.json').read_text(encoding='utf-8'))
    events = [json.loads(line) for line in
              (run_dir / 'events.jsonl').read_text(encoding='utf-8').splitlines()]
    return proc.returncode, out, summary, events, run_dir


def test_command_bridge_service_follows_the_action_namespace():
    assert rt.command_bridge_service('/robot_01/navigate_to_pose') == '/robot_01/fleet_bridge/get_parameters'
    assert rt.command_bridge_service('/navigate_to_pose') == '/fleet_bridge/get_parameters'


def test_bridge_refusal_rules():
    assert rt.bridge_start_refusal(False, 0, False) is None
    assert rt.bridge_start_refusal(None, 0, True) is None
    assert 'commands_enabled' in rt.bridge_start_refusal(True, 0, False)
    assert 'commands_enabled' in rt.bridge_start_refusal(True, 0, True)
    assert '--no-command-bridge' in rt.bridge_start_refusal(None, 0, False)
    assert 'goal' in rt.bridge_start_refusal(False, 2, False)
    assert 'goal' in rt.bridge_start_refusal(None, 1, True)


@needs_posix
def test_e2e_refuses_while_the_bridge_takes_commands(tmp_path):
    proc = start_stubbed(tmp_path, 'succeed', route_file(tmp_path), '--no-confirm', '--no-command-bridge',
                         bridge='commands')
    code, out, summary, _, _ = finish(proc, tmp_path)
    assert code == 1 and 'GOAL_SENT' not in out and 'commands_enabled' in out
    assert summary['stop_reason'] == 'command_bridge_guard'


@needs_posix
def test_e2e_refuses_when_the_bridge_cannot_be_asked(tmp_path):
    proc = start_stubbed(tmp_path, 'succeed', route_file(tmp_path), '--no-confirm', bridge='absent')
    code, out, summary, _, _ = finish(proc, tmp_path)
    assert code == 1 and 'GOAL_SENT' not in out and summary['stop_reason'] == 'command_bridge_guard'


@needs_posix
def test_e2e_operator_can_declare_there_is_no_bridge(tmp_path):
    proc = start_stubbed(tmp_path, 'succeed', route_file(tmp_path, n_pois=1, default_dwell_s=0.01),
                         '--no-confirm', '--no-command-bridge', bridge='absent')
    code, out, _, _, _ = finish(proc, tmp_path)
    assert code == 0 and 'GOAL_SENT' in out


@needs_posix
def test_e2e_refuses_while_a_goal_is_active(tmp_path):
    proc = start_stubbed(tmp_path, 'succeed', route_file(tmp_path), '--no-confirm', active_goal=True)
    code, out, summary, _, _ = finish(proc, tmp_path)
    assert code == 1 and 'GOAL_SENT' not in out and summary['stop_reason'] == 'command_bridge_guard'


@needs_posix
def test_e2e_full_route_logs(tmp_path):
    proc = start_stubbed(tmp_path, 'succeed', route_file(tmp_path, n_pois=2, default_dwell_s=0.01),
                         '--no-confirm')
    code, out, summary, events, run_dir = finish(proc, tmp_path)
    assert code == 0 and out.count('GOAL_SENT') == 3
    assert summary['completed'] is True and summary['scope'] == 'full_route'
    assert summary['stop_reason'] is None and summary['goal_may_still_run'] is False
    assert [e['event'] for e in events] == ['run_start', 'leg_start', 'leg_end', 'dwell_end',
                                            'leg_start', 'leg_end', 'dwell_end',
                                            'leg_start', 'leg_end', 'run_end']
    assert events[0]['dist_to_start_m'] == 0.0 and events[0]['planned_scope'] == 'full_route'
    assert events[2]['outcome'] == 'SUCCEEDED' and events[2]['final_pose']['x'] == 1.0
    assert (run_dir / 'route_snapshot.yaml').exists()


@needs_posix
@pytest.mark.parametrize('sig', ['SIGINT', 'SIGTERM', 'SIGHUP'])
def test_e2e_signal_cancels_goal_and_stops_chain(tmp_path, sig):
    proc = start_stubbed(tmp_path, 'hang', route_file(tmp_path), '--no-confirm')
    read_until(proc, b'GOAL_SENT')
    proc.send_signal(getattr(signal, sig))
    code, out, summary, events, _ = finish(proc, tmp_path)
    assert code == 130 and 'GOAL_SENT' not in out and 'E-STOP' not in out
    assert summary['stop_reason'] == 'user_stop' and summary['completed'] is False
    assert summary['scope'] == 'partial' and summary['goal_may_still_run'] is False
    leg_end = next(e for e in events if e['event'] == 'leg_end')
    assert leg_end['outcome'] == 'USER_STOP' and leg_end['cancel_confirmed'] is True
    assert leg_end['nav_status'] == 5


@needs_posix
def test_e2e_unconfirmed_cancel_warns_estop(tmp_path):
    proc = start_stubbed(tmp_path, 'ignore_cancel', route_file(tmp_path), '--no-confirm')
    read_until(proc, b'GOAL_SENT')
    proc.send_signal(signal.SIGINT)
    code, out, summary, events, _ = finish(proc, tmp_path)
    assert code == 130 and 'DÙNG E-STOP' in out
    assert summary['goal_may_still_run'] is True
    assert next(e for e in events if e['event'] == 'leg_end')['cancel_confirmed'] is False


@needs_posix
def test_e2e_second_ctrl_c_exits_now_with_warning(tmp_path):
    proc = start_stubbed(tmp_path, 'ignore_cancel', route_file(tmp_path), '--no-confirm',
                         cancel_wait=60)
    read_until(proc, b'GOAL_SENT')
    proc.send_signal(signal.SIGINT)
    read_until(proc, b'Dang huy goal')
    t0 = time.monotonic()
    proc.send_signal(signal.SIGINT)
    code, out, summary, events, _ = finish(proc, tmp_path)
    assert time.monotonic() - t0 < 10
    assert code == 130 and 'CO THE VAN CHAY' in out
    assert summary['stop_reason'] == 'forced_exit' and summary['goal_may_still_run'] is True
    assert events[-1]['event'] == 'run_end'


@needs_posix
def test_e2e_ctrl_c_at_prompt_sends_no_goal(tmp_path):
    proc = start_stubbed(tmp_path, 'hang', route_file(tmp_path))
    read_until(proc, b'Enter de chay')
    proc.send_signal(signal.SIGINT)
    code, out, summary, _, _ = finish(proc, tmp_path)
    assert code == 130 and 'GOAL_SENT' not in out
    assert summary['stop_reason'] == 'user_exit_before_start' and summary['legs_done'] == 0


@needs_posix
def test_e2e_nav2_missing_exit_1_no_goal(tmp_path):
    proc = start_stubbed(tmp_path, 'no_server', route_file(tmp_path), '--no-confirm')
    code, out, summary, events, _ = finish(proc, tmp_path)
    assert code == 1 and 'GOAL_SENT' not in out
    assert summary['stop_reason'] == 'nav2_unavailable' and summary['completed'] is False
    assert [e['event'] for e in events] == ['run_start', 'run_end']
    assert events[0]['nav2_available'] is False
