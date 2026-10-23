import http.client
import json
import ssl
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar

from fleet_bridge.credentials import read_credential
from fleet_bridge.http_client import (
    FleetSyncHttpClient,
    TransportFailure,
    validate_url,
    verified_tls_context,
)


class MockBackend(BaseHTTPRequestHandler):
    seen: ClassVar[list] = []
    redirect_url: ClassVar[str | None] = None
    response_bytes: ClassVar[bytes | None] = None
    partial_response: ClassVar[bool] = False

    def do_POST(self):
        body = self.rfile.read(int(self.headers['Content-Length']))
        self.__class__.seen.append((self.path, self.headers.get('Authorization'),
                                    self.headers.get('X-Robot-Code'), json.loads(body)))
        if self.__class__.redirect_url:
            self.send_response(307)
            self.send_header('Location', self.__class__.redirect_url)
            self.end_headers()
            return
        response = self.__class__.response_bytes
        if response is None:
            response = json.dumps(
                {'success': True, 'data': {'accepted': True, 'duplicate': False}}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        expected_length = len(response) + (20 if self.__class__.partial_response else 0)
        self.send_header('Content-Length', str(expected_length))
        self.end_headers()
        self.wfile.write(response)
        if self.__class__.partial_response:
            self.close_connection = True

    def log_message(self, format, *args):
        pass


class FleetSyncHttpClientTests(unittest.TestCase):
    def setUp(self):
        MockBackend.seen = []
        MockBackend.redirect_url = None
        MockBackend.response_bytes = None
        MockBackend.partial_response = False
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), MockBackend)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}/api/fleet/v1/sync'

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(timeout=2)
        self.server.server_close()

    def test_http_mock_backend_receives_expected_headers_and_contract(self):
        client = FleetSyncHttpClient(self.url, 'robot_01', 'credential-secret')
        response = client.post('{"robotId":"robot_01","status":"UNKNOWN"}')

        self.assertEqual(200, response.status)
        self.assertTrue(response.body['data']['accepted'])
        path, authorization, robot_code, body = MockBackend.seen[0]
        self.assertEqual('/api/fleet/v1/sync', path)
        self.assertEqual('Bearer credential-secret', authorization)
        self.assertEqual('robot_01', robot_code)
        self.assertEqual({'robotId': 'robot_01', 'status': 'UNKNOWN'}, body)

    def test_default_request_timeout_is_five_seconds(self):
        client = FleetSyncHttpClient(self.url, 'robot_01', 'credential-secret')
        self.assertEqual(5.0, client.timeout_sec)

    def test_client_does_not_follow_redirect_with_robot_authorization(self):
        MockBackend.redirect_url = 'https://other-host.invalid/collect'
        client = FleetSyncHttpClient(self.url, 'robot_01', 'credential-secret')

        response = client.post('{"robotId":"robot_01"}')

        self.assertEqual(307, response.status)
        self.assertEqual(1, len(MockBackend.seen))

    def test_empty_and_invalid_200_bodies_are_returned_as_unparseable_outcomes(self):
        client = FleetSyncHttpClient(self.url, 'robot_01', 'credential-secret')
        for raw in (b'', b'{not-json'):
            with self.subTest(raw=raw):
                MockBackend.response_bytes = raw
                response = client.post('{"robotId":"robot_01"}')
                self.assertEqual(200, response.status)
                self.assertIsNone(response.body)

    def test_partial_response_body_is_transport_uncertainty(self):
        MockBackend.response_bytes = b'{"success":true'
        MockBackend.partial_response = True
        client = FleetSyncHttpClient(self.url, 'robot_01', 'credential-secret')

        try:
            response = client.post('{"robotId":"robot_01"}')
        except TransportFailure as error:
            self.assertEqual('IncompleteRead', error.kind)
        else:
            # Some http.client versions return a short body for read(amt)
            # without raising. The worker treats the resulting invalid JSON
            # as an uncertain 200 and retains the immutable request body.
            self.assertEqual(200, response.status)
            self.assertIsNone(response.body)

    def test_http_protocol_exception_while_reading_body_is_transport_failure(self):
        class BrokenResponse:
            def read(self, _size):
                raise http.client.BadStatusLine('broken response')

        with self.assertRaises(TransportFailure) as error:
            FleetSyncHttpClient._read_response(200, {}, BrokenResponse())

        self.assertEqual('BadStatusLine', error.exception.kind)

    def test_remote_http_and_embedded_url_credentials_are_rejected(self):
        for url in ('http://backend.example/api/fleet/v1/sync',
                    'https://user:pass@backend.example/api/fleet/v1/sync',
                    'https://backend.example/api/fleet/v1/sync?token=secret'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_url(url)

    def test_remote_tls_context_requires_ca_and_hostname_validation(self):
        context = verified_tls_context()
        self.assertEqual(ssl.CERT_REQUIRED, context.verify_mode)
        self.assertTrue(context.check_hostname)

    def test_credential_file_requires_private_permissions_on_posix(self):
        with tempfile.TemporaryDirectory() as directory:
            credential_file = Path(directory) / 'robot.credential'
            credential_file.write_text('one-time-provisioned-token\n', encoding='utf-8')
            credential_file.chmod(0o600)
            self.assertEqual('one-time-provisioned-token', read_credential(str(credential_file)))
            if sys.platform != 'win32':
                credential_file.chmod(0o640)
                with self.assertRaisesRegex(ValueError, 'group or other'):
                    read_credential(str(credential_file))


if __name__ == '__main__':
    unittest.main()
