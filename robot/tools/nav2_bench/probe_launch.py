#!/usr/bin/env python3
"""Resolve the REAL robot_navigation/navigation.launch.py (no process is started) and print the
parameters that would reach controller_server / velocity_smoother / bt_navigator for a given
nav2_params_file. Read-only. Usage: probe_launch.py NAV2_PARAMS_FILE [extra:=args ...]"""
import sys, os, yaml
from unittest import mock
from launch import LaunchContext
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.utilities import visit_all_entities_and_collect_futures
from launch_ros.actions import Node
from launch_ros.utilities import evaluate_parameters
from ament_index_python.packages import get_package_share_directory

params = os.path.abspath(sys.argv[1])
ctx = LaunchContext()
args = dict(robot_id='robot_01', enable_camera='false', rviz='false', nav2_params_file=params,
            map=os.path.expanduser('~/smart-campus-tour/robot/robot_maps/map2.yaml'))
for a in sys.argv[2:]:
    k, v = a.split(':=', 1); args[k] = v
ctx.launch_configurations.update(args)
found = {}; ALL = []
WANT = ('controller_server', 'velocity_smoother', 'bt_navigator', 'planner_server', 'stm32_bridge_node', 'robot_state_publisher')

def capture(node, nctx):
    try:
        node._perform_substitutions(nctx)
        name = node.node_name.split('/')[-1] if node.node_name else node.node_executable
        if 'unspecified' in str(name):
            name = node.node_executable
    except Exception:
        name = getattr(node, 'node_executable', '?')
    ALL.append(str(name))
    if any(w in str(name) for w in WANT):
        try:
            found[name] = evaluate_parameters(nctx, node._Node__parameters)
        except Exception as e:
            found[name] = f'ERR {e}'
    return []

launch = os.path.join(get_package_share_directory('robot_navigation'), 'launch', 'navigation.launch.py')
with mock.patch.object(Node, 'execute', capture):
    src = PythonLaunchDescriptionSource(launch)
    visit_all_entities_and_collect_futures(src.get_launch_description(ctx), ctx)

def flat(plist, node):
    """Merge parameters for `node` from dicts and (rewritten) YAML files, whatever the root nesting."""
    out = {}
    def walk(d, pre=''):
        for k, v in d.items():
            if isinstance(v, dict): walk(v, pre + k + '.')
            else: out[pre + k] = v
    def find(y):
        if isinstance(y, dict):
            for k, v in y.items():
                if isinstance(v, dict) and 'ros__parameters' in v and (k == node or k.endswith('/' + node) or k == '/**'):
                    walk(v['ros__parameters'])
                elif isinstance(v, dict):
                    find(v)
    for p in plist:
        if isinstance(p, dict):
            out.update({str(k): v for k, v in p.items()})
        else:
            find(yaml.safe_load(open(str(p))))
    return out

print('launch file:', launch)
print('nav2_params_file:', params); print('nodes captured:', sorted(found)); print('all nodes:', ALL)
for name, plist in sorted(found.items()):
    if isinstance(plist, str):
        print(name, plist); continue
    P = flat(plist, name.split('/')[-1])
    keys = {'controller_server': ['FollowPath.lookahead_dist', 'FollowPath.desired_linear_vel', 'FollowPath.rotate_to_heading_angular_vel', 'FollowPath.use_collision_detection', 'goal_checker.plugin'],
            'velocity_smoother': ['max_velocity', 'max_accel', 'max_decel'],
            'bt_navigator': ['default_nav_to_pose_bt_xml', 'default_server_timeout'],
            'planner_server': ['GridBased.plugin'],
            'robot_state_publisher': [], 'stm32_bridge_node': ['wheel_radius', 'odom_linear_scale']}
    for k in next((v for kk, v in keys.items() if kk in name), []):
        print(f'  {name}: {k} = {P.get(k, "<missing>")}')
    if 'robot_state_publisher' in name:
        rd = str(P.get('robot_description', ''))
        i = rd.find('lidar_joint'); seg = rd[i:i + 300]
        import re
        m = re.search(r'rpy="([^"]+)"', seg)
        print(f'  robot_state_publisher: lidar_joint rpy = {m.group(1) if m else "?"}')
