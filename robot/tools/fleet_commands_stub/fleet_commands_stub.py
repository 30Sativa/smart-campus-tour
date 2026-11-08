#!/usr/bin/env python3
"""Fake backend for the Fleet Commands v1 bridge: serves fixture-shaped commands, checks auth, records results.

Standard library only. Loopback by default, so fleet_bridge may use plain HTTP against it. Used by
the unit tests and by the Gazebo procedure in robot/tools/fleet_commands_stub/README.md. It is not a
backend: no Tours, no persistence, and it must never point at a physical robot.
"""

from __future__ import annotations

import argparse
import json
import re
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SYNC_PATH = '/api/fleet/v1/sync'
POLL_PATH = '/api/fleet/commands/v1/poll'
RESULT_PATH = re.compile(r'^/api/fleet/commands/v1/([0-9a-fA-F-]{36})/results$')


class StubState:
    def __init__(self, robot_code: str, credential: str, map_key: str, frame_id: str = 'map'):
        self.robot_code = robot_code
        self.credential = credential
        self.map_key = map_key
        self.frame_id = frame_id
        self.lock = threading.Lock()
        self.stream_id: str | None = None
        self.reports: list[dict] = []
        self.polls = 0
        self.commands: list[dict] = []
        self.results: list[dict] = []
        self.delivered_to: dict[str, str] = {}
        self.print_readiness = False
        self._last_readiness: tuple | None = None

    def note_readiness(self, report: dict) -> None:
        """Print readiness telemetry when it changes. Caller holds the lock."""
        fields = tuple(report.get(key) for key in ('status', 'localized', 'motionReady', 'faultCode'))
        if self.print_readiness and fields != self._last_readiness:
            self._last_readiness = fields
            print(json.dumps({'readiness': dict(zip(('status', 'localized', 'motionReady', 'faultCode'), fields))}),
                  flush=True)

    def add_goto(self, x: float, y: float, yaw: float, leg_id: str | None = None, accept_sec: float = 30.0) -> dict:
        now = datetime.now(timezone.utc)
        command = {
            'commandId': str(uuid.uuid4()), 'kind': 'GoTo', 'legId': leg_id or str(uuid.uuid4()),
            'mapKey': self.map_key, 'frameId': self.frame_id, 'x': x, 'y': y, 'yaw': yaw, 'stopId': None,
            'issuedAt': now.isoformat(), 'acceptBy': (now + timedelta(seconds=accept_sec)).isoformat(),
        }
        with self.lock:
            self.commands.append(command)
        return command

    def add_cancel(self, leg_id: str) -> dict:
        command = {'commandId': str(uuid.uuid4()), 'kind': 'Cancel', 'legId': leg_id,
                   'issuedAt': datetime.now(timezone.utc).isoformat()}
        with self.lock:
            # Poll returns the Cancel first while its GoTo is open.
            self.commands.insert(0, command)
        return command

    def results_for(self, command_id: str) -> list[dict]:
        with self.lock:
            return [item for item in self.results if item['commandId'] == command_id]


def _open(state: StubState, command: dict) -> bool:
    """A Cancel is done at its first answer; a GoTo at its terminal or rejected result. Caller holds the lock."""
    phases = {item['phase'] for item in state.results if item['commandId'] == command['commandId']}
    return not phases if command['kind'] == 'Cancel' else not phases & {'TERMINAL', 'REJECTED'}


def make_handler(state: StubState):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            length = int(self.headers.get('Content-Length', '0'))
            body = json.loads(self.rfile.read(length) or b'{}')
            if (self.headers.get('Authorization') != f'Bearer {state.credential}'
                    or self.headers.get('X-Robot-Code') != state.robot_code):
                return self._reply(401, {'success': False, 'errors': {'code': 'UNAUTHORIZED'}})
            result = RESULT_PATH.match(self.path)
            if self.path == SYNC_PATH:
                return self._sync(body)
            if self.path == POLL_PATH:
                return self._poll(body)
            if result:
                return self._result(result.group(1), body)
            return self._reply(404, {'success': False})

        def _sync(self, body):
            with state.lock:
                state.stream_id = body['streamId']
                state.reports.append(body)
                state.note_readiness(body)
            self._reply(200, {'success': True, 'data': {'accepted': True, 'duplicate': False, 'commands': []}})

        def _poll(self, body):
            with state.lock:
                state.polls += 1
                if body.get('streamId') != state.stream_id:
                    return self._reply(409, {'success': False, 'errors': {'code': 'STREAM_NOT_CURRENT'}})
                command = next((item for item in state.commands if _open(state, item)), None)
                if command is not None:
                    state.delivered_to[command['commandId']] = body['streamId']
            self._reply(200, {'success': True, 'message': 'Current command.' if command else 'No command.',
                              'data': {'command': command}, 'errors': None})

        def _result(self, command_id, body):
            with state.lock:
                if command_id not in state.delivered_to:
                    return self._reply(404, {'success': False, 'errors': {'code': 'COMMAND_NOT_FOUND'}})
                duplicate = body in state.results
                if not duplicate:
                    state.results.append(body)
            self._reply(200, {'success': True, 'data': {'accepted': True, 'duplicate': duplicate, 'commandState': body['phase']}})

        def _reply(self, status, body):
            raw = json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

    return Handler


def serve(state: StubState, port: int = 0) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(('127.0.0.1', port), make_handler(state))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8088)
    parser.add_argument('--robot-code', required=True)
    parser.add_argument('--credential-file', required=True)
    parser.add_argument('--map-key', required=True)
    parser.add_argument('--goto', nargs=3, type=float, required=True, metavar=('X', 'Y', 'YAW'))
    parser.add_argument('--cancel-after-sec', type=float, help='Cancel the leg this long after it is accepted.')
    parser.add_argument('--timeout-sec', type=float, default=180.0)
    parser.add_argument('--goto-delay-sec', type=float, default=0.0,
                        help='Wait this long after the first report before offering the GoTo, '
                             'so the motion gate can be reset first (ADR-0049).')
    parser.add_argument('--print-readiness', action='store_true',
                        help='Print status, localized, motionReady and faultCode whenever they change.')
    args = parser.parse_args()
    with open(args.credential_file, encoding='utf-8') as file:
        state = StubState(args.robot_code, file.read().strip(), args.map_key)
    state.print_readiness = args.print_readiness
    server = serve(state, args.port)
    print(f'stub listening on http://127.0.0.1:{server.server_port}{SYNC_PATH}', flush=True)
    while state.stream_id is None:
        time.sleep(0.2)
    time.sleep(args.goto_delay_sec)
    goto = state.add_goto(*args.goto, accept_sec=args.timeout_sec)
    print(json.dumps({'sent': goto}), flush=True)
    deadline = time.monotonic() + args.timeout_sec
    cancelled = False
    seen = 0
    while time.monotonic() < deadline:
        results = state.results_for(goto['commandId'])
        for result in results[seen:]:
            print(json.dumps({'result': result}), flush=True)
        seen = len(results)
        if any(item['phase'] in {'TERMINAL', 'REJECTED'} for item in results):
            server.shutdown()
            return 0
        if args.cancel_after_sec is not None and not cancelled and results:
            time.sleep(args.cancel_after_sec)
            print(json.dumps({'sent': state.add_cancel(goto['legId'])}), flush=True)
            cancelled = True
        time.sleep(0.2)
    print('timed out without a terminal result', flush=True)
    server.shutdown()
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
