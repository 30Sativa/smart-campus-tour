"""Keep duplicated hardware/controller calibration aligned with the URDF."""

import re
from pathlib import Path


PACKAGE = Path(__file__).resolve().parents[1]
SRC = PACKAGE.parent


def _capture(path, pattern):
    text = path.read_text(encoding='utf-8')
    match = re.search(pattern, text, re.MULTILINE)
    assert match is not None, f'pattern not found in {path}'
    return float(match.group(1))


def test_wheel_geometry_matches_all_consumers():
    common = PACKAGE / 'urdf' / 'common_properties.xacro'
    controller = PACKAGE / 'config' / 'diff_drive_controller.yaml'
    manual_launch = SRC / 'robot_control' / 'launch' / 'manual_mode.launch.py'

    urdf_radius = _capture(
        common, r'name="wheel_radius"\s+value="([0-9.]+)"')
    urdf_separation = _capture(
        common, r'name="wheel_separation"\s+value="([0-9.]+)"')
    controller_radius = _capture(
        controller, r'^\s+wheel_radius:\s*([0-9.]+)')
    controller_separation = _capture(
        controller, r'^\s+wheel_separation:\s*([0-9.]+)')
    bridge_radius = _capture(
        manual_launch,
        r"'wheel_radius', default_value='([0-9.]+)'")
    bridge_separation = _capture(
        manual_launch,
        r"'wheel_base', default_value='([0-9.]+)'")

    assert controller_radius == urdf_radius == bridge_radius
    assert controller_separation == urdf_separation == bridge_separation


if __name__ == '__main__':
    test_wheel_geometry_matches_all_consumers()
    print('PASS  wheel geometry matches URDF, Gazebo controller, and bridge')
