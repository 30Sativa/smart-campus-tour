import tempfile
import unittest
import uuid
from pathlib import Path

from fleet_sync_probe import (
    build_report,
    is_accepted_response,
    read_credential_file,
    validate_url,
)


class FleetSyncProbeTests(unittest.TestCase):
    def test_probe_generates_a_new_stream_id_by_default(self):
        first = build_report("robot_test_01", "local-mock-map-v1")
        second = build_report("robot_test_01", "local-mock-map-v1")

        self.assertNotEqual(first["streamId"], second["streamId"])
        self.assertEqual(str(uuid.UUID(first["streamId"])), first["streamId"])

    def test_probe_preserves_explicit_stream_and_sequence(self):
        stream_id = str(uuid.uuid4())
        report = build_report(
            "robot_test_01", "campus-floor-a-v1", "map", stream_id, 17)

        self.assertEqual(stream_id, report["streamId"])
        self.assertEqual(17, report["seq"])
        self.assertEqual("campus-floor-a-v1", report["mapKey"])
        self.assertEqual("map", report["frameId"])
        self.assertIsNone(report["pose"])
        self.assertEqual("UNKNOWN", report["status"])
        self.assertIsNone(report["localized"])

    def test_probe_rejects_non_tls_remote_urls_and_embedded_credentials(self):
        for url in (
            "http://fleet.example.com/api/fleet/v1/sync",
            "https://user:pass@fleet.example.com/sync",
            "https://fleet.example.com/sync?token=secret",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_url(url)

    def test_probe_allows_tls_and_loopback_http(self):
        self.assertEqual("https://fleet.example.com/sync", validate_url("https://fleet.example.com/sync"))
        self.assertEqual("http://127.0.0.1:8080/sync", validate_url("http://127.0.0.1:8080/sync"))
        self.assertEqual("http://[::1]:8080/sync", validate_url("http://[::1]:8080/sync"))

    def test_probe_only_reports_success_when_server_acknowledges_acceptance(self):
        accepted = {"success": True, "data": {"accepted": True, "duplicate": False}}
        rejected = {"success": True, "data": {"accepted": False}}

        self.assertTrue(is_accepted_response(200, accepted))
        self.assertFalse(is_accepted_response(200, rejected))
        self.assertFalse(is_accepted_response(200, {"success": True, "data": {}}))
        self.assertFalse(is_accepted_response(409, accepted))

    def test_probe_reads_a_private_credential_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "credential"
            path.write_text("provisioned-token\n", encoding="utf-8")
            path.chmod(0o600)
            self.assertEqual("provisioned-token", read_credential_file(str(path)))
            if __import__("os").name != "nt":
                path.chmod(0o644)
                with self.assertRaises(ValueError):
                    read_credential_file(str(path))


if __name__ == "__main__":
    unittest.main()
