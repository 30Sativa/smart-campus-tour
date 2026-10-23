import datetime as dt
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / 'check_fleet_time_sync.py'
SPEC = importlib.util.spec_from_file_location('check_fleet_time_sync', SCRIPT)
time_gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(time_gate)


NOW = 1_800_000_000.0


def chrony_csv(**overrides):
    fields = [
        'C0A80101', '192.0.2.10', '3', str(NOW - 60), '0.001', '0.001',
        '0.002', '0.1', '0.0', '0.1', '0.02', '0.05', '64.0', 'Normal',
    ]
    indices = {
        'reference_id': 0,
        'source': 1,
        'stratum': 2,
        'reference_time': 3,
        'system_offset': 4,
        'root_delay': 10,
        'root_dispersion': 11,
        'leap': 13,
    }
    for key, value in overrides.items():
        fields[indices[key]] = str(value)
    return ','.join(fields) + '\n'


def timesyncd_outputs(*, destination=NOW - 60, reference='C0A80101',
                      stratum=3, root_delay='0.02s', root_dispersion='0.05s',
                      offset='+0.001s', server_address='192.0.2.10',
                      packet_count=8, leap=0, ignored='no'):
    stamp = dt.datetime.fromtimestamp(destination, dt.timezone.utc).strftime(
        '%a %Y-%m-%d %H:%M:%S UTC')
    status = f'Server: {server_address} (ntp.example.test)\nOffset: {offset}\nPacket count: {packet_count}\n'
    properties = (
        f'ServerName=ntp.example.test\n'
        f'ServerAddress={server_address}\n'
        'NTPMessage={ Leap=' + str(leap) +
        ', Version=4, Mode=4, Stratum=' + str(stratum) +
        ', Precision=-25, RootDelay=' + root_delay +
        ', RootDispersion=' + root_dispersion +
        ', Reference=' + reference +
        ', OriginateTimestamp=' + stamp +
        ', ReceiveTimestamp=' + stamp +
        ', TransmitTimestamp=' + stamp +
        ', DestinationTimestamp=' + stamp +
        ', Ignored=' + ignored + ' PacketCount=' + str(packet_count) +
        ', Jitter=3ms }\n'
    )
    return 'yes', status, properties


class FleetTimeSyncGateTests(unittest.TestCase):
    def test_chrony_csv_accepts_fresh_external_source_within_quality_bounds(self):
        ok, message = time_gate.check_chrony_tracking(chrony_csv(), NOW)
        self.assertTrue(ok, message)
        self.assertIn('root distance 0.060s', message)
        self.assertIn('reference age 60s', message)

    def test_claude_stale_chrony_source_is_rejected_even_when_leap_status_is_normal(self):
        output = chrony_csv(
            reference_time=NOW - 4 * 24 * 60 * 60,
            root_dispersion='38.0',
        )
        ok, message = time_gate.check_chrony_tracking(output, NOW)
        self.assertFalse(ok)
        self.assertIn('stale', message)

    def test_claude_chrony_local_fallback_is_rejected(self):
        output = chrony_csv(reference_id='7F7F0101', stratum=10)
        ok, message = time_gate.check_chrony_tracking(output, NOW)
        self.assertFalse(ok)
        self.assertIn('local fallback', message)

    def test_chrony_root_distance_is_half_delay_plus_dispersion_and_bounded(self):
        ok, message = time_gate.check_chrony_tracking(
            chrony_csv(root_delay='2.0', root_dispersion='0.01'), NOW)
        self.assertFalse(ok)
        self.assertIn('root distance 1.010s exceeds 1.0s', message)
        stale_quality, quality_message = time_gate.check_chrony_tracking(
            chrony_csv(root_dispersion='38.0'), NOW)
        self.assertFalse(stale_quality)
        self.assertIn('root distance 38.010s exceeds 1.0s', quality_message)

    def test_chrony_rejects_empty_zero_invalid_and_future_reference(self):
        for reference_id in ('', '00000000', 'garbage'):
            with self.subTest(reference_id=reference_id):
                self.assertFalse(time_gate.check_chrony_tracking(
                    chrony_csv(reference_id=reference_id), NOW)[0])
        self.assertFalse(time_gate.check_chrony_tracking(
            chrony_csv(reference_time=NOW + 6), NOW)[0])

    def test_chrony_rejects_bad_leap_stratum_numeric_and_incomplete_csv(self):
        self.assertFalse(time_gate.check_chrony_tracking(
            chrony_csv(leap='Not synchronised'), NOW)[0])
        self.assertFalse(time_gate.check_chrony_tracking(
            chrony_csv(stratum=0), NOW)[0])
        self.assertFalse(time_gate.check_chrony_tracking(
            chrony_csv(root_dispersion='nan'), NOW)[0])
        self.assertFalse(time_gate.check_chrony_tracking(
            ','.join(chrony_csv().strip().split(',')[:-1]), NOW)[0])

    def test_host_check_invokes_chronyc_csv_mode(self):
        completed = subprocess.CompletedProcess([], 0, chrony_csv(), '')
        with mock.patch.object(time_gate.shutil, 'which', return_value='/usr/bin/chronyc'), \
                mock.patch.object(time_gate, '_run', return_value=completed) as run:
            with mock.patch.object(time_gate.time, 'time', return_value=NOW):
                self.assertTrue(time_gate.check_host_time()[0])
        run.assert_called_once_with(['/usr/bin/chronyc', '-c', 'tracking'])

    def test_systemd_timesyncd_accepts_complete_recent_ntp_message(self):
        outputs = timesyncd_outputs()
        ok, message = time_gate.check_timesyncd(*outputs, now_epoch=NOW)
        self.assertTrue(ok, message)
        self.assertIn('root distance 0.060s', message)
        self.assertIn('reference age 60s', message)

    def test_timesyncd_rejects_synchronized_flag_without_quality_evidence(self):
        ok, message = time_gate.check_timesyncd(
            'yes', 'Offset: +0.001s', 'ServerAddress=192.0.2.10\n', NOW)
        self.assertFalse(ok)
        self.assertIn('NTPMessage', message)

    def test_timesyncd_rejects_stale_packet_and_local_reference(self):
        stale = timesyncd_outputs(destination=NOW - 4 * 24 * 60 * 60)
        local = timesyncd_outputs(reference='7F7F0101', stratum=10)
        self.assertIn('stale', time_gate.check_timesyncd(*stale, now_epoch=NOW)[1])
        local_ok, local_message = time_gate.check_timesyncd(*local, now_epoch=NOW)
        self.assertFalse(local_ok)
        self.assertIn('local fallback', local_message)

    def test_timesyncd_rejects_bad_root_distance_offset_packet_and_server(self):
        high_distance = timesyncd_outputs(root_delay='2s', root_dispersion='0.01s')
        high_offset = timesyncd_outputs(offset='+2.1s')
        ignored = timesyncd_outputs(ignored='yes')
        no_packet = timesyncd_outputs(packet_count=0)
        no_server = timesyncd_outputs(server_address='')
        for outputs in (high_distance, high_offset, ignored, no_packet, no_server):
            with self.subTest(outputs=outputs[2]):
                self.assertFalse(time_gate.check_timesyncd(*outputs, now_epoch=NOW)[0])

    def test_timesyncd_rejects_unparseable_or_unsynchronized_properties(self):
        valid = timesyncd_outputs()
        for properties in (
            valid[2].replace('Reference=C0A80101', 'Reference='),
            valid[2].replace('Reference=C0A80101', 'Reference=?'),
            valid[2].replace('RootDispersion=0.05s', 'RootDispersion=unknown'),
            valid[2].replace('DestinationTimestamp=', 'LastPacketTime='),
            valid[2].replace('Leap=0', 'Leap=3'),
            valid[2].replace('Mode=4', 'Mode=0'),
        ):
            with self.subTest(properties=properties):
                self.assertFalse(time_gate.check_timesyncd(
                    valid[0], valid[1], properties, NOW)[0])
        self.assertFalse(time_gate.check_timesyncd(
            'no', valid[1], valid[2], NOW)[0])

    def test_host_check_uses_timesyncd_quality_fields_when_chrony_is_absent(self):
        outputs = timesyncd_outputs()
        results = [
            subprocess.CompletedProcess([], 0, outputs[0], ''),
            subprocess.CompletedProcess([], 0, outputs[1], ''),
            subprocess.CompletedProcess([], 0, outputs[2], ''),
        ]
        with mock.patch.object(time_gate.shutil, 'which',
                               side_effect=[None, '/usr/bin/timedatectl']), \
                mock.patch.object(time_gate, '_run', side_effect=results) as run:
            with mock.patch.object(time_gate.time, 'time', return_value=NOW):
                self.assertTrue(time_gate.check_host_time()[0])
        self.assertEqual(3, run.call_count)
        self.assertEqual(['/usr/bin/timedatectl', 'show-timesync', '--all'],
                         run.call_args_list[2].args[0])


if __name__ == '__main__':
    unittest.main()
