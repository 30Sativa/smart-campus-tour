"""Small process-lifecycle helper kept independent of rclpy for offline tests."""

from __future__ import annotations

import threading
from collections.abc import Callable


def spin_until_worker_fatal(
    executor: object,
    fatal_event: threading.Event,
    is_running: Callable[[], bool],
) -> int:
    """Keep ROS callbacks serviced until shutdown or a terminal worker failure."""
    spin_once = getattr(executor, 'spin_once')
    while is_running() and not fatal_event.is_set():
        spin_once(timeout_sec=0.25)
    return 1 if fatal_event.is_set() else 0
