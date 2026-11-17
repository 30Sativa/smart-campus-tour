"""ADR-0049 readiness, goal ownership and map content rules. No ROS needed."""

import hashlib
import json
import tempfile
import unittest
import zipfile
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

from fleet_bridge.goal_monitor import FOREIGN_NAV_GOAL, UNOWNED_GOAL_AT_STARTUP, GoalMonitor
from fleet_bridge.map_check import MapChecker, image_name
from fleet_bridge.motion_permit import MotionPermit
from fleet_bridge.protocol import build_report
from fleet_bridge.readiness import (
    MAP_CONTENT_MISMATCH,
    MAP_EVIDENCE_MISSING,
    Observations,
    ReadinessLimits,
    evaluate,
)

from test_commands import MAP, STREAM, goto, make, results

LIMITS = ReadinessLimits()
READY = Observations(
    amcl_covariance=(0.05, 0.05, 0.02), tf_age_sec=0.1, emergency_stop=False, mode='explore',
    gate_state='OPEN', gate_age_sec=0.2, odom_age_sec=0.05, nav2_ready=True, unowned_goal=None, map_fault=None)


def run(**changes):
    return evaluate(replace(READY, **changes), LIMITS)


class LocalizedTests(unittest.TestCase):
    def test_true_when_every_source_passes(self):
        self.assertIs(True, run().localized)

    def test_null_before_any_amcl_pose(self):
        self.assertIsNone(run(amcl_covariance=None).localized)

    def test_false_when_tf_is_stale_or_missing(self):
        self.assertIs(False, run(tf_age_sec=1.01).localized)
        self.assertIs(False, run(tf_age_sec=None).localized)

    def test_false_when_any_covariance_is_over_its_limit(self):
        self.assertIs(False, run(amcl_covariance=(0.25, 0.05, 0.02)).localized)
        self.assertIs(False, run(amcl_covariance=(0.05, 0.25, 0.02)).localized)
        self.assertIs(False, run(amcl_covariance=(0.05, 0.05, 0.07)).localized)

    def test_limits_are_inclusive_and_configurable(self):
        self.assertIs(True, run(amcl_covariance=(0.09, 0.09, 0.05)).localized)
        loose = replace(LIMITS, max_xy_variance=0.3, max_yaw_variance=0.1)
        self.assertIs(True, evaluate(replace(READY, amcl_covariance=(0.25, 0.25, 0.07)), loose).localized)


    def test_numpy_covariance_still_gives_a_json_bool(self):
        # rclpy hands amcl_pose covariance over as numpy; a numpy.bool_ breaks json.dumps in Fleet Sync.
        try:
            import numpy
        except ImportError:
            self.skipTest('numpy not installed')
        covariance = tuple(numpy.float64(value) for value in (0.05, 0.05, 0.02))
        result = evaluate(replace(READY, amcl_covariance=covariance), LIMITS)
        self.assertIs(result.localized, True)
        json.dumps({'localized': result.localized, 'motionReady': result.motion_ready})


class MotionReadyTests(unittest.TestCase):
    def test_true_when_every_condition_holds(self):
        result = run()
        self.assertIs(True, result.motion_ready)
        self.assertIsNone(result.fault_code)
        self.assertTrue(result.permit_allowed)
        self.assertIsNone(result.goto_refusal)

    def test_false_conditions(self):
        for changes in ({'emergency_stop': True}, {'mode': 'manual'}, {'gate_state': 'BLOCKED'},
                        {'gate_state': 'LATCHED:ESTOP'}, {'gate_state': 'DISABLED'}, {'nav2_ready': False},
                        {'unowned_goal': FOREIGN_NAV_GOAL}, {'map_fault': MAP_CONTENT_MISMATCH}):
            self.assertIs(False, run(**changes).motion_ready, changes)

    def test_null_when_a_source_has_no_data(self):
        for changes in ({'emergency_stop': None}, {'mode': None}, {'gate_state': None, 'gate_age_sec': None},
                        {'odom_age_sec': None}, {'nav2_ready': None}, {'map_fault': MAP_EVIDENCE_MISSING}):
            self.assertIsNone(run(**changes).motion_ready, changes)

    def test_null_when_a_source_went_stale(self):
        self.assertIsNone(run(gate_age_sec=1.6).motion_ready)
        self.assertIsNone(run(odom_age_sec=0.6).motion_ready)

    def test_a_default_view_is_not_ready(self):
        result = evaluate(Observations(), LIMITS)
        self.assertIsNone(result.localized)
        self.assertIsNone(result.motion_ready)
        self.assertFalse(result.permit_allowed)
        self.assertIsNotNone(result.goto_refusal)


class ResettableLatchTests(unittest.TestCase):
    """ADR-0049 addendum: a BOOT or PERMIT_LOST latch is cleared by the next leg, so it does not refuse one."""

    def test_boot_and_permit_lost_are_ready_for_a_new_leg(self):
        for gate in ('LATCHED:BOOT', 'LATCHED:PERMIT_LOST'):
            result = run(gate_state=gate)
            self.assertIs(True, result.motion_ready, gate)
            self.assertIsNone(result.fault_code, gate)
            self.assertIsNone(result.goto_refusal, gate)
            self.assertTrue(result.latch_resettable, gate)

    def test_an_estop_latch_still_needs_a_local_reset(self):
        result = run(gate_state='LATCHED:ESTOP')
        self.assertIs(False, result.motion_ready)
        self.assertEqual('MOTION_GATE_LATCHED', result.fault_code)
        self.assertEqual('MOTION_GATE_LATCHED', result.goto_refusal)
        self.assertFalse(result.latch_resettable)

    def test_an_open_gate_needs_no_reset(self):
        self.assertFalse(run().latch_resettable)

    def test_a_resettable_latch_does_not_hide_another_cause(self):
        for changes in ({'emergency_stop': True}, {'mode': 'manual'}, {'nav2_ready': False},
                        {'unowned_goal': FOREIGN_NAV_GOAL}, {'odom_age_sec': 0.6}):
            self.assertIsNot(True, run(gate_state='LATCHED:PERMIT_LOST', **changes).motion_ready, changes)

    def test_a_stale_gate_report_is_never_resettable(self):
        result = run(gate_state='LATCHED:BOOT', gate_age_sec=1.6)
        self.assertFalse(result.latch_resettable)
        self.assertIsNone(result.motion_ready)


class FaultCodeTests(unittest.TestCase):
    def test_each_cause_has_its_code(self):
        for changes, code in (({'emergency_stop': True}, 'ESTOP_ENGAGED'),
                              ({'unowned_goal': FOREIGN_NAV_GOAL}, FOREIGN_NAV_GOAL),
                              ({'unowned_goal': UNOWNED_GOAL_AT_STARTUP}, UNOWNED_GOAL_AT_STARTUP),
                              ({'map_fault': MAP_CONTENT_MISMATCH}, MAP_CONTENT_MISMATCH),
                              ({'map_fault': MAP_EVIDENCE_MISSING}, MAP_EVIDENCE_MISSING),
                              ({'gate_state': 'DISABLED'}, 'MOTION_GATE_DISABLED'),
                              ({'odom_age_sec': 0.6}, 'STM32_LINK_STALE'),
                              ({'nav2_ready': False}, 'NAV2_UNAVAILABLE'),
                              ({'tf_age_sec': 2.0}, 'TF_STALE'),
                              ({'gate_state': 'LATCHED:ESTOP'}, 'MOTION_GATE_LATCHED')):
            self.assertEqual(code, run(**changes).fault_code, changes)

    def test_a_latched_gate_never_hides_what_tripped_it(self):
        latched = 'LATCHED:PERMIT_LOST'
        self.assertEqual('ESTOP_ENGAGED', run(gate_state=latched, emergency_stop=True).fault_code)
        self.assertEqual(FOREIGN_NAV_GOAL, run(gate_state=latched, unowned_goal=FOREIGN_NAV_GOAL).fault_code)
        self.assertEqual(MAP_CONTENT_MISMATCH, run(gate_state=latched, map_fault=MAP_CONTENT_MISMATCH).fault_code)


class PermitConditionTests(unittest.TestCase):
    def test_local_conditions_that_block_the_permit(self):
        for changes in ({'odom_age_sec': 0.6}, {'odom_age_sec': None}, {'unowned_goal': FOREIGN_NAV_GOAL},
                        {'map_fault': MAP_CONTENT_MISMATCH}):
            self.assertFalse(run(**changes).permit_allowed, changes)

    def test_missing_map_evidence_refuses_new_goals_but_keeps_the_permit(self):
        result = run(map_fault=MAP_EVIDENCE_MISSING)
        self.assertTrue(result.permit_allowed)
        self.assertEqual('MAP_MISMATCH', result.goto_refusal)
        self.assertIsNone(result.motion_ready)

    def test_a_latched_gate_does_not_block_the_permit(self):
        self.assertTrue(run(gate_state='LATCHED:BOOT').permit_allowed)

    def test_the_motion_permit_honours_local_conditions(self):
        allowed = [True]
        permit = MotionPermit(1.5, lambda: 100.0, lambda: False, lambda: None, lambda: 100.1, lambda: allowed[0])
        self.assertTrue(permit.evaluate())
        allowed[0] = False
        self.assertFalse(permit.evaluate())


class GotoRefusalTests(unittest.TestCase):
    def test_reasons(self):
        self.assertEqual('MAP_MISMATCH', run(map_fault=MAP_CONTENT_MISMATCH).goto_refusal)
        self.assertEqual('MAP_MISMATCH', run(map_fault=MAP_EVIDENCE_MISSING).goto_refusal)
        self.assertEqual('NOT_LOCALIZED', run(amcl_covariance=None).goto_refusal)
        self.assertEqual('ESTOP_ENGAGED', run(emergency_stop=True).goto_refusal)
        self.assertEqual('NOT_MOTION_READY', run(gate_state='BLOCKED').goto_refusal)

    def test_a_refused_goto_sends_no_goal_and_reports_the_reason(self):
        navigator_refusal = ['ESTOP_ENGAGED']
        executor, navigator = make()
        executor._goto_guard = lambda: navigator_refusal[0]
        executor.handle(goto(), STREAM)
        self.assertEqual([], navigator.goals)
        body = results(executor)[-1]
        self.assertEqual(('REJECTED', 'ESTOP_ENGAGED'), (body['phase'], body['reason']))

    def test_no_refusal_sends_the_goal(self):
        executor, navigator = make()
        executor._goto_guard = lambda: None
        executor.handle(goto(), STREAM)
        self.assertEqual(1, len(navigator.goals))

    def test_a_cancel_is_never_guarded(self):
        from fleet_bridge.commands import CancelCommand
        executor, navigator = make()
        executor.handle(goto(), STREAM)
        navigator.on_response(True, None)
        executor._goto_guard = lambda: 'ESTOP_ENGAGED'
        executor.handle(CancelCommand('33333333-3333-4333-8333-333333333333', goto().leg_id), STREAM)
        self.assertEqual(1, navigator.cancels)


class Clock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now


class GoalMonitorTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.monitor = GoalMonitor(monotonic=self.clock)
        self.alive = lambda action: True

    def after_startup(self):
        self.clock.now += 3.0

    def test_no_goals_is_clean(self):
        self.assertIsNone(self.monitor.classify(self.alive))

    def test_own_goal_is_not_foreign(self):
        self.after_startup()
        self.monitor.mark_own(b'mine')
        self.monitor.on_status('navigate_to_pose', [b'mine'])
        self.assertIsNone(self.monitor.classify(self.alive))

    def test_unknown_goal_after_startup_is_foreign(self):
        self.after_startup()
        self.monitor.on_status('navigate_to_pose', [b'rviz'])
        self.assertEqual(FOREIGN_NAV_GOAL, self.monitor.classify(self.alive))

    def test_goal_found_at_startup_is_reported_as_such(self):
        self.monitor.on_status('navigate_to_pose', [b'orphan'])
        self.after_startup()
        self.assertEqual(UNOWNED_GOAL_AT_STARTUP, self.monitor.classify(self.alive))

    def test_fault_clears_when_the_goal_ends(self):
        self.after_startup()
        self.monitor.on_status('navigate_to_pose', [b'rviz'])
        self.monitor.on_status('navigate_to_pose', [])
        self.assertIsNone(self.monitor.classify(self.alive))

    def test_status_latched_by_a_dead_server_is_ignored(self):
        self.after_startup()
        self.monitor.on_status('navigate_to_pose', [b'old'])
        self.assertIsNone(self.monitor.classify(lambda action: False))

    def test_other_top_level_senders_are_foreign(self):
        self.after_startup()
        for action in ('navigate_through_poses', 'follow_waypoints', 'go_to_stop'):
            monitor = GoalMonitor(startup_window_sec=-1.0, monotonic=self.clock)
            monitor.on_status(action, [b'x'])
            self.assertEqual(FOREIGN_NAV_GOAL, monitor.classify(self.alive), action)

    def test_bt_navigator_children_of_our_goal_are_not_foreign(self):
        self.after_startup()
        self.monitor.mark_own(b'mine')
        self.monitor.on_status('navigate_to_pose', [b'mine'])
        self.monitor.on_status('follow_path', [b'child'])
        self.monitor.on_status('spin', [b'recovery'])
        for _ in range(5):
            self.clock.now += 1.0
            self.assertIsNone(self.monitor.classify(self.alive))

    def test_a_child_action_alone_is_foreign_only_after_the_debounce(self):
        self.after_startup()
        self.monitor.on_status('follow_path', [b'cli'])
        self.assertIsNone(self.monitor.classify(self.alive))
        self.clock.now += 0.5
        self.assertIsNone(self.monitor.classify(self.alive))
        self.clock.now += 0.6
        self.assertEqual(FOREIGN_NAV_GOAL, self.monitor.classify(self.alive))

    def test_a_child_ending_with_its_goal_is_not_foreign(self):
        self.after_startup()
        self.monitor.mark_own(b'mine')
        self.monitor.on_status('navigate_to_pose', [b'mine'])
        self.monitor.on_status('follow_path', [b'child'])
        self.monitor.classify(self.alive)
        self.monitor.on_status('navigate_to_pose', [])
        self.assertIsNone(self.monitor.classify(self.alive))
        self.clock.now += 0.3
        self.monitor.on_status('follow_path', [])
        self.assertIsNone(self.monitor.classify(self.alive))


class ImageNameTests(unittest.TestCase):
    def test_reads_the_image_field(self):
        self.assertEqual('map_fix.pgm', image_name(b'image: map_fix.pgm\nmode: trinary\n'))
        self.assertEqual('a b.pgm', image_name(b'resolution: 0.05\nimage: "a b.pgm"\r\n'))
        self.assertEqual('m.pgm', image_name(b'image: m.pgm # comment\n'))

    def test_none_when_absent(self):
        self.assertIsNone(image_name(b'mode: trinary\n'))


class MapCheckTests(unittest.TestCase):
    YAML = b'image: map_fix.pgm\nmode: trinary\n'
    PGM = b'P5 1 1 255\n\x00'

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.loaded = self.root / 'loaded'
        self.loaded.mkdir()
        (self.loaded / 'map.yaml').write_bytes(self.YAML)
        # A leftover file with the conventional name must never be what is compared.
        (self.loaded / 'map.pgm').write_bytes(b'not the map')
        (self.loaded / 'map_fix.pgm').write_bytes(self.PGM)
        self.package = self.root / 'package.zip'
        self.write_package(self.YAML, self.PGM)
        self.yaml_path = str(self.loaded / 'map.yaml')

    def write_package(self, yaml_bytes, pgm_bytes, pgm_name='map_fix.pgm'):
        with zipfile.ZipFile(self.package, 'w') as archive:
            archive.writestr('map.yaml', yaml_bytes)
            archive.writestr(pgm_name, pgm_bytes)
        self.digest = hashlib.sha256(self.package.read_bytes()).hexdigest()

    def checker(self, digest=None):
        return MapChecker(str(self.package), self.digest if digest is None else digest)

    def test_matching_map_is_verified(self):
        self.assertIsNone(self.checker().check(self.yaml_path))

    def test_hash_is_compared_case_insensitively(self):
        self.assertIsNone(self.checker(self.digest.upper()).check(self.yaml_path))

    def test_wrong_package_hash_is_a_mismatch(self):
        self.assertEqual(MAP_CONTENT_MISMATCH, self.checker('0' * 64).check(self.yaml_path))

    def test_changed_yaml_is_a_mismatch(self):
        (self.loaded / 'map.yaml').write_bytes(self.YAML + b'# edited\n')
        self.assertEqual(MAP_CONTENT_MISMATCH, self.checker().check(self.yaml_path))

    def test_changed_image_is_a_mismatch(self):
        (self.loaded / 'map_fix.pgm').write_bytes(b'P5 1 1 255\n\x01')
        self.assertEqual(MAP_CONTENT_MISMATCH, self.checker().check(self.yaml_path))

    def test_image_absent_from_the_package_is_a_mismatch(self):
        self.write_package(self.YAML, self.PGM, 'other.pgm')
        self.assertEqual(MAP_CONTENT_MISMATCH, self.checker().check(self.yaml_path))

    def test_a_change_after_a_pass_is_caught(self):
        checker = self.checker()
        self.assertIsNone(checker.check(self.yaml_path))
        (self.loaded / 'map_fix.pgm').write_bytes(b'P5 1 1 255\n\x02\x03')
        self.assertEqual(MAP_CONTENT_MISMATCH, checker.check(self.yaml_path))

    def test_unchanged_files_are_not_hashed_again(self):
        checker = self.checker()
        self.assertIsNone(checker.check(self.yaml_path))
        signature = checker._signature
        self.assertIsNone(checker.check(self.yaml_path))
        self.assertIs(signature, checker._signature)

    def test_missing_evidence(self):
        self.assertEqual(MAP_EVIDENCE_MISSING, MapChecker('', self.digest).check(self.yaml_path))
        self.assertEqual(MAP_EVIDENCE_MISSING, MapChecker(str(self.package), '').check(self.yaml_path))
        self.assertEqual(MAP_EVIDENCE_MISSING, MapChecker(str(self.package), 'abc').check(self.yaml_path))
        self.assertEqual(MAP_EVIDENCE_MISSING, self.checker().check(''))
        self.assertEqual(MAP_EVIDENCE_MISSING, self.checker().check(str(self.root / 'gone.yaml')))
        self.package.unlink()
        self.assertEqual(MAP_EVIDENCE_MISSING, self.checker().check(self.yaml_path))

    def test_missing_image_file_is_missing_evidence(self):
        (self.loaded / 'map_fix.pgm').unlink()
        self.assertEqual(MAP_EVIDENCE_MISSING, self.checker().check(self.yaml_path))

    def test_not_a_zip_is_a_mismatch(self):
        self.package.write_bytes(b'not a zip')
        digest = hashlib.sha256(b'not a zip').hexdigest()
        self.assertEqual(MAP_CONTENT_MISMATCH, MapChecker(str(self.package), digest).check(self.yaml_path))


class TelemetryFieldTests(unittest.TestCase):
    NOW = datetime(2026, 11, 10, 2, 0, 5, tzinfo=timezone.utc)

    def test_readiness_values_reach_the_report(self):
        report = build_report('robot_01', STREAM, 1, self.NOW, MAP, 'map', None, 'IDLE', None,
                              True, False, 'ESTOP_ENGAGED')
        self.assertEqual((True, False, 'ESTOP_ENGAGED'),
                         (report['localized'], report['motionReady'], report['faultCode']))
        json.dumps(report)

    def test_they_stay_null_by_default(self):
        report = build_report('robot_01', STREAM, 1, self.NOW, MAP, 'map', None, 'UNKNOWN')
        self.assertEqual((None, None, None), (report['localized'], report['motionReady'], report['faultCode']))
