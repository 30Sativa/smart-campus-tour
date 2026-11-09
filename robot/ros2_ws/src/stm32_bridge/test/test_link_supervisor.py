"""State machine behind the wheel-motion gate. No ROS, no serial."""

import os
import sys

_PKG_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PKG_ROOT not in sys.path:
    sys.path.insert(0, _PKG_ROOT)

from stm32_bridge.link_supervisor import (  # noqa: E402
    DISCONNECTED,
    ERROR,
    FEEDBACK_LOST,
    FilterSwitch,
    LinkSupervisor,
    OK,
    ONLINE,
    RECOVERING,
    WAITING_FEEDBACK,
    WARN,
)

STREAMING, IDLE = False, True


def feed(link, start, stop, command_idle, period=0.02):
    """Steady feedback from start to stop, ticking like the 20 Hz timer."""
    now = start
    while now < stop:
        link.on_feedback(now)
        link.tick(now, command_idle)
        now += period
    return now


def online_link():
    link = LinkSupervisor(feedback_timeout=1.0, recovery_time=0.5)
    link.on_port_opened(0.0)
    now = feed(link, 0.0, 0.6, IDLE)
    assert link.motion_permitted
    return link, now


def test_nothing_is_permitted_before_a_port_exists():
    link = LinkSupervisor(1.0, 0.5)
    assert link.state == DISCONNECTED
    assert not link.motion_permitted
    link.tick(10.0, IDLE)
    assert not link.motion_permitted


def test_open_port_without_feedback_never_permits_motion():
    link = LinkSupervisor(1.0, 0.5)
    link.on_port_opened(0.0)
    for now in (0.1, 0.9, 1.5, 60.0):
        link.tick(now, IDLE)
        assert link.state == WAITING_FEEDBACK
        assert not link.motion_permitted


def test_first_frame_alone_does_not_permit_motion():
    link = LinkSupervisor(1.0, 0.5)
    link.on_port_opened(0.0)
    link.on_feedback(0.1)
    link.tick(0.1, IDLE)
    assert link.state == RECOVERING and not link.motion_permitted


def test_startup_with_idle_commands_comes_online():
    link = LinkSupervisor(1.0, 0.5)
    link.on_port_opened(0.0)
    feed(link, 0.0, 0.6, IDLE)
    assert link.state == ONLINE and link.rearm_reason is None and link.motion_permitted


def test_startup_into_a_running_command_stream_stays_held_until_idle():
    link = LinkSupervisor(1.0, 0.5)
    link.on_port_opened(0.0)
    now = feed(link, 0.0, 2.0, STREAMING)
    assert link.state == ONLINE and not link.motion_permitted
    assert link.rearm_reason == 'startup'
    feed(link, now, now + 0.05, IDLE)
    assert link.motion_permitted


def test_feedback_timeout_is_inclusive_like_the_old_check():
    link, now = online_link()
    last = now - 0.02
    link.tick(last + 1.0, STREAMING)
    assert link.state == ONLINE
    link.tick(last + 1.001, STREAMING)
    assert link.state == FEEDBACK_LOST


def test_feedback_loss_is_a_level_not_an_edge():
    link, now = online_link()
    link.tick(now + 2.0, STREAMING)
    assert link.state == FEEDBACK_LOST
    for extra in range(1, 100):
        link.tick(now + 2.0 + extra * 0.05, STREAMING)
        assert not link.motion_permitted


def test_feedback_gap_needs_steady_feedback_and_idle():
    """A running /cmd_vel stream must not restart the wheels after a long gap."""
    link, now = online_link()
    now += 2.0
    link.tick(now, STREAMING)
    assert link.state == FEEDBACK_LOST and link.rearm_reason == 'feedback_timeout'
    now = feed(link, now, now + 2.0, STREAMING)
    assert link.state == ONLINE and not link.motion_permitted
    link.tick(now, IDLE)
    assert link.motion_permitted


def test_gap_inside_the_timeout_is_ridden_through():
    link, now = online_link()
    last = now - 0.02
    link.tick(last + 0.9, STREAMING)
    assert link.motion_permitted
    link.on_feedback(last + 0.9)
    link.tick(last + 0.95, STREAMING)
    assert link.motion_permitted and link.faults == 0


def test_feedback_flowing_tracks_the_pause_decision():
    link = LinkSupervisor(1.0, 0.5)
    assert not link.feedback_flowing
    link.on_port_opened(0.0)
    assert not link.feedback_flowing
    link.on_feedback(0.1)
    assert link.feedback_flowing
    link.tick(2.0, IDLE)
    assert link.state == FEEDBACK_LOST and not link.feedback_flowing


def test_straggling_frames_restart_the_recovery_hold():
    link, now = online_link()
    now += 2.0
    link.tick(now, STREAMING)
    for frame in range(10):                 # one frame every 0.3 s for 3 s
        link.on_feedback(now + frame * 0.3)
        link.tick(now + frame * 0.3, IDLE)
        assert link.state != ONLINE and not link.motion_permitted


def test_feedback_loss_during_recovery_goes_back_to_lost():
    link, now = online_link()
    now += 2.0
    link.tick(now, STREAMING)
    link.on_feedback(now)
    link.tick(now + 1.5, STREAMING)
    assert link.state == FEEDBACK_LOST


def test_port_loss_requires_recovery_and_idle():
    link, now = online_link()
    events = link.on_port_closed(now, 'serial_read_failed')
    assert events and events[0][0] == WARN
    assert link.state == DISCONNECTED and link.rearm_reason == 'serial_read_failed'
    link.tick(now + 5.0, IDLE)
    assert not link.motion_permitted

    now += 8.0
    link.on_port_opened(now)
    now = feed(link, now, now + 1.0, STREAMING)
    assert link.state == ONLINE and not link.motion_permitted
    link.tick(now, IDLE)
    assert link.motion_permitted


def test_idle_commands_before_recovery_do_not_release_the_wheels():
    """A stop seen while the MCU is still booting says nothing about the
    command source once the link is back."""
    link, now = online_link()
    link.on_port_closed(now, 'x')
    link.tick(now + 1.0, IDLE)
    link.on_port_opened(now + 2.0)
    link.tick(now + 2.1, IDLE)
    link.on_feedback(now + 2.2)
    link.tick(now + 2.2, IDLE)
    assert link.rearm_reason == 'x'
    feed(link, now + 2.3, now + 2.9, STREAMING)  # hold over, still streaming
    assert link.state == ONLINE and link.rearm_reason == 'x'
    assert not link.motion_permitted


def test_port_closed_twice_counts_one_fault():
    link, now = online_link()
    link.on_port_closed(now, 'first')
    assert link.on_port_closed(now, 'second') == []
    assert link.faults == 1 and link.rearm_reason == 'first'


def test_discontinuity_while_online_holds_and_needs_idle():
    link, now = online_link()
    events = link.on_discontinuity(now, 'count_jump')
    assert events[0][0] == WARN
    assert link.state == RECOVERING and not link.motion_permitted
    now = feed(link, now, now + 0.6, STREAMING)
    assert link.state == ONLINE and link.rearm_reason == 'count_jump'
    link.tick(now, IDLE)
    assert link.motion_permitted


def test_status_levels_follow_the_state():
    link = LinkSupervisor(1.0, 0.5)
    assert link.status(0.0)[0] == ERROR
    link.on_port_opened(0.0)
    assert link.status(0.0)[0] == ERROR
    link.on_feedback(0.1)
    assert link.status(0.1)[0] == WARN
    now = feed(link, 0.1, 0.8, STREAMING)
    level, message, values = link.status(now)
    assert level == WARN and 'startup' in message
    assert values['motion_permitted'] == 'false'
    link.tick(now, IDLE)
    level, _, values = link.status(now)
    assert level == OK and values['motion_permitted'] == 'true'
    assert values['state'] == ONLINE


def test_recovery_gap_never_exceeds_the_feedback_timeout():
    link = LinkSupervisor(feedback_timeout=0.1, recovery_time=0.05)
    assert link._recovery_gap == 0.1


class _Future:
    def __init__(self):
        self.finished = False

    def done(self):
        return self.finished


class _Toggle:
    def __init__(self):
        self.is_ready = True
        self.sent = []
        self.futures = []

    def ready(self):
        return self.is_ready

    def send(self, on):
        self.sent.append(on)
        self.futures.append(_Future())
        return self.futures[-1]

    def complete(self):
        self.futures[-1].finished = True

    def switch(self):
        return FilterSwitch(self.ready, self.send)


def test_filter_switch_waits_for_the_service():
    toggle = _Toggle()
    toggle.is_ready = False
    switch = toggle.switch()
    switch.update(False, 0.0)
    assert toggle.sent == []
    toggle.is_ready = True
    switch.update(False, 0.1)
    assert toggle.sent == [False]


def test_filter_switch_syncs_once_after_a_bridge_restart():
    toggle = _Toggle()
    switch = toggle.switch()
    switch.update(True, 0.0)
    toggle.complete()
    for step in range(1, 20):
        switch.update(True, step * 0.05)
    assert toggle.sent == [True]


def test_filter_switch_sends_only_on_changes():
    toggle = _Toggle()
    switch = toggle.switch()
    switch.update(False, 0.0)
    toggle.complete()
    switch.update(False, 0.1)
    switch.update(True, 0.2)
    toggle.complete()
    switch.update(True, 0.3)
    assert toggle.sent == [False, True]


def test_filter_switch_does_not_stack_requests():
    toggle = _Toggle()
    switch = toggle.switch()
    switch.update(False, 0.0)
    switch.update(True, 0.1)
    assert toggle.sent == [False]
    toggle.complete()
    switch.update(True, 0.2)
    assert toggle.sent == [False, True]


def test_filter_switch_retries_a_lost_reply():
    toggle = _Toggle()
    switch = toggle.switch()
    switch.update(False, 0.0)
    switch.update(False, 1.5)
    assert toggle.sent == [False, False]

