"""Pure wire-format tests for the real-robot pose telemetry (no ROS needed)."""
from datetime import datetime, timezone
import math
import unittest

from fleet_bridge.telemetry import (localization_quality, map_pose_payload,
                                    robot_authorization, yaw_from_quaternion)

NOW = datetime(2026, 9, 25, 8, 0, 0, tzinfo=timezone.utc)


def payload(**changes):
    values = dict(robot_code='robot_01', source='physical', map_key='campus_v1',
                  frame_id='map', stream_id='s', seq=1, x=1.0, y=2.0, yaw=0.5,
                  localized=True, cov_xy=0.04, captured_at=NOW)
    values.update(changes)
    return map_pose_payload(**values)


class MapTelemetryTest(unittest.TestCase):
    def test_yaw_from_quaternion(self):
        half = math.pi / 4
        self.assertAlmostEqual(yaw_from_quaternion(0, 0, math.sin(half), math.cos(half)), math.pi / 2)
        self.assertAlmostEqual(yaw_from_quaternion(0, 0, 0, 2), 0.0)
        with self.assertRaises(ValueError):
            yaw_from_quaternion(0, 0, 0, 0)

    def test_localization_quality(self):
        cov = [0.0] * 36
        cov[0], cov[7] = 0.04, 0.09
        self.assertEqual(localization_quality(cov, 0.25), (True, 0.09))
        cov[7] = 0.5
        self.assertEqual(localization_quality(cov, 0.25), (False, 0.5))
        self.assertEqual(localization_quality(None, 0.25), (False, None))
        cov[0] = float('nan')
        self.assertEqual(localization_quality(cov, 0.25), (False, None))

    def test_payload_shape(self):
        body = payload()
        self.assertEqual(body['robotCode'], 'robot_01')
        self.assertEqual(body['mapKey'], 'campus_v1')
        self.assertEqual(body['capturedAt'], '2026-09-25T08:00:00+00:00')
        self.assertTrue(body['localized'])
        self.assertEqual(body['covXY'], 0.04)

    def test_payload_rejects_what_the_backend_would(self):
        for bad in (dict(source='drone'), dict(seq=0), dict(x=float('inf')),
                    dict(yaw=4.0), dict(map_key=''), dict(captured_at=NOW.replace(tzinfo=None))):
            with self.assertRaises(ValueError, msg=str(bad)):
                payload(**bad)
        self.assertIsNone(payload(cov_xy=float('nan'))['covXY'])

    def test_authorization_header(self):
        self.assertEqual(robot_authorization('robot_01', 'abc'), 'Robot robot_01:abc')
        with self.assertRaises(ValueError):
            robot_authorization('robot_01', '')


if __name__ == '__main__':
    unittest.main()
