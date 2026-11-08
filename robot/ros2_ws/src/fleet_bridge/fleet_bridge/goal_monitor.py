"""rclpy-free detection of Nav2 goals this bridge did not send (ADR-0049, Decision 5). It never cancels one."""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable, Iterable

# A goal on one of these can only come from an outside sender.
TOP_LEVEL_ACTIONS = ('navigate_to_pose', 'navigate_through_poses', 'follow_waypoints', 'go_to_stop')
# bt_navigator sends these itself while it runs a goal, so they count only when no navigation goal is active.
CHILD_ACTIONS = ('follow_path', 'spin', 'backup', 'drive_on_heading', 'wait', 'assisted_teleop')
MONITORED_ACTIONS = TOP_LEVEL_ACTIONS + CHILD_ACTIONS

FOREIGN_NAV_GOAL = 'FOREIGN_NAV_GOAL'
UNOWNED_GOAL_AT_STARTUP = 'UNOWNED_GOAL_AT_STARTUP'


class GoalMonitor:
    def __init__(self, startup_window_sec: float = 2.0, child_debounce_sec: float = 1.0, monotonic=None):
        self._monotonic = monotonic or time.monotonic
        self._startup_until = self._monotonic() + startup_window_sec
        self._child_debounce_sec = child_debounce_sec
        self._own: deque[bytes] = deque(maxlen=256)
        self._active: dict[str, set[bytes]] = {}
        self._seen_at_startup: set[bytes] = set()
        self._child_since: float | None = None

    def mark_own(self, goal_id: bytes) -> None:
        """Called before the goal is sent: its status can arrive before the goal response."""
        self._own.append(goal_id)

    def on_status(self, action: str, active_ids: Iterable[bytes]) -> None:
        ids = set(active_ids)
        self._active[action] = ids
        if self._monotonic() <= self._startup_until:
            self._seen_at_startup |= {goal for goal in ids if goal not in self._own}

    def classify(self, is_alive: Callable[[str], bool]) -> str | None:
        """Return a fault code, or None. A crashed server leaves its last status latched, so it must be alive."""
        live = {action: ids for action, ids in self._active.items() if ids and is_alive(action)}
        navigation = set().union(*(live.get(action, set()) for action in TOP_LEVEL_ACTIONS))
        unowned = {goal for goal in navigation if goal not in self._own}
        children = set().union(*(live.get(action, set()) for action in CHILD_ACTIONS))
        if children and not navigation:
            now = self._monotonic()
            if self._child_since is None:
                self._child_since = now
            if now - self._child_since >= self._child_debounce_sec:
                unowned |= children
        else:
            self._child_since = None
        if not unowned:
            return None
        return UNOWNED_GOAL_AT_STARTUP if unowned & self._seen_at_startup else FOREIGN_NAV_GOAL
