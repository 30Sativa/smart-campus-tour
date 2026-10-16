"""Contract tests for the real-robot LiDAR yaw calibration (base_link->lidar_link).

The calibrated value lives in the real-robot launch (manual_mode.launch.py,
forwarded by navigation.launch.py); the URDF default stays 0 so simulation
and display keep the nominal CAD mount.
"""

import ast
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest


SRC = Path(__file__).resolve().parents[2]
CALIBRATED_LIDAR_YAW = -0.2225   # rad, -12.75 deg (measured 2026-10-15)


def _read(relative_path):
    return (SRC / relative_path).read_text(encoding='utf-8')


def _launch_defaults(relative_path):
    tree = ast.parse(_read(relative_path))
    return {
        ast.literal_eval(call.args[0]): ast.literal_eval(keyword.value)
        for call in ast.walk(tree)
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Name)
        and call.func.id == 'DeclareLaunchArgument'
        for keyword in call.keywords if keyword.arg == 'default_value'
        and isinstance(keyword.value, ast.Constant)
    }


def test_real_robot_launches_default_to_the_calibrated_yaw():
    manual = _launch_defaults('robot_control/launch/manual_mode.launch.py')
    navigation = _launch_defaults('robot_navigation/launch/navigation.launch.py')
    assert float(manual['lidar_yaw']) == CALIBRATED_LIDAR_YAW
    assert float(navigation['lidar_yaw']) == CALIBRATED_LIDAR_YAW
    assert -math.radians(14.0) < CALIBRATED_LIDAR_YAW < -math.radians(11.5)


def test_lidar_yaw_reaches_xacro_and_is_forwarded():
    manual = _read('robot_control/launch/manual_mode.launch.py')
    navigation = _read('robot_navigation/launch/navigation.launch.py')
    assert "lidar_yaw = LaunchConfiguration('lidar_yaw')" in manual
    assert "' lidar_yaw:=', lidar_yaw" in manual
    assert "'lidar_yaw': lidar_yaw" in navigation


def test_urdf_default_is_nominal_and_joint_uses_the_arg():
    robot = _read('robot_description/urdf/robot.urdf.xacro')
    sensors = ET.fromstring(_read('robot_description/urdf/sensors.xacro'))
    assert re.search(r'<xacro:arg name="lidar_yaw" default="0\.0"/>', robot)
    joint = sensors.find("joint[@name='lidar_joint']")
    assert joint.find('parent').attrib['link'] == 'base_link'
    assert joint.find('child').attrib['link'] == 'lidar_link'
    assert joint.find('origin').attrib['rpy'] == '0 0 $(arg lidar_yaw)'


def test_sim_and_display_launches_do_not_apply_the_calibration():
    for path in ('robot_description/launch/display.launch.py',
                 'robot_description/launch/gazebo.launch.py'):
        assert 'lidar_yaw' not in _read(path)


def _render(*args):
    xacro = pytest.importorskip('xacro')
    doc = xacro.process_file(
        str(SRC / 'robot_description/urdf/robot.urdf.xacro'),
        mappings=dict(a.split(':=') for a in args))
    origin = ET.fromstring(doc.toxml()).find("joint[@name='lidar_joint']/origin")
    return [float(v) for v in origin.attrib['rpy'].split()]


def test_rendered_urdf_yaw():
    pytest.importorskip('ament_index_python')
    try:
        default = _render('use_sim:=false', 'use_ros2_control:=false')
    except Exception as exc:   # $(find robot_description) needs the package installed
        pytest.skip('xacro render unavailable: %s' % exc)
    calibrated = _render('use_sim:=false', 'use_ros2_control:=false',
                         'lidar_yaw:=%s' % CALIBRATED_LIDAR_YAW)
    assert default == [0.0, 0.0, 0.0]
    assert calibrated == [0.0, 0.0, CALIBRATED_LIDAR_YAW]
