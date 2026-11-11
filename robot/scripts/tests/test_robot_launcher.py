"""robot launcher, offline. A fake robot root (.env on domain 77), fake installs and a fake
/proc; real ROS processes are never started and nothing joins domain 30.
--dry-run and status only build the environment (bash + source-minipc) and read files."""
import json
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


def fake_process(w, pid, cmd, domain='77'):
    d = w['proc'] / str(pid)
    d.mkdir()
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
    assert dry(world, 'map')['argv'][-2:] == ['max_wheel_speed_mm_s:=250.0', 'rviz:=false']
    nav = dry(world, 'nav')['argv']
    assert nav[:4] == ['ros2', 'launch', 'robot_navigation', 'navigation.launch.py']
    assert f'map:={world["root"]}/robot_maps/map2.yaml' in nav
    assert f'nav2_params_file:={world["root"]}/ros2_ws/src/robot_control/config/nav2_params_v2.yaml' in nav
    assert 'enable_camera:=false' in nav and 'rviz:=false' in nav


def test_nav_needs_the_goal_checker_plugin(world):
    profile(world, SCT_OVERLAY='')
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
def test_the_candidate_cannot_drive_without_evidence(world, workflow):
    profile(world, LIDAR_YAW='3.1241')
    r = robot(world, workflow, '--dry-run')
    assert r.returncode == 2 and 'calibration' in r.stderr


def test_evidence_must_be_a_pass_for_that_value(world):
    for v, yaw in (('FAIL', '3.1241'), ('INCONCLUSIVE', '3.1241'), ('PASS', '3.0000')):
        ev = verdict(world['tmp'] / f'ev_{v}_{yaw}', v, yaw)
        profile(world, LIDAR_YAW='3.1241', LIDAR_YAW_EVIDENCE=ev)
        assert robot(world, 'map', '--dry-run').returncode == 2, (v, yaw)
    ev = verdict(world['tmp'] / 'ev_ok')
    profile(world, LIDAR_YAW='-3.1590', LIDAR_YAW_EVIDENCE=ev)                    # same angle, other spelling
    assert dry(world, 'map')['argv'][5] == 'lidar_yaw:=-3.1590'


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
    r = robot(world, 'map', '--dry-run')
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
        r = robot(world, 'nav', '--dry-run')
        assert r.returncode == 2 and 'workflow manual already running' in r.stderr
        status = robot(world, 'status')
        assert status.returncode == 0 and '"workflow": "manual"' in status.stdout
    finally:
        first.send_signal(signal.SIGTERM)
        first.wait(10)
    assert dry(world, 'nav')['argv'][2] == 'robot_navigation'                       # lock released with the process


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
    assert 'domain 77' in r.stdout and 'baseline robot-baseline-20261102' in r.stdout
    assert 'candidate    3.1241 rad (static check only' in r.stdout
    assert sorted(str(p) for p in world['tmp'].rglob('*')) == before
    profile(world, LIDAR_YAW='3.1241')
    assert 'NOT usable for motion' in robot(world, 'status').stdout


# ---- logs ---------------------------------------------------------------------------------
def session(w, name, age_days, size, pid=None, marker=True):
    d = w['logs'] / name
    (d / 'ros_log').mkdir(parents=True)
    (d / 'ros_log' / 'x.log').write_bytes(b'x' * size)
    (d / 'bag').mkdir()
    if marker:
        (d / '.sct-session').write_text('')
    (d / 'session.json').write_text(json.dumps({'pid': pid}))
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
    assert 'baseline robot-baseline-20261102' in r.stdout
