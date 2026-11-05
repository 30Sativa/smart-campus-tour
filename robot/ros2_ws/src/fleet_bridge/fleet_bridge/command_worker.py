"""Background poll loop for Fleet Commands v1; ROS callbacks never perform HTTPS I/O."""

from __future__ import annotations

import http.client
import json
import random
import threading
from collections.abc import Callable
from dataclasses import dataclass

from .commands import CommandExecutor, parse_poll_response
from .http_client import HttpResponse, TransportFailure


@dataclass(frozen=True)
class CommandWorkerConfig:
    poll_period_sec: float = 0.5
    retry_max_sec: float = 30.0


class FleetCommandWorker:
    def __init__(self, config: CommandWorkerConfig, executor: CommandExecutor, transport: object,
                 stream_provider: Callable[[], str], on_log=None, stop_event: threading.Event | None = None,
                 wait=None, random_source=None):
        self.config = config
        self.executor = executor
        self.transport = transport
        self.stream_provider = stream_provider
        self.on_log = on_log or (lambda message: None)
        self.stop_event = stop_event or threading.Event()
        self.wait = wait or self.stop_event.wait
        self.random_source = random_source or random.random
        self._thread: threading.Thread | None = None
        self._failures = 0
        self._last_log: str | None = None

    def start(self) -> None:
        if self._thread is not None:
            raise RuntimeError('Fleet Command worker already started')
        self._thread = threading.Thread(target=self.run, name='fleet-commands-https', daemon=True)
        self._thread.start()

    def stop(self, join_timeout_sec: float = 3.0) -> None:
        self.stop_event.set()
        if self._thread is not None:
            self._thread.join(join_timeout_sec)

    def run(self) -> None:
        while not self.stop_event.is_set():
            try:
                healthy = self.run_once()
            except Exception as error:
                # A dead thread would silently stop results reaching the backend.
                self._note(f'Fleet Commands loop error ({type(error).__name__}).')
                healthy = False
            self._failures = 0 if healthy else min(self._failures + 1, 16)
            if self.wait(self._delay()):
                return

    def run_once(self) -> bool:
        """Results first, then always poll: a result the backend cannot take yet must never keep a Cancel away.

        A new GoTo polled meanwhile still meets the executor's rules (BUSY while a leg runs or the buffer is full).
        Healthy only when both succeeded, so a failing result post still backs off.
        """
        flushed = self._flush_results()
        polled = self._poll()
        return flushed and polled

    def _flush_results(self) -> bool:
        while (result := self.executor.next_result()) is not None:
            try:
                response = self.transport.post_result(result.command_id, result.body)
            except (TransportFailure, http.client.HTTPException, OSError, TimeoutError) as error:
                self._note(f'Result of {result.command_id} kept for retry ({type(error).__name__}).')
                return False
            if response.status == 200:
                self.executor.acknowledge(result)
            elif response.status in {400, 404, 409}:
                # Definitive per the contract: repeating these bytes cannot help.
                self._note(f'Result of {result.command_id} dropped: {_code(response)}.')
                self.executor.acknowledge(result)
            else:
                self._note(f'Result of {result.command_id} kept for retry: {_code(response)}.')
                return False
        return True

    def _poll(self) -> bool:
        stream_id = self.stream_provider()
        try:
            response = self.transport.poll(json.dumps({'streamId': stream_id}, separators=(',', ':')))
        except (TransportFailure, http.client.HTTPException, OSError, TimeoutError) as error:
            self._note(f'Poll failed ({type(error).__name__}).')
            return False
        if response.status != 200:
            self._note(f'Poll refused: {_code(response)}.')
            # STREAM_NOT_CURRENT costs nothing: telemetry catches up and the next poll works.
            return response.status == 409
        try:
            command = parse_poll_response(response.body)
        except ValueError as error:
            self._note(f'Poll response ignored: {error}.')
            return False
        if command is not None:
            self.executor.handle(command, stream_id)
        return True

    def _delay(self) -> float:
        if self._failures == 0:
            return self.config.poll_period_sec
        base = min(self.config.retry_max_sec, self.config.poll_period_sec * (2 ** self._failures))
        return max(self.config.poll_period_sec, base * (0.75 + 0.5 * self.random_source()))

    def _note(self, message: str) -> None:
        if message != self._last_log:
            self._last_log = message
            self.on_log(message)


def create_command_path(enabled: bool, create_navigator, create_transport, config: CommandWorkerConfig, map_key: str,
                        frame_id: str, stream_provider, on_log=None) -> tuple[CommandExecutor, FleetCommandWorker] | None:
    """Telemetry-only unless enabled: with False nothing here is built, so nothing polls or sends a goal."""
    if not enabled:
        return None
    executor = CommandExecutor(map_key, frame_id, create_navigator(), on_log=on_log)
    return executor, FleetCommandWorker(config, executor, create_transport(), stream_provider, on_log)


def _code(response: HttpResponse) -> str:
    body = response.body
    errors = body.get('errors') if isinstance(body, dict) else None
    code = errors.get('code') if isinstance(errors, dict) else None
    return code if isinstance(code, str) else f'http_{response.status}'
