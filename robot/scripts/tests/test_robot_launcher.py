"""robot launcher, offline. A fake robot root (.env on domain 77), fake installs and a fake
/proc; real ROS processes are never started and nothing joins domain 30.
--dry-run and status only build the environment (bash + source-minipc) and read files."""
import json
import shutil
from pathlib import Path
import os
import signal
import subprocess
import sys
import time

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROBOT = os.path.join(HERE, '..', 'robot')
pytestmark = pytest.mark.skipif(not os.path.isfile('/opt/ros/humble/setup.bash'),
                                reason='source-minipc sources ROS 2 Humble')


def fake_prefix(root, packages):
    for pkg in packages:
        d = root / 'share' / 'ament_index' / 'resource_index' / 'packages'
        d.mkdir(parents=True, exist_ok=True)
        (d / pkg).write_text('')
    return root


def write_setup(install, prefix, extra=''):
    install.mkdir(parents=True, exist_ok=True)
    (install / 'setup.bash').write_text(f'export AMENT_PREFIX_PATH="{prefix}${{AMENT_PREFIX_PATH:+:$AMENT_PREFIX_PATH}}"\n{extra}')


@pytest.fixture
def world(tmp_path):
    root = tmp_path / 'robot_root'
    (root / 'robot_maps').mkdir(parents=True)
    (root / 'robot_maps' / 'map2.yaml').write_text('image: map_fix.pgm\n')
    cfg = root / 'ros2_ws' / 'src' / 'robot_control' / 'config'
    cfg.mkdir(parents=True)
    (cfg / 'nav2_params_v2.yaml').write_text('{}\n')
    (root / '.env').write_text('ROS_DOMAIN_ID=77\nRMW_IMPLEMENTATION=rmw_fastrtps_cpp\n'
                               'ROS_DISCOVERY_SERVER=127.0.0.1:11811\nROS_LOCALHOST_ONLY=1\n')
    base = fake_prefix(root / 'ros2_ws' / 'install' / 'base', ['stm32_bridge', 'robot_control', 'robot_description',
                                                                'robot_navigation'])
    write_setup(root / 'ros2_ws' / 'install', base)
    overlay = tmp_path / 'overlay' / 'install'
    write_setup(overlay, fake_prefix(overlay / 'nav', ['robot_control', 'robot_navigation', 'robot_nav_plugins']))
    proc = tmp_path / 'proc'
    proc.mkdir()
    w = dict(tmp=tmp_path, root=root, overlay=overlay, proc=proc, profile=tmp_path / 'runtime.env',
             state=tmp_path / 'state', logs=tmp_path / 'runs')
    profile(w)
    return w


def profile(w, **over):
    values = dict(SCT_ROBOT_ROOT=w['root'], SCT_OVERLAY=w['overlay'], ROBOT_ID='robot_01', LIDAR_YAW='-3.0695',
                  LIDAR_YAW_CANDIDATE='3.1241', SCT_LOG_ROOT=w['logs'], MIN_FREE_GB='0')
    values.update(over)
    w['profile'].write_text(''.join(f'{k}={v}\n' for k, v in values.items() if v is not None))


def fake_process(w, pid, cmd, domain='77', ticks=12345):
    d = w['proc'] / str(pid)
    d.mkdir()
    (d / 'stat').write_text(f'{pid} (x) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 {ticks} 0 0')
    (d / 'cmdline').write_bytes(cmd.replace(' ', '\0').encode() + b'\0')
    (d / 'environ').write_bytes(f'ROS_DOMAIN_ID={domain}\0'.encode())


def robot(w, *args, extra_env=None, timeout=60, popen=False):
    env = {k: v for k, v in os.environ.items() if not k.startswith(('ROS_', 'AMENT', 'RMW_', 'FASTRTPS', 'FASTDDS'))}
    # the caller's shell carries the robot domain and an overlay: none of it may leak in
    env.update(ROS_DOMAIN_ID='30', ROS_SUPER_CLIENT='TRUE', AMENT_PREFIX_PATH='/home/x/.cache/armtc/smoothws/install/robot_control',
               SCT_ROBOT_PROFILE=str(w['profile']), SCT_ROBOT_STATE=str(w['state']), SCT_PROC_ROOT=str(w['proc']))
    env.update(extra_env or {})
    cmd = [sys.executable, ROBOT, *args]
    if popen:
        return subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=timeout)


def validated(w):
    """Profile with the candidate accepted on a PASS static check (what map and nav need)."""
    ev = w['tmp'] / 'accepted_check'
    ev.mkdir(exist_ok=True)
    (ev / 'verdict.txt').write_text('verdict=PASS\ncandidate_rad=3.1241\nwall_mount_deg=-180.8\n'
                                    'difference_deg=0.2\ntf_ok=True\n')
    profile(w, LIDAR_YAW='3.1241', LIDAR_YAW_EVIDENCE=ev)
    return ev


def dry(w, *args, **kw):
    r = robot(w, *args, '--dry-run', **kw)
    assert r.returncode == 0, r.stdout + r.stderr
    return json.loads(r.stdout)


# ---- environment ---------------------------------------------------------------------
def test_manual_dry_run(world):
    out = dry(world, 'manual')
    assert out['argv'] == ['ros2', 'launch', 'robot_control', 'manual_mode.launch.py', 'robot_id:=robot_01',
                           'lidar_yaw:=-3.0695']
    env = out['env']
    assert env['ROS_DOMAIN_ID'] == '77' and env['ROS_LOCALHOST_ONLY'] == '1'      # from .env, not the shell's 30
    assert 'ROS_SUPER_CLIENT' not in env
    prefixes = env['AMENT_PREFIX_PATH'].split(':')
    assert prefixes[0] == str(world['overlay'] / 'nav') and 'smoothws' not in env['AMENT_PREFIX_PATH']
    assert not (world['logs']).exists()                                            # a dry run creates nothing


def test_map_and_nav_dry_runs(world):
    validated(world)
    assert dry(world, 'map')['argv'][-2:] == ['max_wheel_speed_mm_s:=250.0', 'rviz:=false']
    nav = dry(world, 'nav')['argv']
    assert nav[:4] == ['ros2', 'launch', 'robot_navigation', 'navigation.launch.py']
    assert f'map:={world["root"]}/robot_maps/map2.yaml' in nav
    assert f'nav2_params_file:={world["root"]}/ros2_ws/src/robot_control/config/nav2_params_v2.yaml' in nav
    assert 'enable_camera:=false' in nav and 'rviz:=false' in nav


def test_nav_needs_the_goal_checker_plugin(world):
    ev = validated(world)
    profile(world, SCT_OVERLAY='', LIDAR_YAW='3.1241', LIDAR_YAW_EVIDENCE=ev)
    r = robot(world, 'nav', '--dry-run')
    assert r.returncode == 2 and 'robot_nav_plugins' in r.stderr


def test_an_overlay_that_chains_elsewhere_is_refused(world):
    write_setup(world['overlay'], '/home/x/other_ws/install/pkg')
    r = robot(world, 'manual', '--dry-run')
    assert r.returncode == 2 and 'outside ROS' in r.stderr


def test_preflight_alone_is_a_super_client(world):
    out = dry(world, 'preflight', 'nav', '--static')
    assert out['env']['ROS_SUPER_CLIENT'] == 'TRUE'
    assert out['argv'][2:] == ['navigation', '--lidar-yaw', '-3.0695', '--ns', '/robot_01', '--static']


# ---- calibration ----------------------------------------------------------------------
def verdict(dirpath, verdict='PASS', yaw='3.1241', tf_ok='True'):
    dirpath.mkdir(parents=True, exist_ok=True)
    (dirpath / 'verdict.txt').write_text(f'verdict={verdict}\ncandidate_rad={yaw}\nwall_mount_deg=-180.8\n'
                                         f'difference_deg=0.2\ntf_ok={tf_ok}\n')
    return dirpath


@pytest.mark.parametrize('workflow', ['manual', 'map', 'nav'])
def test_an_unverified_yaw_runs_with_a_warning_on_lidar_workflows(world, workflow):
    profile(world, LIDAR_YAW='3.1241')
    r = robot(world, workflow, '--dry-run')
    assert r.returncode == 0, r.stderr
    assert json.loads(r.stdout)['argv'][5 if workflow != 'nav' else 5] == 'lidar_yaw:=3.1241'
    assert ('is unverified' in r.stderr) == (workflow != 'manual')

def test_only_a_matching_pass_counts_as_validated(world):
    for v, yaw in (('FAIL', '3.1241'), ('INCONCLUSIVE', '3.1241'), ('PASS', '3.0000')):
        ev = verdict(world['tmp'] / f'ev_{v}_{yaw}', v, yaw)
        profile(world, LIDAR_YAW='3.1241', LIDAR_YAW_EVIDENCE=ev)
        r = robot(world, 'map', '--dry-run')
        assert r.returncode == 0 and 'is unverified' in r.stderr, (v, yaw, r.stderr)
    ev = verdict(world['tmp'] / 'ev_ok')
    profile(world, LIDAR_YAW='-3.1590', LIDAR_YAW_EVIDENCE=ev)                    # same angle, other spelling
    r = robot(world, 'map', '--dry-run')
    assert json.loads(r.stdout)['argv'][5] == 'lidar_yaw:=-3.1590' and 'WARNING' not in r.stderr

def test_lidar_check_always_uses_the_candidate(world):
    r = robot(world, 'lidar-check', '--dry-run', '--', '--motor-power-off-confirmed', '--side', 'right')
    out = json.loads(r.stdout)
    assert out['argv'][-2:] == ['--lidar-yaw', '3.1241'] and '--motor-power-off-confirmed' in out['argv']
    r = robot(world, 'lidar-check', '--dry-run', '--', '--lidar-yaw', '0.1')
    assert r.returncode == 2 and 'always uses LIDAR_YAW_CANDIDATE' in r.stderr
    # a --dry-run that ends up among the passthrough arguments still means dry run
    late = robot(world, 'lidar-check', '--', '--side', 'right', '--dry-run')
    assert late.returncode == 0 and json.loads(late.stdout)['argv'][-2:] == ['--lidar-yaw', '3.1241'], late.stdout + late.stderr


def test_accept_writes_only_a_pass_and_keeps_a_backup(world):
    bad = verdict(world['tmp'] / 'bad', 'FAIL')
    assert robot(world, 'calibration', 'accept', str(bad), '--yes').returncode == 2
    good = verdict(world['tmp'] / 'good')
    before = world['profile'].read_text()
    r = robot(world, 'calibration', 'accept', str(good))
    assert r.returncode == 0 and 'dry run' in r.stdout and world['profile'].read_text() == before
    r = robot(world, 'calibration', 'accept', str(good), '--yes')
    assert r.returncode == 0, r.stderr
    text = world['profile'].read_text()
    assert 'LIDAR_YAW=3.1241\n' in text and f'LIDAR_YAW_EVIDENCE={good}\n' in text and 'LIDAR_YAW_PREVIOUS=-3.0695\n' in text
    backups = [p for p in world['tmp'].iterdir() if p.name.startswith('runtime.env.bak-')]
    assert len(backups) == 1 and backups[0].read_text() == before
    assert dry(world, 'nav')['argv'][5] == 'lidar_yaw:=3.1241'                   # now usable


# ---- one workflow at a time -------------------------------------------------------------
def test_running_robot_processes_block_a_second_workflow(world):
    fake_process(world, 4242, '/usr/bin/python3 /x/install/stm32_bridge/lib/stm32_bridge/stm32_bridge_node --ros-args')
    r = robot(world, 'manual', '--dry-run')
    assert r.returncode == 2 and 'stm32_bridge_node[4242]' in r.stderr
    r = robot(world, 'lidar-check', '--dry-run')
    assert r.returncode == 2 and 'owns the LiDAR alone' in r.stderr


def test_the_workflow_lock_is_held_by_the_launched_process(world):
    log = world['tmp'] / 'exec.json'
    fake = world['tmp'] / 'fake_exec.py'
    fake.write_text('#!/usr/bin/env python3\nimport json, os, sys, time\n'
                    f'json.dump(dict(argv=sys.argv[1:], env={{k: v for k, v in os.environ.items() if k.startswith("ROS_")}}), open("{log}", "w"))\n'
                    'time.sleep(30)\n')
    fake.chmod(0o755)
    first = robot(world, 'manual', extra_env={'SCT_ROBOT_TEST_EXEC': str(fake)}, popen=True)
    try:
        for _ in range(100):
            if log.exists() and log.read_text():
                break
            time.sleep(0.05)
        got = json.loads(log.read_text())
        assert got['argv'][:2] == ['ros2', 'launch'] and got['env']['ROS_DOMAIN_ID'] == '77'
        session = got['env']['ROS_LOG_DIR'][:-len('/ros_log')]
        assert os.path.isfile(os.path.join(session, '.sct-session'))
        assert json.load(open(os.path.join(session, 'session.json')))['pid'] == first.pid
        r = robot(world, 'manual', '--dry-run')
        assert r.returncode == 2 and 'workflow manual already running' in r.stderr
        status = robot(world, 'status')
        assert status.returncode == 0 and '"workflow": "manual"' in status.stdout
    finally:
        first.send_signal(signal.SIGTERM)
        first.wait(10)
    assert dry(world, 'manual')['argv'][2] == 'robot_control'                       # lock released with the process
    assert (world['state'] / 'workflow.lock').exists()                              # a stale file reads as free


# ---- teleop -------------------------------------------------------------------------------
MM = '/usr/bin/python3 /x/install/robot_control/lib/robot_control/mode_manager_node --ros-args -r __ns:=/robot_01'


def test_teleop_needs_a_running_workflow_on_the_same_domain_and_namespace(world):
    assert 'start "robot manual"' in robot(world, 'teleop').stderr
    fake_process(world, 5000, MM, domain='30')
    assert 'domain 30' in robot(world, 'teleop').stderr
    (world['proc'] / '5000' / 'environ').write_bytes(b'ROS_DOMAIN_ID=77\0')
    (world['proc'] / '5000' / 'cmdline').write_bytes(MM.replace('/robot_01', '/robot_02').replace(' ', '\0').encode())
    assert 'namespace /robot_02' in robot(world, 'teleop').stderr


def test_teleop_command_and_caps(world):
    out = dry(world, 'teleop')
    assert out['argv'] == ['ros2', 'run', 'teleop_twist_keyboard', 'teleop_twist_keyboard', '--ros-args',
                           '-r', 'cmd_vel:=/robot_01/cmd_vel_manual', '-p', 'speed:=0.1', '-p', 'turn:=0.3']
    r = robot(world, 'teleop', '--dry-run', '--speed', '0.5')
    assert r.returncode == 2 and 'caps' in r.stderr
    profile(world, TELEOP_SPEED='0.9')
    assert 'TELEOP_SPEED' in robot(world, 'status').stderr


def test_a_second_command_source_is_refused(world):
    fake_process(world, 5000, MM)
    fake_process(world, 5001, '/usr/bin/python3 /opt/ros/humble/lib/teleop_twist_keyboard/teleop_twist_keyboard --ros-args')
    r = robot(world, 'teleop')
    assert r.returncode == 2 and 'another teleop' in r.stderr


# ---- stop ---------------------------------------------------------------------------------
def test_stop_is_announced_as_a_software_stop(world):
    out = dry(world, 'stop')
    assert out['argv'][1].endswith('tools/ops/stopkey.py') and out['argv'][2] == '/robot_01'
    fake = world['tmp'] / 'noop.sh'
    fake.write_text('#!/bin/sh\nexit 0\n')
    fake.chmod(0o755)
    r = robot(world, 'stop', extra_env={'SCT_ROBOT_TEST_EXEC': str(fake)})
    assert 'does NOT cut motor power' in r.stdout and 'hardware E-stop' in r.stdout


# ---- profile and status ---------------------------------------------------------------------
def test_profile_errors_are_refused(world):
    world['profile'].write_text(world['profile'].read_text() + 'LIDAR_YAWW=1\n')
    assert 'unknown key LIDAR_YAWW' in robot(world, 'status').stderr
    profile(world, ROBOT_ID=None)
    assert 'ROBOT_ID is required' in robot(world, 'status').stderr
    world['profile'].unlink()
    assert 'no profile' in robot(world, 'status').stderr


def test_status_is_read_only(world):
    before = sorted(str(p) for p in world['tmp'].rglob('*'))
    r = robot(world, 'status')
    assert r.returncode == 0, r.stderr
    assert 'domain 77' in r.stdout and 'legacy_baseline (ran as robot-baseline-20261102' in r.stdout
    assert 'launcher allows: manual, map, nav\n' in r.stdout
    assert 'candidate    3.1241 rad (static check only' in r.stdout
    assert sorted(str(p) for p in world['tmp'].rglob('*')) == before
    profile(world, LIDAR_YAW='3.1241')
    assert 'unverified' in robot(world, 'status').stdout


# ---- logs ---------------------------------------------------------------------------------
def session(w, name, age_days, size, pid=None, marker=True):
    d = w['logs'] / name
    (d / 'ros_log').mkdir(parents=True)
    (d / 'ros_log' / 'x.log').write_bytes(b'x' * size)
    (d / 'bag').mkdir()
    if marker:
        (d / '.sct-session').write_text('')
    (d / 'session.json').write_text(json.dumps({'pid': pid, 'start_ticks': 12345}))
    t = time.time() - age_days * 86400
    os.utime(d, (t, t))
    return d


def test_prune_only_old_finished_launcher_logs_and_only_with_yes(world):
    old = session(world, 'old_manual', 40, 1000)
    live = session(world, 'live_nav', 40, 1000, pid=6000)
    fake_process(world, 6000, 'ros2 launch robot_navigation navigation.launch.py')
    foreign = session(world, 'hand_made', 90, 1000, marker=False)
    recent = session(world, 'recent_map', 1, 1000)
    r = robot(world, 'logs', 'prune')
    assert 'would remove' in r.stdout and old.name in r.stdout and (old / 'ros_log').exists()
    r = robot(world, 'logs', 'prune', '--yes')
    assert r.returncode == 0
    assert not (old / 'ros_log').exists() and (old / 'bag').exists() and (old / 'session.json').exists()
    for kept in (live, foreign, recent):
        assert (kept / 'ros_log').exists(), kept


def test_prune_enforces_the_size_budget_oldest_first(world):
    profile(world, LOG_MAX_MB='0.0015')                     # 1500 bytes
    a = session(world, 'a', 3, 1000)
    b = session(world, 'b', 2, 1000)
    c = session(world, 'c', 1, 1000)
    robot(world, 'logs', 'prune', '--yes')
    assert not (a / 'ros_log').exists() and not (b / 'ros_log').exists() and (c / 'ros_log').exists()


def test_the_committed_example_profile_is_valid(world):
    example = os.path.join(HERE, '..', '..', 'config', 'runtime.env.example')
    text = open(example).read().replace('$HOME/smart-campus-tour/robot', str(world['root']))
    text = '\n'.join(x for x in text.split('\n') if not x.startswith(('SCT_LOG_ROOT=', 'MIN_FREE_GB=')))
    world['profile'].write_text(text + f'\nSCT_LOG_ROOT={world["logs"]}\nMIN_FREE_GB=0\n')
    r = robot(world, 'status')
    assert r.returncode == 0, r.stderr
    assert 'legacy_baseline' in r.stdout


FB = '/usr/bin/python3 /x/install/fleet_bridge/lib/fleet_bridge/fleet_bridge --ros-args -r __ns:=/robot_01'


def fleet_bridge(w, *yaml_texts):
    files = []
    for i, text in enumerate(yaml_texts):
        f = w['tmp'] / f'fb_params_{i}.yaml'
        if text is not None:
            f.write_text(text)
        files.append(str(f))
    fake_process(w, 7000, FB + ''.join(f' --params-file {f}' for f in files))


def test_nav_runs_beside_a_telemetry_only_fleet_bridge(world):
    validated(world)
    fleet_bridge(world, '/**/fleet_bridge:\n  ros__parameters:\n    commands_enabled: false\n',
                 '/robot_01/fleet_bridge:\n  ros__parameters:\n    backend_url: x\n')
    r = robot(world, 'nav', '--dry-run')
    assert r.returncode == 0 and 'telemetry-only' in r.stderr, r.stderr
    assert 'commands_enabled=False' in robot(world, 'status').stdout


@pytest.mark.parametrize('files', [
    ('/**/fleet_bridge:\n  ros__parameters:\n    commands_enabled: false\n',
     '/robot_01/fleet_bridge:\n  ros__parameters:\n    commands_enabled: true\n'),   # a later file wins
    ('/**/fleet_bridge:\n  ros__parameters:\n    commands_enabled: false\n', None),   # unreadable later file
])
def test_nav_warns_beside_a_commanding_or_unknown_fleet_bridge(world, files):
    validated(world)
    fleet_bridge(world, *files)
    r = robot(world, 'nav', '--dry-run')
    assert r.returncode == 0 and 'do not also send goals' in r.stderr, r.stderr

def test_legacy_baseline_runs_every_workflow_and_warns_on_lidar_ones(world):
    r = robot(world, 'manual', '--dry-run')
    assert json.loads(r.stdout)['argv'][-1] == 'lidar_yaw:=-3.0695' and 'WARNING' not in r.stderr
    for workflow in ('map', 'nav'):
        r = robot(world, workflow, '--dry-run')
        assert r.returncode == 0 and 'is legacy_baseline' in r.stderr, r.stderr

def snapshot(w):
    out = {}
    for path in sorted(w['tmp'].rglob('*')):
        if path.is_file():
            out[str(path)] = path.read_bytes()
        else:
            out[str(path)] = None
    return out


@pytest.mark.parametrize('args', [
    ['manual'], ['map'], ['nav'], ['teleop'], ['stop'], ['preflight', 'nav'], ['record', 'start', '/tmp/x'],
    ['lidar-check', '--', '--motor-power-off-confirmed'], ['calibration', 'accept', 'CHECK', '--yes'],
    ['logs', 'prune', '--yes'], ['shell'], ['env'], ['status'],
])
@pytest.mark.parametrize('where', ['first', 'after_command', 'last'])
def test_dry_run_anywhere_starts_nothing_and_writes_nothing(world, args, where):
    ev = validated(world)
    args = [str(ev) if a == 'CHECK' else a for a in args]
    session(world, 'old', 90, 10)                                     # something prune could delete
    fake_process(world, 5000, MM)                                     # so teleop has a mode_manager
    marker = world['tmp'] / 'EXECUTED'
    fake = world['tmp'] / 'fake_exec.sh'
    fake.write_text(f'#!/bin/sh\ntouch {marker}\n')
    fake.chmod(0o755)
    before = snapshot(world)
    argv = {'first': ['--dry-run', *args], 'after_command': [args[0], '--dry-run', *args[1:]], 'last': [*args, '--dry-run']}[where]
    r = robot(world, *argv, extra_env={'SCT_ROBOT_TEST_EXEC': str(fake)})
    assert not marker.exists(), (argv, r.stdout, r.stderr)
    assert snapshot(world) == before, argv


# ---- process identity ------------------------------------------------------------------
def test_a_reused_pid_does_not_keep_an_old_session_alive(world):
    d = session(world, 'old_nav', 40, 1000, pid=6100)
    info = json.loads((d / 'session.json').read_text())
    info['start_ticks'] = 111
    (d / 'session.json').write_text(json.dumps(info))
    fake_process(world, 6100, 'some unrelated program')
    (world['proc'] / '6100' / 'stat').write_text('6100 (prog) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 999 0 0')
    assert 'LIVE' not in robot(world, 'logs').stdout
    robot(world, 'logs', 'prune', '--yes')
    assert not (d / 'ros_log').exists()
    (world['proc'] / '6100' / 'stat').write_text('6100 (prog) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 111 0 0')
    d2 = session(world, 'old_map', 40, 1000, pid=6100)
    info = json.loads((d2 / 'session.json').read_text())
    info['start_ticks'] = 111
    (d2 / 'session.json').write_text(json.dumps(info))
    assert 'LIVE' in robot(world, 'logs').stdout                     # same pid AND same start: still running
    robot(world, 'logs', 'prune', '--yes')
    assert (d2 / 'ros_log').exists()


# ---- fleet sessions (ADR-0049: commands only with the motion permit) ------------------------
def fleet_runtime(w, gate=True, permit_publisher=True):
    nav = w['overlay'] / 'nav'
    launch = nav / 'share' / 'robot_navigation' / 'launch'
    launch.mkdir(parents=True, exist_ok=True)
    (launch / 'navigation.launch.py').write_text("DeclareLaunchArgument('require_motion_permit')\n" if gate else '# old\n')
    fb = fake_prefix(w['root'] / 'ros2_ws' / 'install' / 'fleet', ['fleet_bridge'])
    (fb / 'share' / 'fleet_bridge' / 'config').mkdir(parents=True, exist_ok=True)
    (fb / 'share' / 'fleet_bridge' / 'config' / 'fleet_bridge.yaml').write_text('/**:\n  ros__parameters: {}\n')
    lib = fb / 'lib' / 'python3.10' / 'site-packages' / 'fleet_bridge'
    lib.mkdir(parents=True, exist_ok=True)
    if permit_publisher:
        (lib / 'motion_permit_ros.py').write_text('')
    base = w['root'] / 'ros2_ws' / 'install'
    write_setup(base, f'{base / "base"}:{fb}')
    cred = w['tmp'] / 'amr_01.credential'
    cred.write_text('SECRET-CREDENTIAL')
    env_file = w['tmp'] / 'fleet-sync.env'
    env_file.write_text(f'export FLEET_SYNC_URL=https://example.test/api/fleet/v1/sync\nexport FLEET_ROBOT_CODE=amr_01\n'
                        f'export FLEET_ROBOT_MAP_KEY=map2-key\nexport FLEET_ROBOT_FRAME_ID=map\n'
                        f'export FLEET_ROBOT_CREDENTIAL_FILE={cred}\n')
    return env_file


def fleet_profile(w, **over):
    ev = validated(w)
    profile(w, LIDAR_YAW='3.1241', LIDAR_YAW_EVIDENCE=ev, FLEET_ENV_FILE=w['tmp'] / 'fleet-sync.env', **over)


def test_nav_fleet_needs_a_runtime_with_the_motion_gate(world):
    fleet_runtime(world, gate=False)
    fleet_profile(world)
    r = robot(world, 'nav', '--fleet', '--dry-run')
    assert r.returncode == 2 and 'no motion gate' in r.stderr, r.stderr
    fleet_runtime(world, gate=True)
    argv = dry(world, 'nav', '--fleet')['argv']
    assert argv[-1] == 'require_motion_permit:=true'
    assert 'require_motion_permit:=true' not in dry(world, 'nav')['argv']


def test_fleet_telemetry_runs_alone_and_keeps_the_credential_out_of_output(world):
    fleet_runtime(world)
    fleet_profile(world)
    r = robot(world, 'fleet', '--dry-run')
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout)
    assert out['argv'][:4] == ['ros2', 'run', 'fleet_bridge', 'fleet_bridge'] and '__ns:=/robot_01' in out['argv']
    assert 'robot_code:=amr_01' in out['argv'] and 'commands_enabled:=true' not in out['argv']
    assert 'SECRET-CREDENTIAL' not in r.stdout and 'amr_01.credential' not in r.stdout


def test_fleet_commands_need_a_running_nav_and_note_a_missing_permit(world):
    fleet_runtime(world)
    fleet_profile(world)
    r = robot(world, 'fleet', '--commands', '--dry-run')
    assert r.returncode == 2 and 'running "robot nav" session' in r.stderr
    fake = world['tmp'] / 'sleeper.sh'
    fake.write_text('#!/bin/sh\nexec sleep 30\n')
    fake.chmod(0o755)
    for nav_args, gated in ((['nav'], False), (['nav', '--fleet'], True)):
        holder = robot(world, *nav_args, extra_env={'SCT_ROBOT_TEST_EXEC': str(fake)}, popen=True)
        try:
            for _ in range(100):
                if 'running' in robot(world, 'status').stdout:
                    break
                time.sleep(0.05)
            r = robot(world, 'fleet', '--commands', '--dry-run')
            out = json.loads(r.stdout)
            assert r.returncode == 0 and out['argv'][-10:] == [
                '-p', 'commands_enabled:=true', '-p', 'report_period_sec:=0.5',
                '-p', 'localized_max_xy_variance:=0.3', '-p', 'localized_max_yaw_variance:=0.1',
                '-p', 'motion_permit_link_timeout_sec:=20.0'], r.stdout + r.stderr
            assert ('no motion permit' in r.stderr) == (not gated), r.stderr
            reset = robot(world, 'reset-latch', '--dry-run')
            if gated:
                assert json.loads(reset.stdout)['argv'][:4] == ['ros2', 'service', 'call', '/robot_01/motion_inhibit_reset']
            else:
                assert 'nothing to reset' in reset.stderr
        finally:
            holder.send_signal(signal.SIGTERM)
            holder.wait(10)


def test_fleet_commands_need_the_permit_publisher_in_fleet_bridge(world):
    fleet_runtime(world, permit_publisher=False)
    fleet_profile(world)
    fake = world['tmp'] / 'sleeper.sh'
    fake.write_text('#!/bin/sh\nexec sleep 30\n')
    fake.chmod(0o755)
    holder = robot(world, 'nav', '--fleet', extra_env={'SCT_ROBOT_TEST_EXEC': str(fake)}, popen=True)
    try:
        for _ in range(100):
            if 'running' in robot(world, 'status').stdout:
                break
            time.sleep(0.05)
        r = robot(world, 'fleet', '--commands', '--dry-run')
        assert r.returncode == 2 and 'motion_permit_ros.py' in r.stderr, r.stderr
    finally:
        holder.send_signal(signal.SIGTERM)
        holder.wait(10)


def test_fleet_settings_and_a_second_bridge_are_checked(world):
    env_file = fleet_runtime(world)
    fleet_profile(world)
    env_file.write_text(env_file.read_text().replace('export FLEET_ROBOT_MAP_KEY=map2-key\n', ''))
    r = robot(world, 'fleet', '--dry-run')
    assert r.returncode == 2 and 'FLEET_ROBOT_MAP_KEY' in r.stderr
    fleet_runtime(world)
    fake_process(world, 7100, '/usr/bin/python3 /x/install/fleet_bridge/lib/fleet_bridge/fleet_bridge --ros-args')
    r = robot(world, 'fleet', '--dry-run')
    assert r.returncode == 2 and 'already running' in r.stderr


def nav_holder(world, *nav_args):
    fake = world['tmp'] / 'sleeper.sh'
    fake.write_text('#!/bin/sh\nexec sleep 30\n')
    fake.chmod(0o755)
    holder = robot(world, 'nav', *nav_args, extra_env={'SCT_ROBOT_TEST_EXEC': str(fake)}, popen=True)
    for _ in range(100):
        if 'running' in robot(world, 'status').stdout:
            break
        time.sleep(0.05)
    return holder


def test_fleet_commands_pass_the_map_package_or_note_it_is_missing(world):
    env_file = fleet_runtime(world)
    fleet_profile(world)
    package = world['tmp'] / 'test123-v1.zip'
    package.write_bytes(b'zip')
    sha = 'AB' * 32
    holder = nav_holder(world, '--fleet')
    try:
        r = robot(world, 'fleet', '--commands', '--dry-run')
        assert r.returncode == 0 and 'MAP_EVIDENCE_MISSING' in r.stderr, r.stderr
        assert not any(x.startswith('map_package') for x in json.loads(r.stdout)['argv'])
        env_file.write_text(env_file.read_text() + f'export FLEET_MAP_PACKAGE_PATH={package}\n')
        r = robot(world, 'fleet', '--commands', '--dry-run')
        assert r.returncode == 2 and 'set both' in r.stderr, r.stderr
        env_file.write_text(env_file.read_text() + f"export FLEET_MAP_PACKAGE_SHA256='{sha}'\n")
        r = robot(world, 'fleet', '--commands', '--dry-run')
        argv = json.loads(r.stdout)['argv']
        assert r.returncode == 0 and 'MAP_EVIDENCE_MISSING' not in r.stderr, r.stderr
        assert argv[-4:] == ['-p', f'map_package_path:={package}', '-p', f'map_package_sha256:={sha.lower()}']
        assert not any(x.startswith('map_package') for x in json.loads(robot(world, 'fleet', '--dry-run').stdout)['argv'])
        fleet_profile(world, LOCALIZED_MAX_XY_VARIANCE='0.09', LOCALIZED_MAX_YAW_VARIANCE='0.05',
                      MOTION_PERMIT_LINK_TIMEOUT_SEC='1.5')
        argv = json.loads(robot(world, 'fleet', '--commands', '--dry-run').stdout)['argv']
        assert 'localized_max_xy_variance:=0.09' in argv and 'localized_max_yaw_variance:=0.05' in argv
        assert 'motion_permit_link_timeout_sec:=1.5' in argv
        assert not any(x.startswith('localized_max') for x in json.loads(robot(world, 'fleet', '--dry-run').stdout)['argv'])
        package.unlink()
        r = robot(world, 'fleet', '--commands', '--dry-run')
        assert r.returncode == 2 and 'does not point to a file' in r.stderr, r.stderr
    finally:
        holder.send_signal(signal.SIGTERM)
        holder.wait(10)


def test_viewer_runs_the_debug_bridge_with_the_foxglove_env(world):
    fleet_runtime(world)
    fox = world['tmp'] / 'fox.sh'
    fleet_profile(world, FOXGLOVE_ENV=fox)
    r = robot(world, 'viewer', '--dry-run')
    assert r.returncode == 2 and 'no debug_bridge.launch.py' in r.stderr, r.stderr
    (world['overlay'] / 'nav' / 'share' / 'robot_navigation' / 'launch' / 'debug_bridge.launch.py').write_text('')
    r = robot(world, 'viewer', '--dry-run')
    assert r.returncode == 2 and 'FOXGLOVE_ENV not found' in r.stderr, r.stderr
    fox.write_text('')
    argv = dry(world, 'viewer')['argv']
    assert argv[:5] == ['bash', '-c', 'source "$1" && shift && exec "$@"', 'viewer', str(fox)]
    assert argv[5:] == ['ros2', 'launch', 'robot_navigation', 'debug_bridge.launch.py', 'robot_id:=robot_01']
    r = robot(world, 'viewer')
    assert r.returncode == 2 and 'needs a running "robot nav"' in r.stderr, r.stderr
    fake_process(world, 7200, '/usr/bin/python3 /opt/ros/humble/bin/ros2 launch robot_navigation debug_bridge.launch.py')
    r = robot(world, 'viewer', '--dry-run')
    assert r.returncode == 2 and 'already running' in r.stderr, r.stderr


# ---- initial pose from the LiDAR (pose_bootstrap) -------------------------------------------
def pose_runtime(w, has_bootstrap=True, map_config=True):
    launch = w['overlay'] / 'nav' / 'share' / 'robot_navigation' / 'launch'
    launch.mkdir(parents=True, exist_ok=True)
    (launch / 'navigation.launch.py').write_text("DeclareLaunchArgument('auto_initial_pose')\n" if has_bootstrap else '# old\n')
    cfg = w['root'] / 'robot_maps' / 'map2.pose_bootstrap.yaml'
    if map_config:
        cfg.write_text('map_yaml: map2.yaml\n')
    elif cfg.exists():
        cfg.unlink()


def test_auto_pose_is_opt_in_and_needs_a_runtime_and_map_settings(world):
    profile(world)
    pose_runtime(world)
    assert not any(x.startswith('auto_initial_pose') for x in dry(world, 'nav')['argv'])
    assert dry(world, 'nav', '--auto-pose')['argv'][-1] == 'auto_initial_pose:=true'
    pose_runtime(world, has_bootstrap=False)
    r = robot(world, 'nav', '--auto-pose', '--dry-run')
    assert r.returncode == 2 and 'no pose_bootstrap' in r.stderr, r.stderr
    pose_runtime(world, map_config=False)
    r = robot(world, 'nav', '--auto-pose', '--dry-run')
    assert r.returncode == 2 and 'map2.pose_bootstrap.yaml' in r.stderr, r.stderr


def test_profile_turns_auto_pose_on_and_manual_pose_overrides_it(world):
    profile(world, AUTO_INITIAL_POSE='true')
    pose_runtime(world)
    assert dry(world, 'nav')['argv'][-1] == 'auto_initial_pose:=true'
    assert not any(x.startswith('auto_initial_pose') for x in dry(world, 'nav', '--manual-pose')['argv'])
    r = robot(world, 'nav', '--auto-pose', '--manual-pose', '--dry-run')
    assert r.returncode == 2                                       # mutually exclusive
    assert not any(x.startswith('auto_initial_pose') for x in dry(world, 'map')['argv'])   # nav only


def test_relocalize_needs_an_auto_pose_nav_session(world):
    profile(world)
    pose_runtime(world)
    r = robot(world, 'relocalize', '--dry-run')
    assert r.returncode == 2 and 'needs "robot nav"' in r.stderr
    fake = world['tmp'] / 'sleeper.sh'
    fake.write_text('#!/bin/sh\nexec sleep 30\n')
    fake.chmod(0o755)
    for nav_args, ok in ((['nav'], False), (['nav', '--auto-pose'], True)):
        holder = robot(world, *nav_args, extra_env={'SCT_ROBOT_TEST_EXEC': str(fake)}, popen=True)
        try:
            for _ in range(100):
                if 'running' in robot(world, 'status').stdout:
                    break
                time.sleep(0.05)
            r = robot(world, 'relocalize', '--dry-run')
            if ok:
                assert json.loads(r.stdout)['argv'] == ['ros2', 'service', 'call', '/robot_01/pose_bootstrap/relocalize',
                                                        'std_srvs/srv/Trigger', '{}'], r.stdout + r.stderr
            else:
                assert r.returncode == 2 and 'auto pose' in r.stderr, r.stderr
        finally:
            holder.send_signal(signal.SIGTERM)
            holder.wait(10)
            time.sleep(1.1)                # session directories are named to the second

# ---- depth camera in the local costmap (robot nav --camera) -----------------------------------
def camera_runtime(w, driver=True, lean=True, usb=True):
    """astra_camera in the base install, orbbec_bringup in the overlay, a fake USB tree."""
    if driver:
        fake_prefix(w['root'] / 'ros2_ws' / 'install' / 'base', ['astra_camera'])
    fake_prefix(w['overlay'] / 'nav', ['orbbec_bringup'])
    launch = w['overlay'] / 'nav' / 'share' / 'orbbec_bringup' / 'launch'
    launch.mkdir(parents=True, exist_ok=True)
    (launch / 'astra_pro.launch.py').write_text("'use_uvc_camera': False,\n" if lean else "# old\n")
    dev = w['tmp'] / 'usb' / '1-2'
    dev.mkdir(parents=True, exist_ok=True)
    (dev / 'idVendor').write_text('2bc5\n')
    (dev / 'idProduct').write_text('0403\n' if usb else '0501\n')     # 0501 = the RGB half only
    return {'SCT_USB_ROOT': str(w['tmp'] / 'usb')}


def test_camera_is_opt_in_per_run_or_profile(world):
    usb = camera_runtime(world)
    assert 'enable_camera:=false' in dry(world, 'nav', extra_env=usb)['argv']
    assert 'enable_camera:=true' in dry(world, 'nav', '--camera', extra_env=usb)['argv']
    profile(world, ENABLE_CAMERA='true')
    assert 'enable_camera:=true' in dry(world, 'nav', extra_env=usb)['argv']
    assert 'enable_camera:=false' in dry(world, 'nav', '--no-camera', extra_env=usb)['argv']
    r = robot(world, 'nav', '--camera', '--no-camera', '--dry-run', extra_env=usb)
    assert r.returncode == 2                                       # mutually exclusive
    assert not any(x.startswith('enable_camera') for x in dry(world, 'map', extra_env=usb)['argv'])   # nav only


@pytest.mark.parametrize('broken, why', [(dict(usb=False), 'no Astra depth device'),
                                         (dict(lean=False), 'predates the 14/11 camera settings'),
                                         (dict(driver=False), 'astra_camera')])
def test_camera_problem_falls_back_to_lidar_only(world, broken, why):
    # the camera is supplementary (ADR-0001): a missing camera never stops nav
    usb = camera_runtime(world, **broken)
    r = robot(world, 'nav', '--camera', '--dry-run', extra_env=usb)
    assert r.returncode == 0, r.stderr
    assert 'enable_camera:=false' in json.loads(r.stdout)['argv']
    assert 'LiDAR-only' in r.stderr and why in r.stderr, r.stderr


# ---- fleet service (robot fleet --service, run by sct-fleet.service) -----------------------
# The supervisor gives the bridge a clean ROS environment, so the fake reads its knobs from files.
FAKE_BRIDGE = '''#!/bin/sh
d=$(dirname "$0")
echo "$@" >> "$d/bridge_args"
echo "[INFO] [1] [robot_01.fleet_bridge]: Fleet Sync acknowledged (accepted)."
[ -f "$d/bridge_exit" ] && exit "$(cat "$d/bridge_exit")"
exec sleep 60
'''


def start_service(w, **env):
    fleet_runtime(w)
    fake = w['tmp'] / 'fake_bridge.sh'
    fake.write_text(FAKE_BRIDGE)
    fake.chmod(0o755)
    e = {k: v for k, v in os.environ.items() if not k.startswith(('ROS_', 'AMENT', 'RMW_', 'FASTRTPS', 'FASTDDS'))}
    e.update(SCT_ROBOT_PROFILE=str(w['profile']), SCT_ROBOT_STATE=str(w['state']), SCT_PROC_ROOT=str(w['proc']),
             SCT_ROBOT_TEST_EXEC=str(fake), SCT_FLEET_TIME_GATE='true',
             SCT_FLEET_POLL='0.2', SCT_FLEET_BACKOFF_MIN='0.5', SCT_FLEET_BACKOFF_MAX='2')
    e.update(env)
    log = open(w['tmp'] / 'service.log', 'w')
    return subprocess.Popen([sys.executable, ROBOT, 'fleet', '--service'], env=e, stdout=log, stderr=subprocess.STDOUT)


def service_status(w):
    try:
        return json.loads((w['state'] / 'fleet-service.json').read_text())
    except (OSError, ValueError):
        return {}


def wait_until(cond, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.1)
    return False


def bridge_runs(w):
    p = w['tmp'] / 'bridge_args'
    return p.read_text().splitlines() if p.exists() else []


def stop_service(proc):
    proc.send_signal(signal.SIGTERM)
    return proc.wait(20)


def test_fleet_service_runs_telemetry_and_blocks_a_second_bridge(world):
    fleet_profile(world)
    svc = start_service(world)
    try:
        assert wait_until(lambda: service_status(world).get('sync', {}).get('state') == 'connected'), \
            (world['tmp'] / 'service.log').read_text()
        st = service_status(world)
        assert st['mode'] == 'telemetry' and 'commands_enabled:=true' not in bridge_runs(world)[0]
        r = robot(world, 'fleet', '--dry-run')
        assert r.returncode == 2 and 'fleet service owns the bridge' in r.stderr, r.stderr
        r = robot(world, 'fleet', '--commands', '--dry-run')
        assert r.returncode == 2 and 'fleet service owns the bridge' in r.stderr
        r = robot(world, 'fleet', '--service', '--dry-run')
        assert r.returncode == 2 and 'fleet lock held' in r.stderr
        assert 'service' in robot(world, 'status').stdout
    finally:
        assert stop_service(svc) == 0
    st = service_status(world)
    assert st['why'] == 'stopped' and st['child_pid'] is None
    assert lock_free(world)


def lock_free(w):
    import fcntl
    fd = os.open(w['state'] / 'fleet.lock', os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except BlockingIOError:
        return False
    finally:
        os.close(fd)


def test_fleet_service_takes_commands_only_while_nav_fleet_runs(world):
    fleet_profile(world)
    svc = start_service(world)
    sleeper = world['tmp'] / 'sleeper.sh'
    sleeper.write_text('#!/bin/sh\nexec sleep 30\n')
    sleeper.chmod(0o755)
    try:
        assert wait_until(lambda: service_status(world).get('mode') == 'telemetry')
        plain = robot(world, 'nav', extra_env={'SCT_ROBOT_TEST_EXEC': str(sleeper)}, popen=True)
        time.sleep(1.5)
        assert service_status(world)['mode'] == 'telemetry'      # plain nav: route tests stay possible
        plain.send_signal(signal.SIGTERM); plain.wait(10)
        time.sleep(1.1)                    # session directories are named to the second
        nav = robot(world, 'nav', '--fleet', extra_env={'SCT_ROBOT_TEST_EXEC': str(sleeper)}, popen=True)
        try:
            if not wait_until(lambda: service_status(world).get('mode') == 'commands'):
                nav.send_signal(signal.SIGTERM)
                pytest.fail(f'{service_status(world)}\nnav: {nav.communicate(timeout=10)}')
            assert 'commands_enabled:=true' in bridge_runs(world)[-1]
            out = nav.stdout.readline() + nav.stdout.readline()
            assert 'fleet service: switches fleet_bridge to commands' in out, out
        finally:
            nav.send_signal(signal.SIGTERM); nav.wait(10)
        assert wait_until(lambda: service_status(world).get('mode') == 'telemetry'), service_status(world)
        assert 'commands_enabled:=true' not in bridge_runs(world)[-1]
    finally:
        stop_service(svc)


def test_fleet_service_policy_off_never_takes_commands(world):
    fleet_profile(world, FLEET_SERVICE_COMMANDS='off')
    svc = start_service(world)
    sleeper = world['tmp'] / 'sleeper.sh'
    sleeper.write_text('#!/bin/sh\nexec sleep 30\n')
    sleeper.chmod(0o755)
    try:
        nav = robot(world, 'nav', '--fleet', extra_env={'SCT_ROBOT_TEST_EXEC': str(sleeper)}, popen=True)
        try:
            time.sleep(2)
            assert service_status(world)['mode'] == 'telemetry'
            assert all('commands_enabled:=true' not in a for a in bridge_runs(world))
        finally:
            nav.send_signal(signal.SIGTERM); nav.wait(10)
    finally:
        stop_service(svc)


def test_fleet_service_restarts_a_bridge_that_exits(world):
    fleet_profile(world)
    (world['tmp'] / 'bridge_exit').write_text('1')
    svc = start_service(world)
    try:
        assert wait_until(lambda: service_status(world).get('restarts', 0) >= 3, timeout=20), service_status(world)
        st = service_status(world)
        assert st['last_exit'] == 1 and len(bridge_runs(world)) >= 3
    finally:
        stop_service(svc)


def test_fleet_service_waits_for_ntp_and_for_a_foreign_bridge(world, tmp_path):
    fleet_profile(world)
    flag = tmp_path / 'ntp_ok'
    svc = start_service(world, SCT_FLEET_TIME_GATE=f'test -f {flag}')
    try:
        assert wait_until(lambda: 'waiting for NTP' in (service_status(world).get('why') or ''))
        assert bridge_runs(world) == []
        fake_process(world, 7300, '/usr/bin/python3 /x/install/fleet_bridge/lib/fleet_bridge/fleet_bridge --ros-args')
        flag.write_text('')
        assert wait_until(lambda: 'another fleet_bridge runs' in (service_status(world).get('why') or ''), timeout=25)
        assert bridge_runs(world) == []
        shutil.rmtree(world['proc'] / '7300')
        assert wait_until(lambda: len(bridge_runs(world)) == 1, timeout=20), service_status(world)
    finally:
        stop_service(svc)


def test_fleet_service_actions_map_to_the_user_unit(world):
    fleet_profile(world)
    assert dry(world, 'fleet', 'start')['argv'] == ['systemctl', '--user', 'start', 'sct-fleet.service']
    assert dry(world, 'fleet', 'restart')['argv'][2] == 'restart'
    assert dry(world, 'fleet', 'logs', '-f')['argv'] == ['journalctl', '--user', '-u', 'sct-fleet.service', '-n', '200',
                                                         '--no-pager', '-f']
    r = robot(world, 'fleet', 'status')
    assert r.returncode == 0 and 'commands     policy auto: off now' in r.stdout, r.stdout + r.stderr


def test_commands_flag_is_read_from_p_overrides_too(world):
    fleet_runtime(world)
    fake_process(world, 7400, '/usr/bin/python3 /x/install/fleet_bridge/lib/fleet_bridge/fleet_bridge --ros-args '
                              '-p commands_enabled:=true')
    assert 'commands_enabled=True' in robot(world, 'status').stdout


def test_unit_file_runs_the_installed_launcher():
    unit = (Path(ROBOT).resolve().parents[1] / 'config' / 'systemd' / 'sct-fleet.service').read_text()
    assert 'ExecStart=%h/.local/bin/robot fleet --service' in unit and 'Restart=always' in unit
    assert 'WantedBy=default.target' in unit


def test_fleet_service_stops_a_leftover_bridge_of_its_own(world):
    """A bridge marked SCT_FLEET_SERVICE outlived a SIGKILLed supervisor: the next one stops it.
    An unmarked (hand-started) bridge is only waited for (test above)."""
    fleet_profile(world)
    leftover = subprocess.Popen(['sleep', '60'])
    d = world['proc'] / str(leftover.pid)
    d.mkdir()
    (d / 'stat').write_text(f'{leftover.pid} (x) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1 0 0')
    (d / 'cmdline').write_bytes(b'/usr/bin/python3\0/x/install/fleet_bridge/lib/fleet_bridge/fleet_bridge\0')
    (d / 'environ').write_bytes(b'ROS_DOMAIN_ID=77\0SCT_FLEET_SERVICE=1\0')
    svc = start_service(world)
    try:
        assert wait_until(lambda: leftover.poll() is not None, timeout=20)
        shutil.rmtree(d)
        assert wait_until(lambda: len(bridge_runs(world)) == 1, timeout=20), service_status(world)
    finally:
        stop_service(svc)
        if leftover.poll() is None:
            leftover.kill()
