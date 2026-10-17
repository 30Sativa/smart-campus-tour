"""discovery-server-stage against fake systemctl/ss/proc: one step at a time,
.env preconditions, stack-running refusal, verification and automatic revert.
The ExecStart lines themselves were run against the real fastdds CLI in
network namespaces (dds-isolation.md, section 10)."""
import os
import subprocess

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, '..', 'discovery-server-stage')

FAKE_SYSTEMCTL = r'''#!/bin/bash
# Fake systemctl: restart derives the server sockets from the drop-in.
S=$FAKE_STATE
case $1 in
  cat) exit 0 ;;
  daemon-reload) echo daemon-reload >> $S/calls ;;
  restart)
    echo restart >> $S/calls
    d=$DSS_DROPIN_DIR/10-dds-isolation.conf
    st=original
    [ -f $d ] && st=s1
    [ -f $d ] && grep -q -- '-x ' $d && st=s3
    echo $st >> $S/restarts
    if [ "${FAKE_BROKEN:-}" = $st ]; then echo inactive > $S/active; : > $S/ss; exit 0; fi
    echo active > $S/active
    if [ $st = s3 ] && [ -z "${FAKE_S3_LEAKS:-}" ]; then lo=127.0.0.1; else lo=0.0.0.0; fi
    printf 'UNCONN 0 0 %s:11811 0.0.0.0:* users:(("fast-discovery-",pid=9,fd=3))\n' $lo > $S/ss
    lan='UNCONN 0 0 10.86.7.244:47970 0.0.0.0:* users:(("fast-discovery-",pid=9,fd=4))'
    [ $st = s3 ] || echo "$lan" >> $S/ss ;;
  is-active)
    if [ "$(cat $S/active 2>/dev/null)" != active ]; then
      [ "$2" = --quiet ] || echo inactive
      exit 3
    fi
    [ "$2" = --quiet ] || echo active ;;
esac
'''
FAKE_SS = '#!/bin/bash\ncat $FAKE_STATE/ss 2>/dev/null\n'


@pytest.fixture
def env(tmp_path):
    bin_ = tmp_path / 'bin'
    bin_.mkdir()
    (bin_ / 'systemctl').write_text(FAKE_SYSTEMCTL)
    (bin_ / 'ss').write_text(FAKE_SS)
    for f in bin_.iterdir():
        f.chmod(0o755)
    state, proc = tmp_path / 'state', tmp_path / 'proc'
    state.mkdir()
    proc.mkdir()
    (state / 'active').write_text('active\n')
    (state / 'ss').write_text(
        'UNCONN 0 0 0.0.0.0:11811 0.0.0.0:* users:(("fast-discovery-",pid=9,fd=3))\n')
    e = dict(os.environ, DSS_ALLOW_NONROOT='1', DSS_SETTLE='0', FAKE_STATE=str(state),
             DSS_SYSTEMCTL=str(bin_ / 'systemctl'), DSS_SS=str(bin_ / 'ss'), DSS_PROC=str(proc),
             DSS_DROPIN_DIR=str(tmp_path / 'fastdds-discovery.service.d'),
             DSS_XML_DEST=str(tmp_path / 'etc' / 'discovery_server_loopback.xml'))
    dotenv = tmp_path / 'robot.env'

    def run(*args, localhost_only=None, **extra):
        if localhost_only is not None:
            dotenv.write_text(f'ROS_DOMAIN_ID=30\nROS_LOCALHOST_ONLY={localhost_only}\n')
        return subprocess.run([SCRIPT, *args], capture_output=True, text=True,
                              env=dict(e, **extra))

    def add_process(pid, comm, cmdline='', fastdds=True):
        d = proc / str(pid)
        d.mkdir()
        (d / 'comm').write_text(comm + '\n')
        (d / 'cmdline').write_text(cmdline.replace(' ', '\0'))
        lib = '7f00 r-xp /opt/ros/humble/lib/libfastrtps.so.2.6\n'
        (d / 'maps').write_text(lib if fastdds else '')

    run.dotenv, run.state, run.add_process = str(dotenv), state, add_process
    run.dropin = tmp_path / 'fastdds-discovery.service.d' / '10-dds-isolation.conf'
    run.xml = tmp_path / 'etc' / 'discovery_server_loopback.xml'
    return run


def stage_of(run):
    return run('status').stdout.split()[1]


def test_full_ladder_up_and_down(env):
    assert stage_of(env) == 'original'
    r = env('s1')
    assert r.returncode == 0, r.stderr
    assert '-l 127.0.0.1 -p 11811' in env.dropin.read_text() and stage_of(env) == 's1'
    r = env('s3', '--env', env.dotenv, localhost_only=1)
    assert r.returncode == 0, r.stderr
    assert env.xml.is_file() and f'-x {env.xml}' in env.dropin.read_text()
    assert '127.0.0.1:11811' in env('status').stdout
    assert env('s1', '--env', env.dotenv).returncode == 0 and stage_of(env) == 's1'
    r = env('original', '--env', env.dotenv, localhost_only=0)
    assert r.returncode == 0, r.stderr
    assert not env.dropin.exists() and stage_of(env) == 'original'


def test_no_skipping_steps(env):
    r = env('s3', '--env', env.dotenv, localhost_only=1)
    assert r.returncode != 0 and 'one step at a time' in r.stderr
    assert not env.dropin.exists()


def test_s3_needs_localhost_only_and_original_needs_it_off(env):
    assert env('s1').returncode == 0
    r = env('s3', '--env', env.dotenv, localhost_only=0)
    assert r.returncode != 0 and 'ROS_LOCALHOST_ONLY=1' in r.stderr
    r = env('s3')
    assert r.returncode != 0 and '--env' in r.stderr
    r = env('original', '--env', env.dotenv, localhost_only=1)
    assert r.returncode != 0 and 'E1b' in r.stderr
    assert stage_of(env) == 's1'


def test_refuses_while_the_stack_runs_but_ignores_server_and_cli_daemon(env):
    env.add_process(9, 'fast-discovery-')
    env.add_process(10, 'python3', '/usr/bin/python3 -c from ros2cli.daemon.daemonize import main')
    env.add_process(11, 'bash', fastdds=False)
    assert env('s1').returncode == 0
    env.add_process(12, 'amcl')
    r = env('s3', '--env', env.dotenv, localhost_only=1)
    assert r.returncode != 0 and 'stop the stack' in r.stderr and '12 amcl' in r.stderr
    assert stage_of(env) == 's1'


def test_failed_check_restores_the_previous_stage(env):
    assert env('s1').returncode == 0
    before = env.dropin.read_text()
    r = env('s3', '--env', env.dotenv, localhost_only=1, FAKE_BROKEN='s3')
    assert r.returncode == 1 and 'restoring s1' in r.stderr and 'restored s1' in r.stderr
    assert env.dropin.read_text() == before
    assert (env.state / 'restarts').read_text().split()[-2:] == ['s3', 's1']


def test_refuses_foreign_dropins_and_unexpected_content(env):
    env.dropin.parent.mkdir(parents=True)
    (env.dropin.parent / 'override.conf').write_text('[Service]\nNice=5\n')
    r = env('s1')
    assert r.returncode != 0 and 'other drop-ins' in r.stderr
    (env.dropin.parent / 'override.conf').unlink()
    env.dropin.write_text('[Service]\nExecStart=\nExecStart=/usr/bin/something\n')
    r = env('s1')
    assert r.returncode != 0 and 'unexpected content' in r.stderr


def test_needs_root_without_the_test_override(env):
    r = env('s1', DSS_ALLOW_NONROOT='')
    if os.geteuid() != 0:
        assert r.returncode != 0 and 'sudo' in r.stderr


def test_s3_that_still_binds_all_interfaces_is_rolled_back(env):
    """E.g. a broken profile: the service runs but sockets are not on loopback."""
    assert env('s1').returncode == 0
    r = env('s3', '--env', env.dotenv, localhost_only=1, FAKE_S3_LEAKS='1')
    assert r.returncode == 1 and 'off loopback' in r.stderr and 'restored s1' in r.stderr
    assert stage_of(env) == 's1'
