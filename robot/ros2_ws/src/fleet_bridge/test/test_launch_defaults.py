import ast
import unittest
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parents[1]


class FleetBridgeLaunchDefaultTests(unittest.TestCase):
    def test_launch_namespace_default_matches_available_operations_guides(self):
        launch_path = PACKAGE_ROOT / 'launch/fleet_bridge.launch.py'
        launch_tree = ast.parse(launch_path.read_text(encoding='utf-8'))
        namespace_arguments = []
        for node in ast.walk(launch_tree):
            if not isinstance(node, ast.Call):
                continue
            if not isinstance(node.func, ast.Name) or node.func.id != 'DeclareLaunchArgument':
                continue
            if not node.args or not isinstance(node.args[0], ast.Constant):
                continue
            if node.args[0].value != 'robot_namespace':
                continue
            default = next(keyword.value for keyword in node.keywords
                           if keyword.arg == 'default_value')
            namespace_arguments.append(default.value)

        self.assertEqual(['robot_01'], namespace_arguments)
        package_guide = (PACKAGE_ROOT / 'README.md').read_text(encoding='utf-8')
        self.assertIn('launch namespace\ndefaults to `robot_01`', package_guide)

        robot_root = PACKAGE_ROOT.parents[2]
        robot_guide = robot_root / 'docs/fleet-bridge.md'
        if robot_guide.is_file():
            guide_text = robot_guide.read_text(encoding='utf-8')
            self.assertIn('launch defaults to namespace `robot_01`', guide_text)
            self.assertIn('robot_namespace:=robot_01', guide_text)
            self.assertIn('check_fleet_time_sync.py', guide_text)


if __name__ == '__main__':
    unittest.main()
