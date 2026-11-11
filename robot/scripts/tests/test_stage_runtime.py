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
