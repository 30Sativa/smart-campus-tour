"""Lock physical geometry and the separate real-odometry calibration."""

import re
from pathlib import Path


PACKAGE = Path(__file__).resolve().parents[1]
SRC = PACKAGE.parent


def _capture(path, pattern):
    text = path.read_text(encoding='utf-8')
    match = re.search(pattern, text, re.MULTILINE)
    assert match is not None, f'pattern not found in {path}'
    return float(match.group(1))


def test_wheel_geometry_and_real_odometry_calibration():
    common = PACKAGE / 'urdf' / 'common_properties.xacro'
    controller = PACKAGE / 'config' / 'diff_drive_controller.yaml'
    manual_launch = SRC / 'robot_control' / 'launch' / 'manual_mode.launch.py'
    bridge_launch = SRC / 'stm32_bridge' / 'launch' / 'stm32_bridge.launch.py'
    bridge_node = (SRC / 'stm32_bridge' / 'stm32_bridge' /
                   'stm32_bridge_node.py')
    firmware_header = (SRC.parents[1] / 'firmware' / 'stm32' / 'motor_controller' /
                       'Core' / 'Inc' / 'motor' / 'motor.h')

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
    manual_wheel_base = _capture(
        manual_launch,
        r"'wheel_base', default_value='([0-9.]+)'")
    standalone_wheel_base = _capture(
        bridge_launch,
        r"'wheel_base',\s+default_value='([0-9.]+)'")
    node_wheel_base = _capture(
        bridge_node, r'^DEFAULT_WHEEL_BASE\s*=\s*([0-9.]+)')
    firmware_diameter = _capture(
        firmware_header, r'#define WHEEL_DIAMETER_MM\s+([0-9.]+)f')

    assert controller_radius == urdf_radius == bridge_radius
    assert controller_separation == urdf_separation == 0.4325
    assert manual_wheel_base == standalone_wheel_base == node_wheel_base == 0.4714
    assert firmware_diameter == urdf_radius * 2.0 * 1000.0


if __name__ == '__main__':
    test_wheel_geometry_and_real_odometry_calibration()
    print('PASS  wheel geometry and real odometry calibration are locked')
