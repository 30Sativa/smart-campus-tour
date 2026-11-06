"""Background long-poll loop for Fleet Head v1; ROS callbacks never perform HTTPS I/O."""

from __future__ import annotations

import http.client
import json
import random
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Optional

from .head import HeadCommandApplier, parse_head_poll_response
from .http_client import FleetSyncHttpClient, HttpResponse, TransportFailure


@dataclass(frozen=True)
class HeadWorkerConfig:
    wait_ms: int = 1500
    retry_initial_sec: float = 0.5
    retry_max_sec: float = 10.0
    # A server that answers "nothing new" faster than this (e.g. MaxWaitMs 0) must not be polled in a tight loop.
    min_empty_interval_sec: float = 0.2


class FleetHeadHttpClient(FleetSyncHttpClient):
    """Same credential, TLS and bounds as Fleet Sync; `url` is the head v1 base without a trailing slash."""

    def poll(self, body: str) -> HttpResponse:
        return self._post(f'{self.url}/poll', body)


def head_url_from_sync_url(sync_url: str) -> str:
    suffix = '/api/fleet/v1/sync'
    if not sync_url.endswith(suffix):
        raise ValueError('Set head_base_url: FLEET_SYNC_URL does not end with the Fleet Sync path')
    return sync_url[:-len(suffix)] + '/api/fleet/head/v1'


class FleetHeadWorker:
    def __init__(self, config: HeadWorkerConfig, applier: HeadCommandApplier, transport: object,
                 head_provider: Callable[[], Optional[dict]], on_log=None, stop_event: threading.Event | None = None,
                 wait=None, clock=time.monotonic, random_source=None):
        self.config = config
        self.applier = applier
        self.transport = transport
        self.head_provider = head_provider
        self.on_log = on_log or (lambda message: None)
        self.stop_event = stop_event or threading.Event()
        self.wait = wait or self.stop_event.wait
        self.clock = clock
        self.random_source = random_source or random.random
        self._thread: threading.Thread | None = None
        self._failures = 0
        self._last_log: str | None = None
        self.last_executed = 0

    def start(self) -> None:
        if self._thread is not None:
            raise RuntimeError('Fleet Head worker already started')
        self._thread = threading.Thread(target=self.run, name='fleet-head-https', daemon=True)
        self._thread.start()

    def stop(self, join_timeout_sec: float = 3.0) -> None:
        self.stop_event.set()
        if self._thread is not None:
            self._thread.join(join_timeout_sec)
        self.applier.release()

    def run(self) -> None:
        while not self.stop_event.is_set():
            started = self.clock()
            try:
                healthy = self.run_once()
            except Exception as error:  # noqa: BLE001 - a dead thread would silently ignore the Operator
                self._note(f'Fleet Head loop error ({type(error).__name__}).')
                healthy = False
            self._failures = 0 if healthy else min(self._failures + 1, 16)
            if self._failures:
                if self.wait(self._delay()):
                    return
            elif self.last_executed == 0 and self.clock() - started < self.config.min_empty_interval_sec:
                if self.wait(self.config.min_empty_interval_sec):
                    return

    def run_once(self) -> bool:
        """One long poll. The server already waited, so a healthy round polls again at once."""
        epoch, after_seq = self.applier.cursor()
        body = json.dumps({'epoch': epoch, 'afterSeq': after_seq, 'waitMs': self.config.wait_ms,
                           'head': self.head_provider()}, separators=(',', ':'))
        self.last_executed = 0
        try:
            response = self.transport.poll(body)
        except (TransportFailure, http.client.HTTPException, OSError, TimeoutError) as error:
            self._note(f'Head poll failed ({getattr(error, "kind", type(error).__name__)}).')
            return False
        if response.status != 200:
            self._note(f'Head poll refused: {_code(response)}.')
            return False
        try:
            epoch, commands = parse_head_poll_response(response.body)
        except ValueError as error:
            self._note(f'Head poll response ignored: {error}.')
            return False
        self.last_executed = self.applier.apply(epoch, commands, self.clock())
        self._last_log = None
        return True

    def _delay(self) -> float:
        base = min(self.config.retry_max_sec, self.config.retry_initial_sec * (2 ** (self._failures - 1)))
        return max(self.config.retry_initial_sec, base * (0.75 + 0.5 * self.random_source()))

    def _note(self, message: str) -> None:
        if message != self._last_log:
            self._last_log = message
            self.on_log(message)


def _code(response: HttpResponse) -> str:
    body = response.body
    errors = body.get('errors') if isinstance(body, dict) else None
    code = errors.get('code') if isinstance(errors, dict) else None
    return code if isinstance(code, str) else f'http_{response.status}'
