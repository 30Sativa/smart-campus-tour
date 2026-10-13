"""Circuit breaker and non-queuing concurrency limit for LLM calls."""

from __future__ import annotations

import time
from collections.abc import Callable


class CircuitBreaker:
    """Closed -> open after N consecutive failures -> half-open after reset_s.

    In half-open state one trial call is allowed; success closes the circuit,
    failure opens it again for another reset period.
    """

    def __init__(self, threshold: int, reset_s: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.threshold = threshold
        self.reset_s = reset_s
        self._clock = clock
        self._failures = 0
        self._opened_at: float | None = None
        self._trial_in_flight = False

    @property
    def state(self) -> str:
        if self._opened_at is None:
            return "closed"
        return "half_open" if self._clock() - self._opened_at >= self.reset_s else "open"

    def allow(self) -> bool:
        state = self.state
        if state == "closed":
            return True
        if state == "half_open" and not self._trial_in_flight:
            self._trial_in_flight = True
            return True
        return False

    def record_success(self) -> None:
        self._failures = 0
        self._opened_at = None
        self._trial_in_flight = False

    def record_failure(self) -> None:
        self._trial_in_flight = False
        self._failures += 1
        if self._opened_at is not None or self._failures >= self.threshold:
            self._opened_at = self._clock()

    def release(self) -> None:
        """Call when an allowed call ended without a provider verdict."""
        self._trial_in_flight = False


class ConcurrencyLimit:
    """At most `limit` calls in flight; extra callers are rejected, never queued."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.in_flight = 0

    def try_acquire(self) -> bool:
        if self.in_flight >= self.limit:
            return False
        self.in_flight += 1
        return True

    def release(self) -> None:
        self.in_flight = max(0, self.in_flight - 1)
