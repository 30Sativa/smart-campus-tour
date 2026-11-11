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
