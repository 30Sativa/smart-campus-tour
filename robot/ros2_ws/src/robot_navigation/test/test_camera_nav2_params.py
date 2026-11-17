"""Camera mode changes exactly one Nav2 value; LiDAR-only passes the params file untouched.

Runs in a fresh interpreter (other packages' tests stub ROS imports), like
test_camera_launch_scope.py. robot/docs/depth-camera.md explains the value.
"""

from pathlib import Path
import subprocess
import sys

import pytest


SRC = Path(__file__).resolve().parents[2]
KEY = ('controller_server', 'ros__parameters', 'FollowPath', 'max_allowed_time_to_collision_up_to_carrot')


def _flatten(d, prefix=()):
    out = {}
    for k, v in d.items():
        out.update(_flatten(v, prefix + (k,)) if isinstance(v, dict) else {prefix + (k,): v})
    return out


def run_probe(params_name, tmp):
    try:
        import importlib.util
        import yaml
        from launch import LaunchContext
        from launch.actions import LogInfo
        from launch.substitutions import TextSubstitution
    except ImportError:
        return 77
    spec = importlib.util.spec_from_file_location('nav_launch', SRC / 'robot_navigation/launch/navigation.launch.py')
    nav = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(nav)
    from launch.substitutions import LaunchConfiguration
    source = str(SRC / 'robot_control/config' / params_name) if params_name != 'missing' else tmp + '/missing.yaml'
    if params_name == 'missing':
        Path(source).write_text('controller_server:\n  ros__parameters:\n    controller_frequency: 10.0\n')
    original = _flatten(yaml.safe_load(open(source)))
    for camera in ('false', 'true'):
        ctx = LaunchContext()
        ctx.launch_configurations.update(enable_camera=camera, nav2_params_file=source)
        params, logs = nav._nav2_params_for_mode(ctx, LaunchConfiguration('nav2_params_file'), LaunchConfiguration('enable_camera'))
        used = params.perform(ctx)
        if camera == 'false' or params_name == 'missing':
            assert used == source, used
            assert (len(logs) == 1 and isinstance(logs[0], LogInfo)) == (camera == 'true')
            continue
        rewritten = _flatten(yaml.safe_load(open(used)))
        assert rewritten.keys() == original.keys()
        changed = {k: (original[k], rewritten[k]) for k in original if original[k] != rewritten[k]}
        assert changed == {KEY: (1.0, 4.0)}, changed
        # the substitutions nav2_bringup resolves later must survive the rewrite
        assert any(isinstance(v, str) and '$(var robot_ns)' in v for v in rewritten.values())
        assert any(isinstance(v, str) and '$(find-pkg-share robot_navigation)' in v for v in rewritten.values())
    return 0


@pytest.mark.parametrize('params_name', ['nav2_params_v2.yaml', 'nav2_params_v3.yaml', 'nav2_params.yaml', 'missing'])
def test_camera_mode_rewrites_only_the_rpp_collision_horizon(params_name, tmp_path):
    result = subprocess.run([sys.executable, str(Path(__file__).resolve()), params_name, str(tmp_path)],
                            capture_output=True, text=True, timeout=60)
    if result.returncode == 77:
        pytest.skip('ROS 2 launch runtime unavailable')
    assert result.returncode == 0, result.stdout + result.stderr


if __name__ == '__main__':
    sys.exit(run_probe(sys.argv[1], sys.argv[2]))
