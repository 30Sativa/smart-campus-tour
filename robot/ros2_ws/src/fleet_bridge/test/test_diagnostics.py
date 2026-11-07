"""Mini PC diagnostics report: resource readers, sensor states, wire shape and the HTTPS loop. No ROS needed."""

import json
import re
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fleet_bridge.diagnostics import (
    CpuSampler,
    DiagnosticsWorkerConfig,
    FleetDiagnosticsWorker,
    ImuDiagnostic,
    MiniPcCollector,
    TopicRate,
    build_diagnostics_report,
    cpu_temperature,
    diagnostics_url_from_sync_url,
    disk_usage,
    imu_sensor_status,
    memory_from_meminfo,
    topic_sensor_status,
)
from fleet_bridge.http_client import HttpResponse, TransportFailure

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 11, 7, 15, 0, tzinfo=timezone.utc)


class FakeClock:
    def __init__(self, start=100.0):
        self.now = start

    def __call__(self):
        return self.now


class MiniPcResourceTests(unittest.TestCase):
    def test_cpu_percent_needs_two_samples_and_measures_the_busy_share(self):
        stats = iter([
            'cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 1 1 1 1\n',
            'cpu  150 0 150 850 50 0 0 0 0 0\n',
        ])
        sampler = CpuSampler(lambda: next(stats))
        self.assertIsNone(sampler.sample())
        # +200 total, of which idle+iowait +100 -> 50 % busy.
        self.assertEqual(50.0, sampler.sample())

    def test_unreadable_cpu_stat_is_unknown_not_zero(self):
        def broken():
            raise OSError('no /proc')
        self.assertIsNone(CpuSampler(broken).sample())

    def test_memory_uses_mem_available(self):
        memory = memory_from_meminfo('MemTotal:       8000000 kB\nMemFree: 1000 kB\nMemAvailable:   2000000 kB\n')
        self.assertEqual({'totalBytes': 8_192_000_000, 'availableBytes': 2_048_000_000,
                          'usedBytes': 6_144_000_000, 'usedPercent': 75.0}, memory)
        self.assertIsNone(memory_from_meminfo('MemTotal: 8000000 kB\n'))

    def test_disk_matches_df_basis(self):
        stats = SimpleNamespace(f_blocks=1000, f_bfree=300, f_bavail=200, f_frsize=4096)
        disk = disk_usage('/', lambda _path: stats)
        self.assertEqual('/', disk['mountPoint'])
        self.assertEqual(4_096_000, disk['totalBytes'])
        self.assertEqual(819_200, disk['availableFreeBytes'])
        self.assertEqual(77.8, disk['usedPercent'])  # 700 used / (700 + 200)

        def missing(_path):
            raise OSError('gone')
        self.assertIsNone(disk_usage('/data', missing))

    def test_cpu_temperature_prefers_the_cpu_package_zone(self):
        with tempfile.TemporaryDirectory() as root:
            for index, (zone_type, millidegrees) in enumerate(
                    [('acpitz', '27800'), ('x86_pkg_temp', '48000'), ('x86_pkg_temp', '52500'), ('bogus', 'x')]):
                zone = Path(root) / f'thermal_zone{index}'
                zone.mkdir()
                (zone / 'type').write_text(zone_type + '\n')
                (zone / 'temp').write_text(millidegrees + '\n')
            self.assertEqual(52.5, cpu_temperature(root))

    def test_cpu_temperature_without_a_cpu_zone_is_unknown(self):
        with tempfile.TemporaryDirectory() as root:
            zone = Path(root) / 'thermal_zone0'
            zone.mkdir()
            (zone / 'type').write_text('iwlwifi_1\n')
            (zone / 'temp').write_text('40000\n')
            self.assertIsNone(cpu_temperature(root))
            self.assertIsNone(cpu_temperature(str(Path(root) / 'missing')))

    def test_collector_reports_null_for_what_it_cannot_measure(self):
        with tempfile.TemporaryDirectory() as root:
            report = MiniPcCollector(disk_path=root, proc_root=str(Path(root) / 'no-proc'),
                                     thermal_root=str(Path(root) / 'no-thermal')).collect()
        self.assertEqual({'cpuPercent', 'memory', 'gpu', 'disk', 'cpuTemperatureCelsius'}, set(report))
        self.assertIsNone(report['cpuPercent'])
        self.assertIsNone(report['memory'])
        self.assertIsNone(report['gpu'])
        self.assertIsNone(report['cpuTemperatureCelsius'])
        self.assertIsNotNone(report['disk'])


class SensorStatusTests(unittest.TestCase):
    def rate(self):
        clock = FakeClock()
        walls = iter(NOW + timedelta(seconds=step) for step in range(1000))
        return clock, TopicRate(window_sec=5.0, clock=clock, wall_clock=lambda: next(walls))

    def test_empty_topic_is_not_equipped(self):
        self.assertEqual('NOT_EQUIPPED', topic_sensor_status('', None, 3.0, 5.0)['status'])

    def test_never_received_is_unknown(self):
        _clock, rate = self.rate()
        status = topic_sensor_status('scan', rate, 3.0, 5.0)
        self.assertEqual('UNKNOWN', status['status'])
        self.assertIsNone(status['lastValidAt'])

    def test_fresh_topic_reports_its_rate(self):
        clock, rate = self.rate()
        for _ in range(50):  # 10 Hz for 5 s
            clock.now += 0.1
            rate.tick()
        status = topic_sensor_status('scan', rate, 3.0, 5.0)
        self.assertEqual('OK', status['status'])
        self.assertEqual(10.0, status['rateHz'])
        self.assertTrue(status['lastValidAt'].endswith('Z'))

    def test_slow_topic_warns_and_silent_topic_goes_stale(self):
        clock, rate = self.rate()
        for _ in range(5):  # 1 Hz
            clock.now += 1.0
            rate.tick()
        self.assertEqual('WARN', topic_sensor_status('scan', rate, 3.0, 5.0)['status'])
        clock.now += 10.0
        stale = topic_sensor_status('scan', rate, 3.0, 5.0)
        self.assertEqual('STALE', stale['status'])
        self.assertIsNone(stale['rateHz'])
        self.assertIsNotNone(stale['lastValidAt'])

    def test_imu_comes_from_the_stm32_bridge_diagnostic(self):
        diagnostic = ImuDiagnostic(0, 'IMU yaw fresh', {
            'last_valid_age_s': '0.20', 'outages': '2', 'firmware_rearm_count': '1',
            'firmware_reset_seen_count': 'n/a'}, NOW, 50.0)
        status = imu_sensor_status(diagnostic, None, 51.0, 3.0)
        self.assertEqual('OK', status['status'])
        self.assertTrue(status['yawValid'])
        self.assertEqual(2, status['outages'])
        self.assertEqual(1, status['firmwareRearmCount'])
        self.assertIsNone(status['firmwareResetSeenCount'])
        self.assertEqual('2026-11-07T14:59:59.800000Z', status['lastValidAt'])

    def test_imu_warning_and_old_diagnostic(self):
        warn = ImuDiagnostic(1, 'IMU yaw missing; EKF on wheel odometry only',
                             {'last_valid_age_s': '9.00', 'outages': '3'}, NOW, 50.0)
        status = imu_sensor_status(warn, None, 51.0, 3.0)
        self.assertEqual('WARN', status['status'])
        self.assertFalse(status['yawValid'])
        self.assertEqual('STALE', imu_sensor_status(warn, None, 60.0, 3.0)['status'])
        never = ImuDiagnostic(0, 'waiting for first IMU yaw', {'last_valid_age_s': 'never', 'outages': '0'},
                              NOW, 50.0)
        self.assertIsNone(imu_sensor_status(never, None, 51.0, 3.0)['yawValid'])

    def test_imu_without_diagnostic_is_unknown(self):
        status = imu_sensor_status(None, None, 1.0, 3.0)
        self.assertEqual('UNKNOWN', status['status'])
        self.assertEqual(0, status['outages'])


class ReportShapeTests(unittest.TestCase):
    """Field names follow the backend records in RobotDiagnosticsModels.cs (camelCase JSON)."""

    def test_report_matches_backend_records(self):
        _clock, rate = SensorStatusTests().rate()
        sensor = topic_sensor_status('scan', rate, 3.0, 5.0)
        imu = imu_sensor_status(None, None, 1.0, 3.0)
        report = build_diagnostics_report('robot_01', NOW, {'cpuPercent': 1.0}, {
            'middlewareStatus': 'OK', 'nodes': [], 'tfValid': None, 'nav2State': 'UNKNOWN'},
            {'lidar': sensor, 'imu': imu, 'odometry': sensor, 'depthCamera': sensor})
        self.assertEqual({'robotId', 'reportedAt', 'miniPc', 'ros2', 'sensors'}, set(report))
        self.assertEqual('2026-11-07T15:00:00.000000Z', report['reportedAt'])
        self.assertEqual({'status', 'message', 'rateHz', 'lastValidAt'}, set(sensor))
        self.assertEqual({'status', 'message', 'yawValid', 'firmwareRearmCount', 'firmwareResetSeenCount',
                          'outages', 'lastValidAt'}, set(imu))
        json.dumps(report)

    def test_backend_model_still_has_these_fields(self):
        for parent in PACKAGE_ROOT.parents:
            model = parent / 'backend/src/SmartCampus.Application/Features/RobotDiagnostics/RobotDiagnosticsModels.cs'
            if model.is_file():
                text = model.read_text(encoding='utf-8')
                for field in ('CpuPercent', 'CpuTemperatureCelsius', 'AvailableFreeBytes', 'MiddlewareStatus',
                              'TfValid', 'Nav2State', 'DepthCamera', 'FirmwareRearmCount', 'Outages', 'LastValidAt'):
                    self.assertRegex(text, rf'\b{field}\b')
                return
        self.skipTest('Backend sources are not present (standalone package build).')

    def test_diagnostics_url_is_the_sync_sibling(self):
        self.assertEqual('https://api.example/api/fleet/v1/diagnostics',
                         diagnostics_url_from_sync_url('https://api.example/api/fleet/v1/sync'))
        with self.assertRaises(ValueError):
            diagnostics_url_from_sync_url('https://api.example/other')


class FakeTransport:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.bodies = []

    def post(self, body):
        self.bodies.append(json.loads(body))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class WorkerTests(unittest.TestCase):
    def worker(self, outcomes, provider=None):
        logs = []
        transport = FakeTransport(outcomes)
        worker = FleetDiagnosticsWorker(
            DiagnosticsWorkerConfig(report_period_sec=10.0, retry_max_sec=60.0), transport,
            provider or (lambda: {'robotId': 'robot_01'}), logs.append, random_source=lambda: 0.5)
        return worker, transport, logs

    def test_success_sends_a_fresh_report_each_period(self):
        worker, transport, logs = self.worker([HttpResponse(200, {'success': True})])
        self.assertTrue(worker.run_once())
        self.assertEqual([{'robotId': 'robot_01'}], transport.bodies)
        self.assertEqual([], logs)
        self.assertEqual(10.0, worker._delay())

    def test_failures_log_once_back_off_and_recover(self):
        refused = HttpResponse(401, {'errors': {'code': 'ROBOT_AUTH_FAILED'}})
        worker, _transport, logs = self.worker([TransportFailure('URLError'), refused, refused,
                                                HttpResponse(200, None)])
        for _ in range(3):
            self.assertFalse(worker.run_once())
            worker._failures += 1
        self.assertEqual(40.0, worker._delay())
        worker._failures = 16
        self.assertEqual(60.0, worker._delay())
        self.assertTrue(worker.run_once())
        self.assertEqual(['Diagnostics report failed (URLError).', 'Diagnostics report refused: ROBOT_AUTH_FAILED.',
                          'Diagnostics report accepted again.'], logs)

    def test_a_crashing_provider_never_stops_the_loop(self):
        calls = []

        def provider():
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError('boom')
            return {'robotId': 'robot_01'}

        stop = threading.Event()
        waits = []

        def wait(delay):
            waits.append(delay)
            return len(waits) >= 3

        worker = FleetDiagnosticsWorker(DiagnosticsWorkerConfig(10.0, 60.0), FakeTransport([HttpResponse(200, None)]),
                                        provider, lambda _m: None, stop_event=stop, wait=wait,
                                        random_source=lambda: 0.5)
        worker.run()
        # First wait, report crashes, wait (one failure), report succeeds, wait -> stop.
        self.assertEqual(2, len(calls))
        self.assertEqual([10.0, 10.0, 10.0], waits)


class ConfigTests(unittest.TestCase):
    def test_every_diagnostics_setting_in_the_config_is_declared_by_the_node(self):
        config = (PACKAGE_ROOT / 'config/fleet_bridge.yaml').read_text(encoding='utf-8')
        node = (PACKAGE_ROOT / 'fleet_bridge/node.py').read_text(encoding='utf-8')
        keys = re.findall(r'^\s+(diagnostics_\w+):', config, re.MULTILINE)
        self.assertGreater(len(keys), 5)
        for key in keys:
            self.assertIn(f"declare_parameter('{key}'", node)


if __name__ == '__main__':
    unittest.main()
