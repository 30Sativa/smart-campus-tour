"""Offline checks for image/profile isolation; actual packages need image tests."""

import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

import yaml

from runtime_dependencies import apt_packages, resolve


ROBOT = Path(__file__).resolve().parents[1]
SIM_KEYS = {
    'gazebo_ros', 'gazebo_ros2_control', 'gazebo_msgs', 'controller_manager',
    'diff_drive_controller', 'joint_state_broadcaster',
}
DEBUG_KEYS = {'joint_state_publisher_gui', 'rviz2'}


def stages(source):
    result = {}
    current = None
    for line in source.replace('\\\n', ' ').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        match = re.match(r'FROM\s+(\S+)\s+AS\s+(\S+)', line, re.I)
        if match:
            parent, current = match.groups()
            result[current] = {'parent': parent, 'instructions': []}
        elif current:
            result[current]['instructions'].append(line.strip())
    return result


class ImageProfilesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dockerfile = (ROBOT / 'Dockerfile').read_text(encoding='utf-8')
        cls.stages = stages(cls.dockerfile)
        cls.compose = yaml.safe_load(
            (ROBOT / 'docker-compose.yml').read_text(encoding='utf-8'))

    def ancestors(self, target):
        result = []
        while target in self.stages:
            self.assertNotIn(target, result, 'Stage inheritance cycle')
            result.append(target)
            target = self.stages[target]['parent']
        return result

    def instructions(self, target):
        return '\n'.join(
            instruction for stage in self.ancestors(target)
            for instruction in self.stages[stage]['instructions'])

    def test_default_ci_image_is_hardware_and_never_inherits_dev_layers(self):
        # CI deliberately has no target argument; Docker builds the last stage.
        self.assertEqual(list(self.stages)[-1], 'hardware')
        self.assertEqual(self.ancestors('hardware'), ['hardware', 'runtime', 'base'])
        self.assertEqual(self.ancestors('debug'), ['debug', 'dependencies', 'base'])
        self.assertEqual(self.ancestors('sim'), ['sim', 'dependencies', 'base'])
        for target in ('debug', 'sim'):
            self.assertIn('COPY --from=development-builder /ros2_ws/ /ros2_ws/', self.instructions(target))
        hardware = self.instructions('hardware')
        for tool in ('rqt', 'plotjuggler', 'gazebo', 'rviz2'):
            self.assertNotRegex(hardware, rf'"ros-\$\{{ROS_DISTRO\}}-{tool}')
        self.assertIn('dpkg-query', hardware)  # Actual build-time negative guard.

    def test_only_optional_runtime_dependencies_are_skipped(self):
        dependencies_stage = self.instructions('dependencies')
        skip = re.search(r'ARG OPTIONAL_ROS_KEYS="([^"]+)"', dependencies_stage)
        self.assertIsNotNone(skip)
        self.assertEqual(set(skip.group(1).split()), SIM_KEYS | DEBUG_KEYS)
        dependencies = set()
        for manifest in (ROBOT / 'ros2_ws/src').glob('*/package.xml'):
            dependencies.update(
                element.text for element in ET.parse(manifest).getroot()
                if element.tag.endswith('_depend') or element.tag == 'depend')
        self.assertTrue(SIM_KEYS | DEBUG_KEYS <= dependencies)
        self.assertIn('COPY --parents ros2_ws/src/**/package.xml', dependencies_stage)
        # Keep ROS build/overlay behavior, including live source rebuilds.
        builder = self.instructions('builder')
        self.assertIn('colcon build', builder)
        self.assertNotIn('--symlink-install', builder)
        self.assertNotIn('--packages-skip', builder)
        self.assertIn('colcon build --symlink-install', self.instructions('development-builder'))
        self.assertNotIn('xacro', set(skip.group(1).split()))

    def test_debug_tools_and_simulation_dependencies_are_installed_separately(self):
        debug = self.instructions('debug')
        for package in (
            'rviz2', 'compressed-image-transport', 'joint-state-publisher-gui', 'rqt',
            'rqt-graph', 'rqt-topic', 'rqt-plot', 'rqt-reconfigure',
            'rqt-service-caller', 'plotjuggler-ros',
        ):
            self.assertIn(f'"ros-${{ROS_DISTRO}}-{package}"', debug)
        # Pull the PlotJuggler binary transitively; no duplicate apt install.
        self.assertNotIn('"ros-${ROS_DISTRO}-plotjuggler"', debug)
        sim = '\n'.join(self.stages['sim']['instructions'])
        self.assertIn('rosdep install --from-paths ros2_ws/src --ignore-src', sim)
        self.assertNotIn('--skip-keys', sim)
        self.assertNotIn('compressed-image-transport', sim)
        # Minimal common CLI/rosbag/Fast DDS runtime, no ros-core/base metapackage.
        self.assertEqual(self.stages['base']['parent'], 'ubuntu:22.04')
        self.assertIn('"ros-${ROS_DISTRO}-rosbag2"', self.instructions('base'))
        self.assertIn('"ros-${ROS_DISTRO}-ros2cli-common-extensions"', self.instructions('base'))
        self.assertNotIn('"ros-${ROS_DISTRO}-ros-base"', self.instructions('hardware'))

    def test_hardware_copies_complete_artifacts_without_builder_filesystems(self):
        hardware = self.instructions('hardware')
        self.assertIn('COPY --from=builder /ros2_ws/install /ros2_ws/install', hardware)
        self.assertIn('COPY --from=dependencies /usr/local/lib/python3.10/dist-packages/', hardware)
        for path in ('/ros2_ws/src', '/ros2_ws/build', '/ros2_ws/log', '/root/.ros'):
            self.assertNotRegex(hardware, rf'COPY .*{re.escape(path)}')
        for tool in ('build-essential', 'python3-colcon', 'python3-rosdep', 'python3-pip'):
            for line in hardware.splitlines():
                if 'apt-get install' in line:
                    self.assertNotIn(tool, line)
        # Runtime packages remain metadata-driven and respect apt dependencies.
        self.assertIn('xargs -r apt-get install -y --no-install-recommends', hardware)
        self.assertNotIn('rosdep install', hardware)

    def test_build_guard_rejects_tools_but_allows_required_runtime_libraries(self):
        source = self.instructions('hardware')
        guard = re.search(r'grep -E "([^"]+)" <<<', source).group(1)
        guard = guard.replace('${ROS_DISTRO}', 'humble')
        for package in ('ros-humble-rviz2', 'ros-humble-rqt-graph',
                        'ros-humble-plotjuggler', 'ros-humble-gazebo-ros',
                        'ros-humble-controller-manager', 'build-essential',
                        'g++', 'g++-11', 'git', 'python3-colcon-core', 'python3-rosdep2'):
            self.assertRegex(package, guard)
        for package in ('gcc', 'gcc-11', 'gcc-11:amd64', 'gfortran-11', 'libopenmpi-dev',
                        'libstdc++6:amd64', 'gcc-11-base:amd64',
                        'ros-humble-rviz-common', 'ros-humble-rosidl-typesupport-c',
                        'ros-humble-robot-localization', 'cmake'):
            self.assertNotRegex(package, guard)

    def test_dependency_layers_do_not_depend_on_full_source_or_models(self):
        for target in ('base', 'dependencies', 'runtime'):
            source = '\n'.join(self.stages[target]['instructions'])
            self.assertNotIn('COPY ros2_ws/src ./src', source)
            self.assertNotRegex(source, r'COPY .*models')
        self.assertIn('COPY ros2_ws/src ./src', self.instructions('builder'))
        dependencies = self.stages['dependencies']['instructions']
        pip_at = next(i for i, line in enumerate(dependencies) if 'pip install' in line)
        manifest_at = next(i for i, line in enumerate(dependencies) if 'COPY --parents' in line)
        self.assertLess(pip_at, manifest_at)
        for target in ('debug', 'sim'):
            stage = self.stages[target]['instructions']
            copy_at = stage.index('COPY --from=development-builder /ros2_ws/ /ros2_ws/')
            self.assertTrue(any('apt-get update' in line for line in stage[:copy_at]))
        ignore = (ROBOT / '.dockerignore').read_text(encoding='utf-8').splitlines()
        for pattern in ('models', '.git', '.env', '**/*.db3', '**/*.mcap',
                        '**/build', '**/install', '**/log'):
            self.assertIn(pattern, ignore)

    def test_compose_targets_tags_devices_and_networking(self):
        services = self.compose['services']
        hardware = services['robot-ros2']
        self.assertNotIn('build', hardware)
        self.assertIn('devices', hardware)
        self.assertNotIn('pull_policy', hardware)
        self.assertNotIn('./ros2_ws/src:/ros2_ws/src', hardware['volumes'])
        self.assertIn('${PERSON_MODEL_DIR:-./models}:/opt/models:ro', hardware['volumes'])
        for service, target in (('ros2-debug', 'debug'), ('ros2-sim', 'sim')):
            config = services[service]
            self.assertEqual(config['build']['target'], target)
            self.assertNotIn('devices', config)
            self.assertIn('./ros2_ws/src:/ros2_ws/src', config['volumes'])
        self.assertNotEqual(services['ros2-debug']['image'], services['ros2-sim']['image'])
        for service in services.values():
            self.assertEqual(service['network_mode'], 'host')
            self.assertEqual(service['environment']['ROS_DOMAIN_ID'], '${ROS_DOMAIN_ID:-30}')
            self.assertEqual(service['environment']['RMW_IMPLEMENTATION'],
                             '${RMW_IMPLEMENTATION:-rmw_fastrtps_cpp}')
            self.assertEqual(service['environment']['ROS_LOCALHOST_ONLY'], '${ROS_LOCALHOST_ONLY-0}')
        for name in ('robot-ros2', 'ros2-debug'):
            self.assertIsNone(services[name]['environment']['ROS_DISCOVERY_SERVER'])
            self.assertIn('ROS_DISCOVERY_SERVER must be set in .env', services[name]['command'])
        self.assertNotIn('ROS_DISCOVERY_SERVER', services['ros2-sim']['environment'])

    def test_interactive_shells_inherit_one_auto_source_and_no_network_defaults(self):
        base = self.instructions('base')
        self.assertEqual(base.count('>> /root/.bashrc'), 1)
        self.assertIn('source "/opt/ros/${ROS_DISTRO}/setup.bash"', base)
        self.assertIn('source "/ros2_ws/install/setup.bash"', base)
        for variable in ('ROS_DOMAIN_ID', 'ROS_DISCOVERY_SERVER', 'RMW_IMPLEMENTATION',
                         'ROS_LOCALHOST_ONLY'):
            self.assertNotRegex(self.dockerfile, rf'(?m)^ENV\s+{variable}\b')
        self.assertIn('ARG DEBIAN_FRONTEND=noninteractive', base)
        self.assertIn('ARG TZ=Etc/UTC', base)
        self.assertNotRegex(self.dockerfile, r'(?m)^ENV\s+(DEBIAN_FRONTEND|TZ)\b')
        host = (ROBOT / 'scripts/source-minipc').read_text(encoding='utf-8')
        self.assertIn('set -a\nsource "$ROBOT_ROOT/.env"\nset +a', host)


class RuntimeDependenciesTest(unittest.TestCase):
    def test_apt_output_handles_multiple_keys_architectures_and_duplicates(self):
        self.assertEqual(apt_packages(
            '#ROSDEP[rclpy]\n#apt\nros-humble-rclpy python3-yaml\n'
            '#ROSDEP[libc]\n#apt\nros-humble-rclpy\nlibc6:amd64\n'),
            ['libc6:amd64', 'python3-yaml', 'ros-humble-rclpy'])

    def test_non_apt_empty_or_invalid_resolution_is_a_failure(self):
        for output in ('', '#pip\nopenvino\n', 'python3-yaml\n', '#apt\n--allow-unauthenticated\n',
                       '#ROSDEP[first]\n#apt\npython3-yaml\n#ROSDEP[second]\nlibc6\n'):
            with self.subTest(output=output), self.assertRaises(ValueError):
                apt_packages(output)

    def test_resolver_keeps_installed_runtime_keys_and_filters_optional_ones(self):
        calls = []

        def fake_run(command, **kwargs):
            calls.append((command, kwargs))
            return ('rclpy\ngazebo_ros\nxacro\nrviz2\n' if command[1] == 'keys'
                    else '#apt\nros-humble-rclpy ros-humble-xacro\n')

        with patch.dict('os.environ', AMENT_PREFIX_PATH='/opt/ros/humble',
                        ROS_PACKAGE_PATH='/some/old/workspace'):
            self.assertEqual(resolve('src', 'humble', SIM_KEYS | DEBUG_KEYS, fake_run),
                             ['ros-humble-rclpy', 'ros-humble-xacro'])
        self.assertIn('--dependency-types', calls[0][0])
        self.assertEqual(calls[0][0][-1], 'exec')
        self.assertEqual(calls[1][0][-2:], ['rclpy', 'xacro'])
        for _, options in calls:
            self.assertNotIn('AMENT_PREFIX_PATH', options['env'])
            self.assertNotIn('ROS_PACKAGE_PATH', options['env'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
