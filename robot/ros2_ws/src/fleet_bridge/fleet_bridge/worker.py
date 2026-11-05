"""Single-flight telemetry sender; ROS callbacks never perform HTTPS I/O."""

from __future__ import annotations

import http.client
import random
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from .http_client import HttpResponse, TransportFailure
from .protocol import MAX_SAFE_SEQUENCE, build_report, serialize_report


@dataclass(frozen=True)
class WorkerConfig:
    robot_code: str
    map_key: str
    frame_id: str
    report_period_sec: float = 2.0
    max_report_age_sec: float = 30.0
    max_clock_floor_ahead_sec: float = 10.0
    retry_initial_sec: float = 1.0
    retry_max_sec: float = 30.0
    max_ordering_conflicts: int = 3
    max_validation_repairs: int = 8


@dataclass(frozen=True)
class Outcome:
    action: str
    reason: str = ''
    retry_after: str | None = None


class ClockBehindFloor(Exception):
    """The system clock is behind a timestamp that may already be in the API."""

    def __init__(self, seconds: float):
        super().__init__('CLOCK_BEHIND_FLOOR')
        self.seconds = max(0.0, seconds)


class ReportState:
    """One in-flight immutable report plus the backend ordering facts we know."""

    def __init__(self, config: WorkerConfig, stream_id: str | None = None):
        self.config = config
        self.stream_id = str(uuid.UUID(stream_id)) if stream_id else str(uuid.uuid4())
        self.next_seq = 1
        self.pending_body: str | None = None
        self.pending_created_monotonic: float | None = None
        self.pending_reported_at: datetime | None = None
        self.pending_may_have_been_accepted = False
        # Lower bound from an ACK or any request with an uncertain outcome.
        self.timestamp_floor: datetime | None = None
        self.ordering_conflicts = 0
        self.validation_repairs = 0

    def prepare(self, snapshot: dict[str, object], now: datetime, monotonic_now: float) -> str:
        if self.pending_body is not None:
            return self.pending_body
        if self.next_seq > MAX_SAFE_SEQUENCE:
            raise RuntimeError('Fleet Sync sequence reached the v1 maximum')
        report_time = now.astimezone(timezone.utc)
        if self.timestamp_floor is not None:
            if report_time < self.timestamp_floor:
                raise ClockBehindFloor((self.timestamp_floor - report_time).total_seconds())
        report = build_report(
            self.config.robot_code,
            self.stream_id,
            self.next_seq,
            report_time,
            self.config.map_key,
            self.config.frame_id,
            snapshot.get('pose'),
            str(snapshot.get('status', 'UNKNOWN')),
            snapshot.get('leg_id'),
        )
        self.pending_body = serialize_report(report)
        self.pending_created_monotonic = monotonic_now
        self.pending_reported_at = report_time
        self.pending_may_have_been_accepted = False
        return self.pending_body

    def handle_response(self, response: HttpResponse, monotonic_now: float) -> Outcome:
        if not isinstance(response, HttpResponse) or not isinstance(response.status, int):
            self.mark_uncertain()
            return Outcome('retry', 'MALFORMED_HTTP_RESPONSE')

        code = _response_code(response.body)
        if response.status == 200:
            if _accepted(response.body):
                if self.pending_reported_at is not None:
                    self._remember_timestamp(self.pending_reported_at)
                self._advance()
                self.ordering_conflicts = 0
                return Outcome('acknowledged', 'duplicate' if _duplicate(response.body) else 'accepted')
            # The server might have committed before its response was truncated,
            # empty, or malformed. Keep the exact bytes and retry them unchanged.
            self.mark_uncertain()
            return Outcome('retry', 'HTTP_200_OUTCOME_UNKNOWN')

        if response.status == 429:
            # The API limiter is before authentication/controller dispatch, so
            # this response proves that this attempt did not reach the store.
            return Outcome('retry', code or 'RATE_LIMITED', response.retry_after)

        if response.status in {408, 425} or 500 <= response.status <= 599:
            if response.status == 503 and code == 'MAP_CONTEXT_UNCONFIGURED':
                return Outcome('fatal', code)
            self.mark_uncertain()
            return Outcome('retry', code or f'http_{response.status}', response.retry_after)

        if response.status == 409 and code == 'OUT_OF_ORDER':
            # seq=1 on a new stream cannot be safely skipped: it is the stream
            # start required by v1. Later sequence conflicts are known rejects.
            if self.next_seq == 1:
                return Outcome('fatal', 'OUT_OF_ORDER_BEFORE_STREAM_ACK')
            self.ordering_conflicts += 1
            self._advance()
            if self.ordering_conflicts >= self.config.max_ordering_conflicts:
                return Outcome('fatal', 'OUT_OF_ORDER')
            return Outcome('dropped', 'OUT_OF_ORDER')

        if (
            response.status == 409
            and code == 'STALE_STREAM'
            and self.next_seq == 1
            and not self.pending_may_have_been_accepted
            and _stale_stream_is_timestamp_ordering(response.body)
        ):
            # A fresh process stream with seq=1 can be rejected because the
            # local clock is behind the current backend owner. The rejection
            # proves this body was not stored, so rebuild this same stream/seq
            # with a later wall-clock sample. Retired-stream conflicts remain
            # fatal and are never bypassed by minting more stream IDs.
            repair_count = self.validation_repairs + 1
            self._clear_pending()
            self.validation_repairs = repair_count
            if repair_count >= self.config.max_validation_repairs:
                return Outcome('fatal', 'STALE_STREAM_TIMESTAMP')
            return Outcome('repair', 'STALE_STREAM_TIMESTAMP')

        if response.status == 400:
            # A report can only be edited at the same sequence if every prior
            # attempt is known not to have been stored. If any attempt was
            # uncertain, retire this stream and restart at seq=1 instead.
            if self._pending_is_expired(monotonic_now):
                expiry_reason = self.expire_pending()
                return Outcome('repair', expiry_reason or 'REPORT_EXPIRED')
            repair_count = self.validation_repairs + 1
            transition_reason = None
            if self.pending_may_have_been_accepted:
                if self.next_seq > 1:
                    # This stream already has an ACKed baseline. A complete
                    # 400 proves this attempt was not stored; gaps are allowed,
                    # so skip the uncertain sequence rather than changing owner.
                    transition_reason = self._skip_pending_sequence(
                        'uncertain_400_rejection')
                else:
                    # The first report cannot be skipped. Preserve seq=1 on a
                    # new owner because the uncertain body may have been stored.
                    transition_reason = self._rotate_stream(
                        'uncertain_first_report_rejected')
            else:
                self._clear_pending()
            self.validation_repairs = repair_count
            if repair_count >= self.config.max_validation_repairs:
                return Outcome('fatal', 'VALIDATION_ERROR')
            reason = _validation_reason(response.body)
            if transition_reason is not None:
                reason = f'{transition_reason} validation={reason}'
            return Outcome('repair', reason)

        # Authentication, contract, ownership and payload-limit errors are
        # explicit rejections. They need operator/configuration action.
        return Outcome('fatal', code or f'http_{response.status}')

    def handle_transport_failure(self, error: TransportFailure) -> Outcome:
        self.mark_uncertain()
        return Outcome('retry', error.kind)

    def mark_uncertain(self) -> None:
        if self.pending_body is None:
            return
        self.pending_may_have_been_accepted = True
        if self.pending_reported_at is not None:
            self._remember_timestamp(self.pending_reported_at)

    def pending_is_expired(self, monotonic_now: float) -> bool:
        return self._pending_is_expired(monotonic_now)

    def expire_pending(self) -> str | None:
        """Drop stale bytes without reusing a possibly stored stream/sequence."""
        if self.pending_body is None:
            return None
        if self.pending_may_have_been_accepted:
            if self.next_seq > 1:
                return self._skip_pending_sequence('uncertain_report_expired')
            return self._rotate_stream('uncertain_report_expired')
        else:
            # 429 or a complete validation rejection proved non-storage. Keep
            # the same sequence, but build a fresh timestamp and latest snapshot.
            self._clear_pending()
            self.validation_repairs = 0
            return None

    def _pending_is_expired(self, monotonic_now: float) -> bool:
        return (
            self.pending_created_monotonic is not None
            and monotonic_now - self.pending_created_monotonic >= self.config.max_report_age_sec
        )

    def _advance(self) -> None:
        self.next_seq += 1
        self._clear_pending()
        self.validation_repairs = 0

    def _rotate_stream(self, cause: str) -> str:
        old_stream_id = self.stream_id
        old_seq = self.next_seq
        self.stream_id = str(uuid.uuid4())
        self.next_seq = 1
        self._clear_pending()
        self.validation_repairs = 0
        self.ordering_conflicts = 0
        return (
            f'STREAM_ROTATED cause={cause} old_stream_id={old_stream_id} '
            f'old_seq={old_seq} new_stream_id={self.stream_id} new_seq=1')

    def _skip_pending_sequence(self, cause: str) -> str:
        stream_id = self.stream_id
        skipped_seq = self.next_seq
        self._advance()
        return (
            f'UNCERTAIN_REPORT_SKIPPED cause={cause} stream_id={stream_id} '
            f'skipped_seq={skipped_seq} next_seq={self.next_seq}')

    def _remember_timestamp(self, value: datetime) -> None:
        if self.timestamp_floor is None or value > self.timestamp_floor:
            self.timestamp_floor = value

    def _clear_pending(self) -> None:
        self.pending_body = None
        self.pending_created_monotonic = None
        self.pending_reported_at = None
        self.pending_may_have_been_accepted = False


class FleetSyncWorker:
    def __init__(
        self,
        state: ReportState,
        transport: object,
        snapshot_provider,
        on_state=None,
        stop_event: threading.Event | None = None,
        wall_clock=None,
        monotonic_clock=None,
        wait=None,
        random_source=None,
    ):
        self.state = state
        self.transport = transport
        self.snapshot_provider = snapshot_provider
        self.on_state = on_state or (lambda state, reason: None)
        self.stop_event = stop_event or threading.Event()
        self.wall_clock = wall_clock or (lambda: datetime.now(timezone.utc))
        self.monotonic_clock = monotonic_clock or time.monotonic
        self.wait = wait or self.stop_event.wait
        self.random_source = random_source or random.random
        self._thread: threading.Thread | None = None
        self._last_state: tuple[str, str] | None = None
        self.fatal_event = threading.Event()
        self.fatal_reason: str | None = None

    def start(self) -> None:
        if self._thread is not None:
            raise RuntimeError('Fleet Sync worker already started')
        self._thread = threading.Thread(target=self.run, name='fleet-sync-https', daemon=True)
        self._thread.start()

    def stop(self, join_timeout_sec: float = 3.0) -> None:
        self.stop_event.set()
        if self._thread is not None:
            self._thread.join(join_timeout_sec)

    def run(self) -> None:
        try:
            self._run_loop()
        except Exception as error:
            # Last-resort containment: unexpected worker failures become an
            # observable process failure instead of a dead background thread.
            self._set_fatal(type(error).__name__)

    def _run_loop(self) -> None:
        next_report_at = self.monotonic_clock()
        retry_attempt = 0
        while not self.stop_event.is_set() and not self.fatal_event.is_set():
            now_mono = self.monotonic_clock()
            if self.state.pending_is_expired(now_mono):
                expiry_reason = self.state.expire_pending()
                retry_attempt = 0
                next_report_at = now_mono
                self._notify('retrying', expiry_reason or 'REPORT_EXPIRED')

            if self.state.pending_body is None:
                delay = max(0.0, next_report_at - now_mono)
                if delay and self.wait(delay):
                    return
                if self.stop_event.is_set():
                    return

            try:
                body = self.state.prepare(
                    self.snapshot_provider(), self.wall_clock(), self.monotonic_clock())
            except ClockBehindFloor as error:
                clock_limit = self.state.config.max_clock_floor_ahead_sec
                if error.seconds > clock_limit:
                    self._set_fatal(
                        'CLOCK_STEP_BACKWARD '
                        f'floor_ahead_sec={error.seconds:.1f} limit_sec={clock_limit:.1f}')
                    return
                self._notify('waiting', 'CLOCK_BEHIND_POSSIBLY_ACCEPTED_REPORT')
                delay = min(self.state.config.retry_max_sec, max(0.25, error.seconds))
                if self.wait(delay):
                    return
                continue

            try:
                response = self.transport.post(body)
                outcome = self.state.handle_response(response, self.monotonic_clock())
            except TransportFailure as error:
                outcome = self.state.handle_transport_failure(error)
            except (http.client.HTTPException, OSError, TimeoutError) as error:
                self.state.mark_uncertain()
                outcome = Outcome('retry', type(error).__name__)

            if outcome.action == 'acknowledged':
                self._notify('connected', outcome.reason)
                retry_attempt = 0
                next_report_at = self.monotonic_clock() + self.state.config.report_period_sec
                continue
            if outcome.action == 'retry':
                self._notify('retrying', outcome.reason)
                retry_attempt = min(retry_attempt + 1, 31)
                delay = retry_delay(
                    self.state.config, retry_attempt, outcome.retry_after, self.random_source)
                if self.wait(delay):
                    return
                continue
            if outcome.action == 'dropped':
                retry_attempt = 0
                next_report_at = self.monotonic_clock() + self.state.config.report_period_sec
                self._notify('retrying', outcome.reason)
                continue
            if outcome.action == 'repair':
                retry_attempt = 0
                self._notify('retrying', outcome.reason)
                delay = retry_delay(
                    self.state.config, self.state.validation_repairs, None, self.random_source)
                if self.wait(delay):
                    return
                continue
            self._set_fatal(outcome.reason)
            return

    def _set_fatal(self, reason: str) -> None:
        self.fatal_reason = reason
        self.fatal_event.set()
        self._notify('fatal', reason)

    def _notify(self, state: str, reason: str) -> None:
        current = (state, reason)
        if current != self._last_state:
            self._last_state = current
            try:
                self.on_state(state, reason)
            except Exception:
                # A logger callback must not kill retry handling or hide fatal.
                if state != 'fatal':
                    self.fatal_reason = 'STATE_CALLBACK_FAILURE'
                    self.fatal_event.set()


def retry_delay(config: WorkerConfig, attempt: int, retry_after: str | None, random_source) -> float:
    exponent = min(max(0, attempt - 1), 30)
    base = min(config.retry_max_sec, config.retry_initial_sec * (2 ** exponent))
    jittered = base * (0.75 + 0.5 * random_source())
    requested = _retry_after_seconds(retry_after)
    if requested is not None:
        # Retry-After is a minimum delay from the server. Apply jitter only to
        # our own exponential backoff so it can never shorten that interval.
        jittered = max(jittered, min(config.retry_max_sec, requested))
    return max(0.25, min(config.retry_max_sec, jittered))


def _retry_after_seconds(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            date = parsedate_to_datetime(value)
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            return max(0.0, (date - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return None


def _accepted(body: object) -> bool:
    if not isinstance(body, dict) or body.get('success') is not True:
        return False
    data = body.get('data')
    return isinstance(data, dict) and data.get('accepted') is True


def _duplicate(body: object) -> bool:
    return isinstance(body, dict) and isinstance(body.get('data'), dict) and body['data'].get('duplicate') is True


def _response_code(body: object) -> str | None:
    if not isinstance(body, dict):
        return None
    errors = body.get('errors')
    if isinstance(errors, dict):
        code = errors.get('code')
        if isinstance(code, str):
            return code
    return None


def _stale_stream_is_timestamp_ordering(body: object) -> bool:
    if not isinstance(body, dict):
        return False
    message = body.get('message')
    return isinstance(message, str) and 'timestamp at least as new' in message.lower()


def _validation_reason(body: object) -> str:
    if not isinstance(body, dict):
        return 'HTTP_400_VALIDATION'
    errors = body.get('errors')
    if isinstance(errors, dict):
        details = ' '.join(
            [str(key) for key in errors]
            + [str(message) for messages in errors.values()
               for message in (messages if isinstance(messages, list) else [messages])]
        ).lower()
        if any(term in details for term in ('reportedat', 'capturedat', 'timestamp', 'utc', 'freshness')):
            return 'TIMESTAMP_VALIDATION'
    return 'HTTP_400_VALIDATION'
