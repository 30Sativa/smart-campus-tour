"""Robot-side POI head (ADR-0045 addendum 14/11/2026): presets, POI list, Nav2 goal events. No ROS needed."""

import json
import math
import threading
import unittest
from pathlib import Path

from fleet_bridge.head_worker import PoiListWorker
from fleet_bridge.http_client import HttpResponse, TransportFailure
from fleet_bridge.poi_head import (
    FRONT,
    HeadAction,
    PoiHeadDirector,
    PoiSnapshot,
    PoiTarget,
    nearest_poi,
    parse_pois_response,
    preset_action,
    yaw_correction_deg,
)

FIXTURE = Path(__file__).resolve().parent / 'fixtures/fleet-head/pois-response.json'
EXECUTING, SUCCEEDED, CANCELED, ABORTED, ACCEPTED = 2, 4, 5, 6, 1
LIBRARY = PoiTarget('p1', 'Thư viện', 3.25, -1.5, 'ANGLE:45,10')
FIELD = PoiTarget('p2', 'Sân bóng', 12.0, 4.75, 'RIGHT')
HALL = PoiTarget('p3', 'Sảnh chính', -2.5, 0.4, 'SWEEP:135')
QUIET = PoiTarget('p4', 'Phòng lab', 6.0, 6.0, 'NONE')


class FakeActuator:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def angle(self, pan, tilt):
        self.calls.append(('angle', pan, tilt))
        if self.fail:
            raise RuntimeError('head/set unavailable')

    def sweep(self, amplitude):
        self.calls.append(('sweep', amplitude))


def director(auto=True, pois=(LIBRARY, FIELD, HALL, QUIET), actuator=None, logs=None):
    actuator = actuator or FakeActuator()
    d = PoiHeadDirector(actuator, 0.6, (logs.append if logs is not None else None))
    d.set_snapshot(PoiSnapshot('TOUR', auto, tuple(pois)))
    d.on_goal_status([], None)   # first message = latched backlog
    return d, actuator


class PresetTests(unittest.TestCase):
    def test_every_staff_preset_maps_to_one_head_motion(self):
        self.assertEqual(preset_action('FRONT'), FRONT)
        self.assertEqual(preset_action('LEFT'), HeadAction('angle', 90.0, 0.0))
        self.assertEqual(preset_action('right'), HeadAction('angle', -90.0, 0.0))
        self.assertEqual(preset_action('ANGLE:-120.5,-18'), HeadAction('angle', -120.5, -18.0))
        self.assertEqual(preset_action('SWEEP'), HeadAction('sweep'))
        self.assertEqual(preset_action('SWEEP:90'), HeadAction('sweep', sweep_deg=90.0))

    def test_none_unknown_and_out_of_limit_presets_do_nothing(self):
        for preset in ('NONE', 'HEAD_LEFT', 'ANGLE:171,0', 'ANGLE:0,18.1', 'ANGLE:0,27', 'SWEEP:5', 'SWEEP:171',
                       'ANGLE:1,2,3', '', None, 12):
            with self.subTest(preset=preset):
                self.assertIsNone(preset_action(preset))


class ParseTests(unittest.TestCase):
    def test_contract_sample_parses(self):
        snapshot = parse_pois_response(json.loads(FIXTURE.read_text(encoding='utf-8')))
        self.assertEqual((snapshot.source, snapshot.auto_motion, len(snapshot.pois)), ('TOUR', True, 3))
        self.assertEqual(snapshot.pois[0], PoiTarget('1a2b3c4d-0000-4000-8000-000000000001', 'Thư viện', 3.25, -1.5,
                                                     'ANGLE:45,10', 1.5708))

    def test_bad_bodies_are_rejected(self):
        good = json.loads(FIXTURE.read_text(encoding='utf-8'))
        bad_values = [None, {}, {'data': None}, {'data': {**good['data'], 'source': 'ELSEWHERE'}},
                      {'data': {**good['data'], 'autoMotion': 'yes'}}, {'data': {**good['data'], 'pois': {}}},
                      {'data': {**good['data'], 'pois': [{'id': 'a', 'name': 'b', 'x': 'nan', 'y': 0,
                                                          'cameraPreset': 'FRONT'}]}},
                      {'data': {**good['data'], 'pois': [{'id': 'a', 'name': 'b', 'x': float('inf'), 'y': 0,
                                                          'cameraPreset': 'FRONT'}]}},
                      {'data': {**good['data'], 'pois': [{'id': 'a', 'name': 'b', 'x': 0, 'y': 0, 'yaw': 'north',
                                                          'cameraPreset': 'FRONT'}]}}]
        for body in bad_values:
            with self.subTest(body=body):
                with self.assertRaises(ValueError):
                    parse_pois_response(body)

    def test_nearest_poi_within_radius(self):
        pois = (LIBRARY, FIELD)
        self.assertEqual(nearest_poi(pois, 3.6, -1.4, 0.6), LIBRARY)
        self.assertIsNone(nearest_poi(pois, 5.0, -1.5, 0.6))


class DirectorTests(unittest.TestCase):
    def test_new_goal_turns_the_head_to_the_front(self):
        d, actuator = director()
        d.on_goal_status([(b'g1', ACCEPTED)], (0.0, 0.0))
        self.assertEqual(actuator.calls, [])
        d.on_goal_status([(b'g1', EXECUTING)], (0.0, 0.0))
        d.on_goal_status([(b'g1', EXECUTING)], (0.5, 0.0))   # repeated status: once only
        self.assertEqual(actuator.calls, [('angle', 0.0, 0.0)])

    def test_arrival_near_a_poi_does_its_preset(self):
        d, actuator = director()
        d.on_goal_status([(b'g1', EXECUTING)], (0.0, 0.0))
        d.on_goal_status([(b'g1', SUCCEEDED)], (3.4, -1.3))
        d.on_goal_status([(b'g1', SUCCEEDED)], (3.4, -1.3))
        self.assertEqual(actuator.calls, [('angle', 0.0, 0.0), ('angle', 45.0, 10.0)])

    def test_each_poi_gets_its_own_angle(self):
        d, actuator = director()
        d.on_goal_status([(b'g1', SUCCEEDED)], (12.1, 4.7))
        d.on_goal_status([(b'g1', SUCCEEDED), (b'g2', EXECUTING)], (12.1, 4.7))
        d.on_goal_status([(b'g1', SUCCEEDED), (b'g2', SUCCEEDED)], (-2.4, 0.5))
        self.assertEqual(actuator.calls, [('angle', -90.0, 0.0), ('angle', 0.0, 0.0), ('sweep', 135.0)])

    def test_arrival_away_from_pois_none_preset_or_failed_goal_leaves_the_head(self):
        d, actuator = director()
        d.on_goal_status([(b'g1', SUCCEEDED)], (50.0, 50.0))
        d.on_goal_status([(b'g2', SUCCEEDED)], (6.1, 6.0))      # NONE preset
        d.on_goal_status([(b'g3', ABORTED)], (3.25, -1.5))
        d.on_goal_status([(b'g4', CANCELED)], (3.25, -1.5))
        self.assertEqual(actuator.calls, [])

    def test_unknown_pose_at_arrival_is_logged_not_guessed(self):
        logs = []
        d, actuator = director(logs=logs)
        d.on_goal_status([(b'g1', SUCCEEDED)], None)
        self.assertEqual(actuator.calls, [])
        self.assertTrue(any('pose is unknown' in line for line in logs))

    def test_auto_motion_off_does_nothing(self):
        d, actuator = director(auto=False)
        d.on_goal_status([(b'g1', EXECUTING)], (0.0, 0.0))
        d.on_goal_status([(b'g1', SUCCEEDED)], (3.25, -1.5))
        self.assertEqual(actuator.calls, [])

    def test_backlog_at_startup_is_not_an_arrival(self):
        actuator = FakeActuator()
        d = PoiHeadDirector(actuator, 0.6)
        d.set_snapshot(PoiSnapshot('MAP', True, (LIBRARY,)))
        d.on_goal_status([(b'old', SUCCEEDED), (b'run', EXECUTING)], (3.25, -1.5))
        self.assertEqual(actuator.calls, [])
        d.on_goal_status([(b'old', SUCCEEDED), (b'run', SUCCEEDED)], (3.25, -1.5))
        self.assertEqual(actuator.calls, [('angle', 45.0, 10.0)])

    def test_a_goal_first_seen_already_succeeded_still_counts(self):
        d, actuator = director()
        d.on_goal_status([(b'fast', SUCCEEDED)], (3.25, -1.5))
        self.assertEqual(actuator.calls, [('angle', 45.0, 10.0)])

    def test_a_failing_head_service_is_logged_and_does_not_raise(self):
        logs = []
        d, actuator = director(actuator=FakeActuator(fail=True), logs=logs)
        self.assertEqual(d.on_goal_status([(b'g1', EXECUTING)], (0.0, 0.0)), [])
        self.assertTrue(any('failed (RuntimeError)' in line for line in logs))

    def test_radius_must_be_positive(self):
        with self.assertRaises(ValueError):
            PoiHeadDirector(FakeActuator(), 0.0)


class FakeTransport:
    def __init__(self, responses):
        self.responses = list(responses)

    def pois(self):
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class PoiListWorkerTests(unittest.TestCase):
    def test_refresh_replaces_the_list_and_failures_keep_the_last_one(self):
        body = json.loads(FIXTURE.read_text(encoding='utf-8'))
        d = PoiHeadDirector(FakeActuator(), 0.6)
        logs = []
        worker = PoiListWorker(FakeTransport([
            HttpResponse(200, body),
            TransportFailure('URLError'),
            HttpResponse(503, {'errors': {'code': 'UNAVAILABLE'}}),
            HttpResponse(200, {'data': {'source': 'TOUR'}}),
        ]), d, 5.0, logs.append)
        self.assertTrue(worker.run_once())
        self.assertEqual(len(d.snapshot.pois), 3)
        self.assertFalse(worker.run_once())
        self.assertFalse(worker.run_once())
        self.assertFalse(worker.run_once())
        self.assertEqual(len(d.snapshot.pois), 3)
        self.assertEqual(len(logs), 3)

    def test_run_stops_when_asked(self):
        body = json.loads(FIXTURE.read_text(encoding='utf-8'))
        stop = threading.Event()
        calls = []

        def wait(seconds):
            calls.append(seconds)
            stop.set()
            return True

        d = PoiHeadDirector(FakeActuator(), 0.6)
        PoiListWorker(FakeTransport([HttpResponse(200, body)]), d, 5.0, stop_event=stop, wait=wait).run()
        self.assertEqual(calls, [5.0])
        self.assertTrue(d.snapshot.auto_motion)


if __name__ == '__main__':
    unittest.main()


class YawCorrectionTests(unittest.TestCase):
    """Nav2 stops within 0.30 rad of the POI yaw; the PAN makes up for it so the camera looks where Staff set it."""

    EAST = PoiTarget('e', 'Cổng', 0.0, 0.0, 'ANGLE:45,10', 0.0)

    def arrive(self, poi, robot_yaw_deg, max_deg=30.0, logs=None):
        actuator = FakeActuator()
        d = PoiHeadDirector(actuator, 0.6, (logs.append if logs is not None else None), max_deg)
        d.set_snapshot(PoiSnapshot('TOUR', True, (poi,)))
        d.on_goal_status([], None)
        d.on_goal_status([(b'g', SUCCEEDED)], (0.1, 0.0, math.radians(robot_yaw_deg)))
        return actuator.calls

    def test_robot_stopped_turned_right_turns_the_head_further_left(self):
        # Robot 10 deg clockwise of the POI yaw: 45 left of the robot would look 10 deg short, so 55.
        self.assertEqual(self.arrive(self.EAST, -10.0), [('angle', 55.0, 10.0)])
        self.assertEqual(self.arrive(self.EAST, 12.0), [('angle', 33.0, 10.0)])

    def test_front_left_and_right_are_corrected_too_and_clamped_to_the_limit(self):
        front = PoiTarget('f', 'Sảnh', 0.0, 0.0, 'FRONT', 0.0)
        self.assertEqual(self.arrive(front, 15.0), [('angle', -15.0, 0.0)])
        edge = PoiTarget('l', 'Lab', 0.0, 0.0, 'ANGLE:165,0', 0.0)
        self.assertEqual(self.arrive(edge, -15.0), [('angle', 170.0, 0.0)])

    def test_wraps_across_pi(self):
        self.assertAlmostEqual(yaw_correction_deg(math.radians(175), math.radians(-175)), -10.0)
        self.assertIsNone(yaw_correction_deg(None, 0.0))
        self.assertIsNone(yaw_correction_deg(0.0, None))

    def test_no_yaw_sweep_off_switch_or_a_large_error_leave_the_preset_as_set(self):
        no_yaw = PoiTarget('n', 'Cổng', 0.0, 0.0, 'ANGLE:45,10')
        self.assertEqual(self.arrive(no_yaw, -10.0), [('angle', 45.0, 10.0)])
        sweep = PoiTarget('s', 'Sân', 0.0, 0.0, 'SWEEP:90', 0.0)
        self.assertEqual(self.arrive(sweep, -10.0), [('sweep', 90.0)])
        self.assertEqual(self.arrive(self.EAST, -10.0, max_deg=0.0), [('angle', 45.0, 10.0)])
        logs = []
        self.assertEqual(self.arrive(self.EAST, -60.0, logs=logs), [('angle', 45.0, 10.0)])
        self.assertTrue(any('not corrected' in line for line in logs))

    def test_two_value_pose_still_works(self):
        actuator = FakeActuator()
        d = PoiHeadDirector(actuator, 0.6)
        d.set_snapshot(PoiSnapshot('TOUR', True, (self.EAST,)))
        d.on_goal_status([], None)
        d.on_goal_status([(b'g', SUCCEEDED)], (0.1, 0.0))
        self.assertEqual(actuator.calls, [('angle', 45.0, 10.0)])

    def test_correction_limit_is_checked(self):
        for bad in (-1.0, 91.0):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    PoiHeadDirector(FakeActuator(), 0.6, None, bad)


class DrivingTests(unittest.TestCase):
    """While a goal is active the Operator's head is locked (head_block_while_driving)."""

    def test_driving_follows_the_goal_status(self):
        d, _ = director(auto=False)
        self.assertFalse(d.driving())
        d.on_goal_status([(b'g1', ACCEPTED)], (0.0, 0.0))
        self.assertTrue(d.driving())
        d.on_goal_status([(b'g1', EXECUTING)], (0.0, 0.0))
        self.assertTrue(d.driving())
        d.on_goal_status([(b'g1', SUCCEEDED)], (3.0, 0.0))
        self.assertFalse(d.driving())
        d.on_goal_status([(b'g1', SUCCEEDED), (b'g2', EXECUTING)], (3.0, 0.0))
        self.assertTrue(d.driving())
        d.on_goal_status([(b'g1', SUCCEEDED), (b'g2', ABORTED)], (5.0, 0.0))
        self.assertFalse(d.driving())

    def test_a_bridge_restarted_mid_drive_knows_from_the_latched_backlog(self):
        d = PoiHeadDirector(FakeActuator(), 0.6)
        d.on_goal_status([(b'run', EXECUTING)], None)   # first message: no head action, but it is driving
        self.assertTrue(d.driving())

    def test_departure_ends_a_held_jog_once_per_goal_even_without_auto_motion(self):
        d, _ = director(auto=False)
        released = []
        d.set_on_departure(lambda: released.append(True))
        d.on_goal_status([(b'g1', EXECUTING)], (0.0, 0.0))
        d.on_goal_status([(b'g1', EXECUTING)], (0.5, 0.0))
        self.assertEqual([True], released)
