"""Unit tests for the Nav2 benchmark helpers (no ROS needed)."""
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import metrics as MX  # noqa: E402
import tx_metrics as TX  # noqa: E402


def test_geometry_curvature_of_a_circle():
    th = np.linspace(0, math.pi, 400)
    g = MX.geometry(np.c_[np.cos(th), np.sin(th)])          # radius 1 m
    assert abs(g['kappa_p95'] - 1.0) < 0.05 and g['kinks'] == 0


def test_geometry_straight_line_has_no_curvature():
    g = MX.geometry(np.c_[np.linspace(0, 5, 200), np.zeros(200)])
    assert g['kappa_max'] < 1e-6 and g['turn_deg_per_m'] < 1e-6


def test_dist_to_path():
    P = np.array([[0.0, 0.0], [10.0, 0.0]])
    assert abs(MX.dist_to_path(3.0, 0.4, P) - 0.4) < 1e-9


def _write_tx_log(path, w_profile):
    """bridge-style log: wheel commands (mm/s) every 20 Hz send, one line per send."""
    with open(path, 'w') as f:
        for i, w in enumerate(w_profile):
            l_mm = int(round(w * TX.WB / 2 * 1000)); r_mm = -l_mm      # in-place rotation, inverted wheels
            f.write(f'[INFO] [{1792660000 + i * 0.05:.6f}] [robot_01.stm32_bridge_node]: TX: CMD,{i},{l_mm},{r_mm}\n')


def test_tx_rebuild_and_rotation_end_decel(tmp_path):
    # rotate at 0.45 rad/s for 3 s, then stop with a -2.5 (V1-like) or -1.2 (V2-like) ramp
    def run(decel):
        prof = [0.45] * 60
        w = 0.45
        while w > 0:
            w = max(0.0, w - decel * 0.05); prof.append(w)
        prof += [0.0] * 40
        p = tmp_path / f'tx_{decel}.log'; _write_tx_log(p, prof)
        t, v, ww, a = TX.load_tx(str(p))
        assert abs(1 / a - 20.0) < 1e-3 and np.allclose(np.abs(v), 0, atol=0.002)
        return TX.leg_metrics(t, v, ww, t[0], t[-1] - 2.0)['rot_end_decel_max']
    v1, v2 = run(2.5), run(1.2)
    assert v2 < v1 and v2 < 1.3 < v1


def test_verify_params_rejects_unknown_config():
    r = subprocess.run(['bash', os.path.join(HERE, 'verify_params.sh'), 'V9'], capture_output=True, text=True)
    assert r.returncode == 2 and 'usage' in r.stdout


def test_verify_params_lidar_yaw_compares_modulo_two_pi():
    def same(a, b):
        r = subprocess.run(['bash', os.path.join(HERE, 'verify_params.sh'), '--angle-equal', a, b], capture_output=True)
        return r.returncode == 0
    assert same('-3.0695', '-3.0695')
    assert same('3.1242', '-3.1590')        # TF prints (-pi, pi]; the launch arg may be outside it
    assert same('-3.1416', '3.1416')
    assert not same('3.1241', '-3.0695')    # the 02/11 baseline and the candidate differ by 5.1 deg
    assert not same('-3.0695', '-3.0700')
    assert not same('', '-3.0695')          # no TF answer is a failure
