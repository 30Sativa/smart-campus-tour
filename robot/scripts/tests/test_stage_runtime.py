"""stage-runtime refuses before building anything (a real build is too slow for verify;
robot/docs/runtime-deploy.md records the manual build check)."""
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, '..', 'stage-runtime')


def run(*args):
    return subprocess.run(['bash', SCRIPT, *args], capture_output=True, text=True, timeout=30)


def test_needs_a_ref():
    r = run()
    assert r.returncode == 2 and 'usage' in r.stderr


def test_unknown_ref_is_refused():
    r = run('no-such-ref-xyz')
    assert r.returncode == 2 and 'unknown ref' in r.stderr


def test_an_existing_overlay_is_never_rebuilt(tmp_path):
    (tmp_path / 'keep').write_text('old overlay')
    r = run('HEAD', '--dest', str(tmp_path))
    assert r.returncode == 2 and 'REFUSED' in r.stderr
    assert (tmp_path / 'keep').read_text() == 'old overlay'
    assert sorted(p.name for p in tmp_path.iterdir()) == ['keep']


def test_tools_only_release_is_read_only_and_runs_the_launcher_from_itself(tmp_path):
    dest = tmp_path / 'tools'
    r = run('HEAD', '--tools-only', '--dest', str(dest))
    assert r.returncode == 0, r.stdout + r.stderr
    prov = (dest / 'PROVENANCE').read_text()
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=HERE, capture_output=True, text=True).stdout.strip()
    assert f'commit: {head}' in prov and 'tools only' in prov
    launcher = dest / 'robot' / 'scripts' / 'robot'
    assert launcher.is_file() and (dest / 'robot' / 'tools' / 'ops' / 'stopkey.py').is_file()
    assert not os.access(launcher.parent, os.W_OK) and not os.access(launcher, os.W_OK)
    assert not (dest / 'src').exists() and not (dest / 'install').exists()
    # the launcher reports where it runs from; no profile needed for that line to be wrong
    profile = tmp_path / 'p.env'
    profile.write_text('SCT_ROBOT_ROOT=/nonexistent\nROBOT_ID=robot_01\nLIDAR_YAW=-3.0695\n')
    s = subprocess.run(['python3', str(launcher), 'status'], capture_output=True, text=True,
                       env=dict(os.environ, SCT_ROBOT_PROFILE=str(profile), SCT_ROBOT_STATE=str(tmp_path / 'st')))
    assert f'launcher     release {dest}/robot' in s.stdout and head in s.stdout, s.stdout + s.stderr
    subprocess.run(['chmod', '-R', 'u+w', str(dest)], check=True)
