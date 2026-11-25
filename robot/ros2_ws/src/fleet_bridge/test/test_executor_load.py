"""Executor load of the ROS adapters, tested offline: ROS packages are replaced by stubs while a module is imported.

rclpy's Humble executor rebuilds its wait set on every wake-up, so the bridge must not poll from a timer and must not
add a waitable per subscription (CPU on the J5005, 25/11/2026).
"""

import importlib
import sys
import threading
import types
import unittest
from unittest import mock


class _StubType(type):
    def __getattr__(cls, name):
        if name.startswith('__'):
            raise AttributeError(name)
        return cls


class _Stub(metaclass=_StubType):
    """Any ROS type: construction records its arguments, any class attribute is the class itself."""

    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs


class _StubModule(types.ModuleType):
    def __getattr__(self, name):
        if name.startswith('__'):
            raise AttributeError(name)
        value = type(name, (_Stub,), {})
        setattr(self, name, value)
        return value


ROS_MODULES = (
    'rclpy', 'rclpy.action', 'rclpy.duration', 'rclpy.executors', 'rclpy.qos', 'rclpy.qos_event', 'tf2_ros',
    'action_msgs', 'action_msgs.msg', 'geometry_msgs', 'geometry_msgs.msg', 'nav_msgs', 'nav_msgs.msg',
    'nav2_msgs', 'nav2_msgs.action', 'rcl_interfaces', 'rcl_interfaces.srv', 'std_msgs', 'std_msgs.msg',
    'unique_identifier_msgs', 'unique_identifier_msgs.msg',
)


class FakeNode:
    def __init__(self, *args, **kwargs):
        self.subscriptions = []
        self.timers = []
        self.guards = []

    def create_subscription(self, msg_type, topic, callback, qos_profile, **kwargs):
        self.subscriptions.append((msg_type, topic, kwargs))
        return types.SimpleNamespace(topic_name=topic)

    def create_timer(self, period_sec, callback):
        self.timers.append((period_sec, callback))

    def create_client(self, *args, **kwargs):
        return mock.Mock()

    def create_guard_condition(self, callback):
        guard = FakeGuard(callback)
        self.guards.append(guard)
        return guard


class FakeGuard:
    def __init__(self, callback):
        self.callback = callback
        self.triggered = 0

    def trigger(self):
        self.triggered += 1


def import_with_stubs(module_name):
    """Import a fleet_bridge module against stub ROS packages; call inside `mock.patch.dict(sys.modules)`."""
    for name in ROS_MODULES:
        sys.modules[name] = _StubModule(name)
    sys.modules['rclpy.node'] = types.SimpleNamespace(Node=FakeNode)
    sys.modules.pop(module_name, None)
    return importlib.import_module(module_name)


class Nav2NavigatorWakeupTest(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.dict(sys.modules)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.nav2 = import_with_stubs('fleet_bridge.nav2')
        self.node = FakeNode()
        self.navigator = self.nav2.Nav2Navigator(self.node)

    def test_no_polling_timer(self):
        self.assertEqual([], self.node.timers)
        self.assertEqual(1, len(self.node.guards))

    def test_work_queued_from_another_thread_runs_only_when_the_executor_drains_it(self):
        worker = threading.Thread(target=self.navigator.cancel)
        worker.start()
        worker.join()
        guard = self.node.guards[0]
        # Queued and the executor woken, but nothing ran on the caller's thread.
        self.assertEqual(1, guard.triggered)
        self.assertFalse(self.navigator._cancel_pending)
        guard.callback()
        self.assertTrue(self.navigator._cancel_pending)

    def test_one_wake_drains_everything_queued(self):
        refusals = []
        self.navigator._prepare = lambda done: done('REFUSED')
        for _ in range(3):
            self.navigator.send_goal(1.0, 2.0, 0.0, 'map', lambda ok, reason: refusals.append(reason), None)
        guard = self.node.guards[0]
        self.assertEqual(3, guard.triggered)
        guard.callback()
        self.assertEqual(['REFUSED'] * 3, refusals)
        guard.callback()  # A wake with nothing queued is harmless.
        self.assertEqual(3, len(refusals))


class SubscriptionEventsTest(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.dict(sys.modules)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.module = import_with_stubs('fleet_bridge.node')
        # Only the override is under test: skip the parameter-driven constructor.
        self.node = self.module.FleetBridgeNode.__new__(self.module.FleetBridgeNode)
        FakeNode.__init__(self.node)

    def test_default_incompatible_qos_handler_is_not_created(self):
        self.node.create_subscription('Odometry', 'wheel/odom', print, 10, raw=True)
        _, topic, kwargs = self.node.subscriptions[0]
        self.assertEqual('wheel/odom', topic)
        self.assertTrue(kwargs['raw'])
        events = kwargs['event_callbacks']
        self.assertIsInstance(events, sys.modules['rclpy.qos_event'].SubscriptionEventCallbacks)
        self.assertEqual({'use_default_callbacks': False}, events.kwargs)

    def test_explicit_event_callbacks_are_kept(self):
        explicit = object()
        self.node.create_subscription('TFMessage', 'tf', print, 10, event_callbacks=explicit, callback_group=None)
        _, _, kwargs = self.node.subscriptions[0]
        self.assertIs(explicit, kwargs['event_callbacks'])
        self.assertIn('callback_group', kwargs)


class ReadinessOdometryTest(unittest.TestCase):
    def test_odometry_is_subscribed_raw_because_only_its_arrival_time_is_used(self):
        patcher = mock.patch.dict(sys.modules)
        patcher.start()
        self.addCleanup(patcher.stop)
        readiness_ros = import_with_stubs('fleet_bridge.readiness_ros')
        from fleet_bridge.readiness import ReadinessLimits

        node = FakeNode()
        monitor = readiness_ros.ReadinessMonitor(node, ReadinessLimits(), readiness_ros.ReadinessSources())
        odometry = [kwargs for _, topic, kwargs in node.subscriptions if topic == 'wheel/odom']
        self.assertEqual([{'raw': True}], odometry)
        monitor._on_odom(b'serialized')
        self.assertIsNotNone(monitor._odom_time)


if __name__ == '__main__':
    unittest.main()
