"""ROS 2 Fleet Bridge: telemetry observer, plus an opt-in Nav2 command path; it never publishes velocity."""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone

import rclpy
from rclpy.duration import Duration
from rclpy.executors import SingleThreadedExecutor
from rclpy.node import Node
from tf2_ros import (
    Buffer,
    ConnectivityException,
    ExtrapolationException,
    LookupException,
    TransformListener,
)

from .command_worker import CommandWorkerConfig, create_command_path
from .credentials import read_credential
from .http_client import FleetCommandsHttpClient, FleetSyncHttpClient, commands_url_from_sync_url
from .lifecycle import spin_until_worker_fatal
from .protocol import pose_from_transform
from .worker import FleetSyncWorker, ReportState, WorkerConfig


class FleetBridgeNode(Node):
    def __init__(self):
        super().__init__('fleet_bridge')
        self.declare_parameter('backend_url', '')
        self.declare_parameter('robot_code', '')
        self.declare_parameter('map_key', '')
        self.declare_parameter('frame_id', 'map')
        self.declare_parameter('map_frame', 'map')
        self.declare_parameter('base_frame', 'base_footprint')
        self.declare_parameter('sample_period_sec', 0.2)
        self.declare_parameter('pose_stale_after_sec', 5.0)
        self.declare_parameter('report_period_sec', 2.0)
        self.declare_parameter('request_timeout_sec', 5.0)
        self.declare_parameter('max_report_age_sec', 30.0)
        self.declare_parameter('max_clock_floor_ahead_sec', 10.0)
        self.declare_parameter('retry_initial_sec', 1.0)
        self.declare_parameter('retry_max_sec', 30.0)
        self.declare_parameter('commands_enabled', False)
        self.declare_parameter('command_base_url', '')
        self.declare_parameter('command_poll_period_sec', 0.5)

        backend_url = str(self.get_parameter('backend_url').value).strip()
        robot_code = str(self.get_parameter('robot_code').value).strip()
        map_key = str(self.get_parameter('map_key').value).strip()
        frame_id = str(self.get_parameter('frame_id').value).strip()
        credential_path = os.environ.get('FLEET_ROBOT_CREDENTIAL_FILE', '').strip()
        if not backend_url or not robot_code or not map_key or not credential_path:
            raise RuntimeError(
                'Configure FLEET_SYNC_URL, FLEET_ROBOT_CODE, FLEET_ROBOT_MAP_KEY, '
                'and FLEET_ROBOT_CREDENTIAL_FILE before launch.')
        if not frame_id:
            raise RuntimeError('Fleet Sync frame_id must be configured.')
        if self.get_clock().ros_time_is_active:
            raise RuntimeError('Fleet Bridge requires system time; use_sim_time must be false.')

        self._map_frame = str(self.get_parameter('map_frame').value)
        self._base_frame = str(self.get_parameter('base_frame').value)
        if self._map_frame != frame_id:
            raise RuntimeError('Fleet Sync frame_id must match the configured TF map_frame.')
        self._pose_stale_after_sec = float(self.get_parameter('pose_stale_after_sec').value)
        sample_period_sec = float(self.get_parameter('sample_period_sec').value)
        report_period_sec = float(self.get_parameter('report_period_sec').value)
        request_timeout_sec = float(self.get_parameter('request_timeout_sec').value)
        self._request_timeout_sec = request_timeout_sec
        max_report_age_sec = float(self.get_parameter('max_report_age_sec').value)
        max_clock_floor_ahead_sec = float(
            self.get_parameter('max_clock_floor_ahead_sec').value)
        retry_initial_sec = float(self.get_parameter('retry_initial_sec').value)
        retry_max_sec = float(self.get_parameter('retry_max_sec').value)
        if min(self._pose_stale_after_sec, sample_period_sec, report_period_sec, request_timeout_sec,
               max_report_age_sec, max_clock_floor_ahead_sec, retry_initial_sec, retry_max_sec) <= 0:
            raise RuntimeError('Fleet Bridge timing parameters must be positive.')

        credential = read_credential(credential_path)
        transport = FleetSyncHttpClient(backend_url, robot_code, credential, request_timeout_sec)
        config = WorkerConfig(
            robot_code=robot_code,
            map_key=map_key,
            frame_id=frame_id,
            report_period_sec=report_period_sec,
            max_report_age_sec=max_report_age_sec,
            max_clock_floor_ahead_sec=max_clock_floor_ahead_sec,
            retry_initial_sec=retry_initial_sec,
            retry_max_sec=retry_max_sec,
        )

        self._observation_lock = threading.Lock()
        self._pose = None
        self._pose_age_sec = None
        self._pose_stale = True
        self._pose_reason = 'tf_not_sampled'
        self._last_logged_pose_reason = None

        self._tf_buffer = Buffer()
        self._tf_listener = TransformListener(self._tf_buffer, self, spin_thread=False)
        self._sample_timer = self.create_timer(sample_period_sec, self._sample_tf)

        report_state = ReportState(config)
        self._commands = None
        self._command_worker = None
        commands_enabled = bool(self.get_parameter('commands_enabled').value)
        if commands_enabled and report_period_sec >= 2.0:
            self.get_logger().warning(
                'report_period_sec is not below the backend telemetry limit (2 s); polls will be refused.')

        def create_navigator():
            from .nav2 import Nav2Navigator  # Nav2 types are needed only on this path.
            return Nav2Navigator(self)

        def create_transport():
            base = str(self.get_parameter('command_base_url').value).strip() or commands_url_from_sync_url(backend_url)
            return FleetCommandsHttpClient(base, robot_code, credential, request_timeout_sec)

        path = create_command_path(
            commands_enabled, create_navigator, create_transport,
            CommandWorkerConfig(float(self.get_parameter('command_poll_period_sec').value), retry_max_sec),
            map_key, frame_id, lambda: report_state.stream_id, self.get_logger().warning)
        if path is not None:
            self._commands, self._command_worker = path

        self._worker = FleetSyncWorker(
            report_state,
            transport,
            self._snapshot,
            self._on_worker_state,
        )
        self._worker.start()
        if self._command_worker is not None:
            self._command_worker.start()
        self.get_logger().info(
            'Fleet Bridge started with commands enabled; do not run another goal sender on this robot.'
            if self._command_worker is not None else
            'Fleet Bridge started in telemetry-only mode; HTTPS runs on a background thread.')

    def destroy_node(self):
        command_worker = getattr(self, '_command_worker', None)
        if command_worker is not None:
            command_worker.stop(join_timeout_sec=self._request_timeout_sec + 1.0)
        worker = getattr(self, '_worker', None)
        if worker is not None:
            worker.stop(join_timeout_sec=self._request_timeout_sec + 1.0)
        return super().destroy_node()

    def _sample_tf(self):
        try:
            transform = self._tf_buffer.lookup_transform(
                self._map_frame,
                self._base_frame,
                rclpy.time.Time(),
                timeout=Duration(seconds=0.0),
            )
            observation = pose_from_transform(
                transform,
                datetime.now(timezone.utc),
                self._map_frame,
                self._base_frame,
                self._pose_stale_after_sec,
            )
        except (LookupException, ConnectivityException, ExtrapolationException):
            observation = pose_from_transform(
                None,
                datetime.now(timezone.utc),
                self._map_frame,
                self._base_frame,
                self._pose_stale_after_sec,
            )
        with self._observation_lock:
            self._pose = observation.pose
            self._pose_age_sec = observation.age_sec
            self._pose_stale = observation.stale
            self._pose_reason = observation.reason
        if observation.reason != self._last_logged_pose_reason:
            if observation.stale:
                age = '' if observation.age_sec is None else f' age={observation.age_sec:.2f}s'
                self.get_logger().warning(f'Fleet pose is unavailable or stale ({observation.reason}{age}).')
            else:
                self.get_logger().info('Fleet pose TF is fresh.')
            self._last_logged_pose_reason = observation.reason

    def _snapshot(self) -> dict[str, object]:
        with self._observation_lock:
            pose = dict(self._pose) if self._pose is not None else None
        # Without the command path there is no authoritative execution-state source or backend legId.
        if self._commands is None:
            return {'pose': pose, 'status': 'UNKNOWN'}
        return {'pose': pose, **self._commands.snapshot()}

    def _on_worker_state(self, state: str, reason: str):
        if state == 'connected':
            self.get_logger().info(f'Fleet Sync acknowledged ({reason}).')
        elif state == 'retrying':
            self.get_logger().warning(
                f'Fleet Sync retry/recovery scheduled ({reason}); one-report buffer only.')
        elif state == 'waiting':
            self.get_logger().warning(
                f'Fleet Sync paused until the system clock catches up ({reason}).')
        else:
            self.get_logger().error(f'Fleet Sync stopped ({reason}); operator review is required.')


def main(args=None):
    rclpy.init(args=args)
    node = None
    executor = None
    exit_code = 0
    try:
        node = FleetBridgeNode()
        executor = SingleThreadedExecutor()
        executor.add_node(node)
        exit_code = spin_until_worker_fatal(
            executor,
            node._worker.fatal_event,
            rclpy.ok,
        )
    except KeyboardInterrupt:
        pass
    except (RuntimeError, ValueError) as error:
        print(f'[fleet_bridge] configuration error: {error}')
        exit_code = 2
    finally:
        if executor is not None and node is not None:
            executor.remove_node(node)
        if node is not None:
            node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()
    return exit_code
