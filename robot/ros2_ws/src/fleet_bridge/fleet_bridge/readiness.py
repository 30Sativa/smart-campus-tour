"""rclpy-free readiness rules (docs/decisions/0049-m2-3-robot-local-safety.md, Decisions 3 to 5).

A source that has no data gives None, which the backend treats as a failure. The fault code names
the root cause first: a latched gate is a consequence, so it never hides what tripped it.
"""

from __future__ import annotations

from dataclasses import dataclass

MAP_CONTENT_MISMATCH = 'MAP_CONTENT_MISMATCH'
MAP_EVIDENCE_MISSING = 'MAP_EVIDENCE_MISSING'
ALLOWED_MODE = 'explore'


@dataclass(frozen=True)
class ReadinessLimits:
    tf_max_age_sec: float = 1.0
    max_xy_variance: float = 0.09
    max_yaw_variance: float = 0.05
    odom_max_age_sec: float = 0.5
    gate_max_age_sec: float = 1.5


@dataclass(frozen=True)
class Observations:
    amcl_covariance: tuple[float, float, float] | None = None  # xx, yy, yaw
    tf_age_sec: float | None = None
    emergency_stop: bool | None = None
    mode: str | None = None
    gate_state: str | None = None
    gate_age_sec: float | None = None
    odom_age_sec: float | None = None
    nav2_ready: bool | None = None
    unowned_goal: str | None = None
    map_fault: str | None = MAP_EVIDENCE_MISSING


@dataclass(frozen=True)
class Readiness:
    localized: bool | None = None
    motion_ready: bool | None = None
    fault_code: str | None = None
    unowned_goal: str | None = None
    permit_allowed: bool = False
    goto_refusal: str | None = 'NOT_MOTION_READY'


def _localized(obs: Observations, limits: ReadinessLimits) -> bool | None:
    if obs.amcl_covariance is None:
        return None
    if obs.tf_age_sec is None or obs.tf_age_sec > limits.tf_max_age_sec:
        return False
    xx, yy, yaw = obs.amcl_covariance
    return bool(xx <= limits.max_xy_variance and yy <= limits.max_xy_variance and yaw <= limits.max_yaw_variance)


def _combine(conditions: list[bool | None]) -> bool | None:
    if any(value is None for value in conditions):
        return None
    return all(conditions)


def _fault(obs: Observations, gate: str | None, odom_fresh: bool, tf_fresh: bool) -> str | None:
    if obs.emergency_stop:
        return 'ESTOP_ENGAGED'
    if obs.unowned_goal is not None:
        return obs.unowned_goal
    if obs.map_fault is not None:
        return obs.map_fault
    if gate == 'DISABLED':
        return 'MOTION_GATE_DISABLED'
    if not odom_fresh:
        return 'STM32_LINK_STALE'
    if obs.nav2_ready is not True:
        return 'NAV2_UNAVAILABLE'
    if not tf_fresh:
        return 'TF_STALE'
    if gate is not None and gate.startswith('LATCHED'):
        return 'MOTION_GATE_LATCHED'
    return None


def evaluate(obs: Observations, limits: ReadinessLimits) -> Readiness:
    localized = _localized(obs, limits)
    gate = obs.gate_state if obs.gate_age_sec is not None and obs.gate_age_sec <= limits.gate_max_age_sec else None
    odom_fresh = obs.odom_age_sec is not None and obs.odom_age_sec <= limits.odom_max_age_sec
    tf_fresh = obs.tf_age_sec is not None and obs.tf_age_sec <= limits.tf_max_age_sec
    motion_ready = _combine([
        None if obs.emergency_stop is None else not obs.emergency_stop,
        None if obs.mode is None else obs.mode == ALLOWED_MODE,
        None if gate is None else gate == 'OPEN',
        True if odom_fresh else None,
        obs.nav2_ready,
        obs.unowned_goal is None,
        None if obs.map_fault == MAP_EVIDENCE_MISSING else obs.map_fault is None,
    ])
    fault = _fault(obs, gate, odom_fresh, tf_fresh)
    if obs.map_fault is not None:
        refusal = 'MAP_MISMATCH'
    elif localized is not True:
        refusal = 'NOT_LOCALIZED'
    elif motion_ready is not True:
        refusal = fault or 'NOT_MOTION_READY'
    else:
        refusal = None
    # Missing map evidence refuses new goals above. It must not stop a robot already moving (ADR-0049, Decision 1).
    permit_allowed = odom_fresh and obs.unowned_goal is None and obs.map_fault != MAP_CONTENT_MISMATCH
    return Readiness(localized, motion_ready, fault, obs.unowned_goal, permit_allowed, refusal)
