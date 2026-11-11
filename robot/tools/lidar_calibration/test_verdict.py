"""The verdict step of static_lidar_check.sh, run on prepared capture/fit outputs."""
import json
import os
import re
import subprocess

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))


def verdict(tmp_path, wall_deg, tf_yaw, yaw='3.1241'):
    np.savez_compressed(tmp_path / 'capture.npz', ranges=np.zeros((1, 3)), meta=json.dumps({'tf_lidar_yaw': tf_yaw}))
    (tmp_path / 'wall_yaw.txt').write_text(f'MOUNT YAW {wall_deg:+.2f} deg = 0 rad\n')
    script = open(os.path.join(HERE, 'static_lidar_check.sh')).read()
    step = script[script.index('python3 - "$out" "$yaw"'):]
    r = subprocess.run(['bash', '-c', f'out={tmp_path}; yaw={yaw}; {step}'], capture_output=True, text=True)
    return r, dict(line.split('=', 1) for line in (tmp_path / 'verdict.txt').read_text().split())


@pytest.mark.parametrize('wall_deg,tf_yaw,want,code', [
    (-180.8, 3.1241, 'PASS', 0),
    (-182.9, 3.1241, 'INCONCLUSIVE', 1),
    (-175.9, 3.1241, 'FAIL', 1),          # the 02/11 value: the mount moved, or 02/11 was wrong
    (-181.0, -3.0695, 'FAIL', 1),         # the launch did not apply the candidate
    (-181.0, None, 'FAIL', 1),
])
def test_verdicts(tmp_path, wall_deg, tf_yaw, want, code):
    r, v = verdict(tmp_path, wall_deg, tf_yaw)
    assert r.returncode == code and v['verdict'] == want, r.stdout + r.stderr
    assert v['candidate_rad'] == '3.1241'
    assert re.fullmatch(r'-?\d+\.\d{3}', v['difference_deg'])


def test_refuses_without_a_runtime_and_leaves_no_session_dir(tmp_path):
    out = tmp_path / 'session'
    r = subprocess.run(['bash', os.path.join(HERE, 'static_lidar_check.sh'), '--motor-power-off-confirmed', '--side', 'right',
                        '--front-cm', '100', '--rear-cm', '100', '--baseline-m', '0.6', '--out', str(out)],
                       env={'HOME': str(tmp_path), 'PATH': '/usr/bin:/bin'}, capture_output=True, text=True, timeout=30)
    assert r.returncode == 2 and 'robot_description not found' in r.stderr
    assert not out.exists()


def test_refuses_without_the_power_off_confirmation(tmp_path):
    r = subprocess.run(['bash', os.path.join(HERE, 'static_lidar_check.sh'), '--side', 'right', '--front-cm', '1',
                        '--rear-cm', '1', '--baseline-m', '0.6', '--out', str(tmp_path / 's')], capture_output=True, text=True)
    assert r.returncode == 2 and 'motor-power-off-confirmed' in r.stdout
