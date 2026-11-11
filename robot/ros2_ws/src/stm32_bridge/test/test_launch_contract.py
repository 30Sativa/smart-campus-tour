"""Launch wiring of stm32_bridge: an argument must reach the node or fail here.

odom_linear_scale was lost from stm32_bridge.launch.py when the pan-tilt branch
replaced the file. manual_mode.launch.py kept forwarding it, launch accepted the
undeclared argument silently, and the node stayed at its default 1.0. These
checks read the source, so they cover every argument and need no ROS.
"""

import ast
import os
import re

_SRC = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_BRIDGE_LAUNCH = os.path.join(_SRC, 'stm32_bridge/launch/stm32_bridge.launch.py')
_MANUAL_LAUNCH = os.path.join(_SRC, 'robot_control/launch/manual_mode.launch.py')
_NODE_SOURCES = [
    os.path.join(_SRC, 'stm32_bridge/stm32_bridge', name)
    for name in ('stm32_bridge_node.py', 'head_ros.py', 'contactor_ros.py')
]
# Arguments that configure the launch itself rather than a node parameter.
_NOT_PARAMETERS = {'robot_id'}


def _tree(path):
    with open(path, encoding='utf-8') as source:
        return ast.parse(source.read())


def _calls(tree, name):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, 'id', None) == name:
            yield node


def _declared(path):
    return {call.args[0].value for call in _calls(_tree(path), 'DeclareLaunchArgument')}


def _node_parameter_keys():
    for call in _calls(_tree(_BRIDGE_LAUNCH), 'Node'):
        for keyword in call.keywords:
            if keyword.arg == 'parameters':
                return {key.value for key in keyword.value.elts[0].keys}
    raise AssertionError('no Node(parameters=...) in stm32_bridge.launch.py')


def _forwarded_by_manual_mode():
    source = open(_MANUAL_LAUNCH, encoding='utf-8').read()
    start = source.index('PythonLaunchDescriptionSource(stm32_bridge_launch)')
    end = source.index('}.items()', start)
    return set(re.findall(r"'(\w+)'\s*:", source[start:end]))


def _node_declared_parameters():
    declared = set()
    for path in _NODE_SOURCES:
        with open(path, encoding='utf-8') as source:
            declared |= set(re.findall(r"declare_parameter\(\s*'(\w+)'", source.read()))
    return declared


def test_every_launch_argument_reaches_the_node():
    assert _declared(_BRIDGE_LAUNCH) - _NOT_PARAMETERS == _node_parameter_keys()


def test_every_launch_parameter_is_declared_by_the_node():
    missing = _node_parameter_keys() - _node_declared_parameters()
    assert not missing, missing


def test_manual_mode_only_forwards_arguments_the_bridge_declares():
    forwarded = _forwarded_by_manual_mode()
    assert 'odom_linear_scale' in forwarded
    unknown = forwarded - _declared(_BRIDGE_LAUNCH)
    assert not unknown, unknown


def test_odom_linear_scale_reaches_the_node():
    """The specific regression, named so a failure says what broke."""
    assert 'odom_linear_scale' in _declared(_BRIDGE_LAUNCH)
    assert 'odom_linear_scale' in _node_parameter_keys()
    assert 'odom_linear_scale' in _node_declared_parameters()


def _argument_defaults(path):
    return {call.args[0].value: next(
        (getattr(kw.value, 'value', None) for kw in call.keywords if kw.arg == 'default_value'),
        None)
        for call in _calls(_tree(path), 'DeclareLaunchArgument')}


def test_safety_defaults_agree_between_launch_and_node():
    launch = _argument_defaults(_BRIDGE_LAUNCH)
    with open(_NODE_SOURCES[0], encoding='utf-8') as source:
        node = source.read()
    for name in ('feedback_timeout', 'feedback_recovery_time', 'serial_write_stall_timeout'):
        assert f"declare_parameter('{name}', {launch[name]})" in node, name
    assert "declare_parameter('ekf_toggle_service', 'toggle')" in node
    assert launch['ekf_toggle_service'] == 'toggle'


def test_real_robot_launch_enables_the_link_latch():
    assert _argument_defaults(_MANUAL_LAUNCH)['require_stm32_link'] == 'true'
    source = open(_MANUAL_LAUNCH, encoding='utf-8').read()
    assert "'require_stm32_link': ParameterValue(" in source
    nav = os.path.join(_SRC, 'robot_navigation/launch/navigation.launch.py')
    assert _argument_defaults(nav)['require_stm32_link'] == 'true'
    assert "'require_stm32_link': LaunchConfiguration('require_stm32_link')" in open(
        nav, encoding='utf-8').read()


def test_mode_manager_listens_to_the_topic_the_bridge_publishes():
    bridge = open(_NODE_SOURCES[0], encoding='utf-8').read()
    manager = open(os.path.join(_SRC, 'robot_control/robot_control/mode_manager_node.py'),
                   encoding='utf-8').read()
    assert "create_publisher(Bool, 'stm32_link_ok', 1)" in bridge
    assert "Bool, 'stm32_link_ok', self._stm32_link_callback" in manager

