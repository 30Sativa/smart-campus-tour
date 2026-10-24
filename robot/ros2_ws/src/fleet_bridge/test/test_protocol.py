import json
import math
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fleet_bridge.protocol import (
    build_report,
    pose_from_transform,
    serialize_report,
)

NOW = datetime(2026, 10, 23, 12, 0, 0, tzinfo=timezone.utc)
STREAM_ID = '90eb5a67-dfea-48b0-aea1-ef3ed6d98695'
FIXTURE = Path(__file__).resolve().parent / 'fixtures/sync-request.json'


def _repository_contract_fixture() -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / 'docs/contracts/fleet-sync/v1/sync-request.json'
        if candidate.is_file():
            return candidate
    return None


class Obj:
    pass


def transform(*, frame='map', child='base_footprint', stamp=NOW, x=1.25, y=-0.5, yaw=0.25,
              quaternion=None):
    result = Obj()
    result.header = Obj()
    result.header.frame_id = frame
    result.header.stamp = Obj()
    result.header.stamp.sec = int(stamp.timestamp())
    result.header.stamp.nanosec = stamp.microsecond * 1000
    result.child_frame_id = child
    result.transform = Obj()
    result.transform.translation = Obj()
    result.transform.translation.x = x
    result.transform.translation.y = y
    result.transform.rotation = Obj()
    if quaternion is None:
        result.transform.rotation.x = 0.0
        result.transform.rotation.y = 0.0
        result.transform.rotation.z = math.sin(yaw / 2)
        result.transform.rotation.w = math.cos(yaw / 2)
    else:
        (result.transform.rotation.x, result.transform.rotation.y,
         result.transform.rotation.z, result.transform.rotation.w) = quaternion
    return result


class FleetSyncProtocolTests(unittest.TestCase):
    def test_package_fixture_mirrors_repository_contract_when_present(self):
        repository_fixture = _repository_contract_fixture()
        if repository_fixture is not None:
            self.assertEqual(repository_fixture.read_bytes(), FIXTURE.read_bytes())

    def test_json_matches_fleet_sync_v1_fixture_fields_and_null_unknowns(self):
        fixture = json.loads(FIXTURE.read_text(encoding='utf-8'))
        observation = pose_from_transform(transform(), NOW, 'map', 'base_footprint', 5.0)
        report = build_report(
            'robot_01', STREAM_ID, 1, NOW, 'campus-floor-a-v1', 'map', observation.pose, 'UNKNOWN')

        self.assertEqual(set(fixture), set(report))
        self.assertEqual('robot_01', report['robotId'])
        self.assertEqual(STREAM_ID, report['streamId'])
        self.assertEqual(1, report['seq'])
        self.assertEqual('campus-floor-a-v1', report['mapKey'])
        self.assertEqual('map', report['frameId'])
        self.assertAlmostEqual(1.25, report['pose']['x'])
        self.assertAlmostEqual(-0.5, report['pose']['y'])
        self.assertAlmostEqual(0.25, report['pose']['yaw'])
        self.assertEqual(NOW.isoformat(timespec='microseconds').replace('+00:00', 'Z'),
                         report['pose']['capturedAt'])
        self.assertEqual('UNKNOWN', report['status'])
        self.assertIsNone(report['legId'])
        self.assertIsNone(report['localized'])
        self.assertIsNone(report['motionReady'])
        self.assertIsNone(report['faultCode'])
        self.assertIsNone(report['batteryPercent'])
        self.assertNotIn('commands', report)
        self.assertEqual(report, json.loads(serialize_report(report)))

    def test_missing_tf_produces_null_pose_and_keeps_localization_unknown(self):
        observation = pose_from_transform(None, NOW, 'map', 'base_footprint', 5.0)
        report = build_report(
            'robot_01', STREAM_ID, 1, NOW, 'campus-floor-a-v1', 'map', observation.pose, 'UNKNOWN')

        self.assertEqual('tf_unavailable', observation.reason)
        self.assertIsNone(report['pose'])
        self.assertIsNone(report['localized'])
        self.assertEqual('UNKNOWN', report['status'])

    def test_stale_tf_keeps_original_capture_time_instead_of_refreshing_it(self):
        captured = NOW - timedelta(seconds=60)
        observation = pose_from_transform(
            transform(stamp=captured), NOW, 'map', 'base_footprint', 5.0)

        self.assertTrue(observation.stale)
        self.assertEqual(60.0, observation.age_sec)
        self.assertEqual(captured.isoformat(timespec='microseconds').replace('+00:00', 'Z'),
                         observation.pose['capturedAt'])

    def test_transform_frame_pair_must_match_configured_map_and_base(self):
        for frame, child in (('odom', 'base_footprint'), ('map', 'base_link')):
            with self.subTest(frame=frame, child=child):
                observation = pose_from_transform(
                    transform(frame=frame, child=child), NOW, 'map', 'base_footprint', 5.0)
                self.assertIsNone(observation.pose)
                self.assertEqual('tf_frame_mismatch', observation.reason)

    def test_invalid_or_future_tf_never_becomes_a_pose(self):
        invalid = pose_from_transform(
            transform(quaternion=(0.0, 0.0, 0.0, 0.0)), NOW, 'map', 'base_footprint', 5.0)
        future = pose_from_transform(
            transform(stamp=NOW.replace(second=1)), NOW, 'map', 'base_footprint', 5.0)
        self.assertIsNone(invalid.pose)
        self.assertIsNone(future.pose)
        self.assertEqual('tf_from_future', future.reason)

    def test_contract_rejects_leg_status_without_a_leg_id(self):
        with self.assertRaisesRegex(ValueError, 'legId'):
            build_report('robot_01', STREAM_ID, 1, NOW, 'map-a', 'map', None, 'NAVIGATING')

if __name__ == '__main__':
    unittest.main()
