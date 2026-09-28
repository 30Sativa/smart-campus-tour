"""Pure wire-format tests for development-only Gazebo SimulationPreview."""
import math
import unittest
from types import SimpleNamespace

from gazebo_preview_bridge.telemetry import pose_payload


def gazebo_pose(*, x=1.25, y=-2.5, z=0.3, qx=0.0, qy=0.0, qz=0.0, qw=1.0):
    return SimpleNamespace(
        position=SimpleNamespace(x=x, y=y, z=z),
        orientation=SimpleNamespace(x=qx, y=qy, z=qz, w=qw),
    )


class GazeboTelemetryTest(unittest.TestCase):
    def test_payload_shape_and_yaw(self):
        body = pose_payload(gazebo_pose(qz=math.sin(math.pi / 4), qw=math.cos(math.pi / 4)),
                            'robot_gz_01', 'campus_preview', 'stream-1', 4)

        self.assertEqual(body['robotId'], 'robot_gz_01')
        self.assertEqual(body['source'], 'gazebo')
        self.assertEqual(body['worldId'], 'campus_preview')
        self.assertEqual(body['frameId'], 'gazebo_world')
        self.assertEqual(body['streamId'], 'stream-1')
        self.assertEqual(body['seq'], 4)
        self.assertEqual((body['x'], body['y'], body['z']), (1.25, -2.5, 0.3))
        self.assertAlmostEqual(body['yaw'], math.pi / 2)
        self.assertTrue(body['capturedAt'].endswith('+00:00'))

    def test_payload_rejects_non_finite_coordinates(self):
        with self.assertRaisesRegex(ValueError, 'Non-finite'):
            pose_payload(gazebo_pose(x=float('nan')), 'robot_gz_01', 'campus_preview', 's', 1)

    def test_payload_rejects_degenerate_quaternion(self):
        with self.assertRaisesRegex(ValueError, 'Invalid Gazebo quaternion'):
            pose_payload(gazebo_pose(qw=0.0), 'robot_gz_01', 'campus_preview', 's', 1)


if __name__ == '__main__':
    unittest.main()
