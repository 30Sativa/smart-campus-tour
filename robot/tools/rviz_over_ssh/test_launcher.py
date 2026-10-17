"""Exercise the real shell supervisors with harmless processes, never robot DDS."""
import json
import os
from pathlib import Path
import signal
import shutil
import subprocess
import time

import pytest

HERE = Path(__file__).resolve().parent


def until(predicate, timeout=5):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return True
        time.sleep(0.03)
    return False


@pytest.fixture
def fake_tools(tmp_path):
    bindir = tmp_path / 'bin'
    bindir.mkdir()
    stub = '''#!/usr/bin/python3
import json, os, pathlib, signal, sys, time
name = pathlib.Path(sys.argv[0]).name
if name == 'ss': sys.exit(0)
if name == 'ros2':
    print('/fake/robot_description')
    sys.exit(0)
root = pathlib.Path(os.environ['STUB_ROOT'])
(root / (name + '.json')).write_text(json.dumps({'pid': os.getpid(), 'env': {k:v for k,v in os.environ.items() if k.startswith(('ROS_', 'RMW_', 'FASTDDS_', 'FASTRTPS_'))}, 'args': sys.argv[1:]}))
if name == 'python3' and os.environ.get('ADAPTER_REFUSE'): sys.exit(2)
while not (name == 'rviz2' and (root / 'close-rviz').exists()): time.sleep(.03)
'''
    for name in ('ss', 'ros2', 'ssh', 'python3', 'rviz2'):
        p = bindir / name
        p.write_text(stub)
        p.chmod(0o755)
    env = dict(os.environ, PATH=str(bindir) + ':' + os.environ['PATH'],
               STUB_ROOT=str(tmp_path), ROS_DISTRO='humble', ROS_DOMAIN_ID='30',
               ROS_DISCOVERY_SERVER='10.86.7.244:11811', ROS_LOCALHOST_ONLY='0',
               FASTDDS_DEFAULT_PROFILES_FILE='/bad/profile.xml', ROS_SUPER_CLIENT='TRUE')
    env.pop('LAPTOP_ROS_DOMAIN_ID', None)
    return tmp_path, env


def launch(env, *args):
    return subprocess.Popen(['bash', str(HERE / 'rviz-over-ssh'), *args], env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, start_new_session=True)


def alive(pid):
    try:
        return Path(f'/proc/{pid}/stat').read_text().split(') ', 1)[1][0] != 'Z'
    except FileNotFoundError:
        return False


def finish(proc, root):
    # Also clean up if a regression leaves the foreground RViz orphaned.
    if proc.poll() is None:
        proc.terminate()
    try:
        proc.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.communicate(timeout=5)
    for f in root.glob('*.json'):
        pid = json.loads(f.read_text())['pid']
        if alive(pid):
            os.kill(pid, signal.SIGTERM)


def test_term_parent_stops_rviz_adapter_and_tunnel(fake_tools):
    root, env = fake_tools
    proc = launch(env, '-c', str(HERE / 'fox2ros_topics.yaml'), 'user@robot')
    try:
        assert until(lambda: all((root / (n + '.json')).exists()
                                for n in ('rviz2', 'ssh', 'python3')))
        children = [json.loads(p.read_text())['pid'] for p in root.glob('*.json')]
        proc.terminate()
        assert until(lambda: proc.poll() is not None), 'launcher stuck waiting for foreground RViz'
        assert until(lambda: not any(alive(p) for p in children)), 'orphaned viewer or tunnel'
    finally:
        finish(proc, root)


def test_closing_rviz_cleans_children_and_sanitizes_environment(fake_tools):
    root, env = fake_tools
    proc = launch(env, '-c', str(HERE / 'fox2ros_topics.yaml'), 'user@robot')
    try:
        assert until(lambda: all((root / (n + '.json')).exists()
                                for n in ('rviz2', 'ssh', 'python3')))
        records = [json.loads(p.read_text()) for p in root.glob('*.json')]
        for record in records:
            e = record['env']
            assert e['ROS_DOMAIN_ID'] == '42' and e['ROS_LOCALHOST_ONLY'] == '1'
            assert 'ROS_DISCOVERY_SERVER' not in e and 'ROS_SUPER_CLIENT' not in e
            assert 'FASTDDS_DEFAULT_PROFILES_FILE' not in e
        (root / 'close-rviz').touch()
        assert proc.wait(timeout=5) == 0
        assert until(lambda: not any(alive(r['pid']) for r in records))
    finally:
        finish(proc, root)


@pytest.mark.parametrize('args', [('-p', '65535'), ('-p', 'x'), ('-n', 'bad/name'),
                                  ('-c', '/missing/navigation.rviz'), ('-p',)])
def test_invalid_options_fail_before_starting_children(fake_tools, args):
    root, env = fake_tools
    proc = launch(env, *args, 'user@robot')
    try:
        assert until(lambda: proc.poll() is not None), 'invalid arguments started background work'
        assert proc.returncode != 0
        assert not list(root.glob('*.json'))
    finally:
        finish(proc, root)


def test_adapter_refusal_exits_and_cleans_viewer(fake_tools):
    root, env = fake_tools
    env['ADAPTER_REFUSE'] = '1'
    proc = launch(env, '-c', str(HERE / 'fox2ros_topics.yaml'), 'user@robot')
    try:
        assert until(lambda: proc.poll() is not None), 'adapter refusal left RViz waiting forever'
        assert proc.returncode != 0
        assert until(lambda: not any(alive(json.loads(p.read_text())['pid'])
                                     for p in root.glob('*.json')))
    finally:
        finish(proc, root)


@pytest.mark.parametrize('mode', [[], ['--legacy']])
def test_operator_wrapper_preserves_legacy_default(tmp_path, mode):
    legacy = tmp_path / 'legacy'
    legacy.write_text('#!/bin/bash\nprintf "legacy:%s\\n" "$*"\n')
    legacy.chmod(0o755)
    result = subprocess.run([str(HERE / 'amr-rviz'), *mode, 'unchanged'],
                            env=dict(os.environ, AMR_RVIZ_LEGACY=str(legacy)),
                            capture_output=True, text=True)
    assert result.returncode == 0 and result.stdout == 'legacy:unchanged\n'


@pytest.mark.parametrize('options,expected_target', [
    ([], 'sativa@10.86.7.244'),
    (['-c', '/a/config.rviz'], 'sativa@10.86.7.244'),
    (['--no-rviz', '-p', '8875'], 'sativa@10.86.7.244'),
    (['robot-alias'], 'robot-alias'),
])
def test_operator_wrapper_sources_workspace_and_forwards_options(tmp_path, options, expected_target):
    wrapper = tmp_path / 'amr-rviz'
    shutil.copy(HERE / 'amr-rviz', wrapper)
    launcher = tmp_path / 'rviz-over-ssh'
    launcher.write_text('#!/bin/bash\necho "workspace=$AMR_TEST_WS"\nprintf "%s\\n" "$@"\n')
    launcher.chmod(0o755)
    setup = tmp_path / 'setup.bash'
    setup.write_text('export AMR_TEST_WS=loaded\n')
    e = dict(os.environ, ROS_DISTRO='humble', AMR_ROS_WS_SETUP=str(setup))
    e.pop('AMR_RVIZ_TARGET', None)
    result = subprocess.run([str(wrapper), '--r3', *options], env=e,
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines() == ['workspace=loaded', *options,
                                         *([] if options and options[-1] == expected_target
                                           else [expected_target])]


def test_missing_workspace_fails_before_any_ssh(fake_tools):
    root, env = fake_tools
    env['AMR_ROS_WS_SETUP'] = '/missing/install/setup.bash'
    r = subprocess.run([str(HERE / 'amr-rviz'), '--r3'], env=env,
                       capture_output=True, text=True, timeout=5)
    assert r.returncode == 2 and 'Laptop workspace missing' in r.stderr
    assert not list(root.glob('*.json'))
