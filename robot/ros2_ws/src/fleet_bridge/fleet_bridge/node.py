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
        # ADR-0049 T_link and permit period; used only when commands_enabled is true.
        self.declare_parameter('motion_permit_link_timeout_sec', 1.5)
        self.declare_parameter('motion_permit_period_sec', 0.2)
        # ADR-0049 readiness; used only when commands_enabled is true. Limits are to be measured at GATE A.
        self.declare_parameter('readiness_odometry_topic', 'wheel/odom')
        self.declare_parameter('map_package_path', '')
        self.declare_parameter('map_package_sha256', '')
        self.declare_parameter('map_server_name', 'map_server')
        self.declare_parameter('localized_max_tf_age_sec', 1.0)
        self.declare_parameter('localized_max_xy_variance', 0.09)
        self.declare_parameter('localized_max_yaw_variance', 0.05)
        self.declare_parameter('motion_ready_max_odom_age_sec', 0.5)
        # ADR-0045 Operator head buttons; off by default, independent of commands_enabled.
        self.declare_parameter('head_enabled', False)
        self.declare_parameter('head_base_url', '')
        self.declare_parameter('head_wait_ms', 1500)
        # Mini PC diagnostics report (POST /api/fleet/v1/diagnostics): observation only, own HTTPS thread.
        self.declare_parameter('diagnostics_enabled', True)
        self.declare_parameter('diagnostics_url', '')
        self.declare_parameter('diagnostics_period_sec', 10.0)
        self.declare_parameter('diagnostics_disk_path', '/')
        self.declare_parameter('diagnostics_stale_after_sec', 3.0)
        self.declare_parameter('diagnostics_lidar_topic', 'scan')
        self.declare_parameter('diagnostics_odometry_topic', 'wheel/odom')
        self.declare_parameter('diagnostics_imu_topic', 'imu/data')
        self.declare_parameter('diagnostics_depth_topic', 'camera/depth/points')

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
            raise RuntimeError('report_period_sec must be below the backend telemetry limit (2 s) '
                               'when commands_enabled is true; the fleet command profile uses 0.5.')

        self._readiness = None
        if commands_enabled:
            self._readiness = self._create_readiness_monitor()

        def create_navigator():
            from .nav2 import Nav2Navigator  # Nav2 types are needed only on this path.
            return Nav2Navigator(self, on_goal_id=self._readiness.goals.mark_own,
                                 prepare=self._create_gate_reset().prepare)

        def goto_guard():
            return self._readiness.view().goto_refusal

        def create_transport():
            base = str(self.get_parameter('command_base_url').value).strip() or commands_url_from_sync_url(backend_url)
            return FleetCommandsHttpClient(base, robot_code, credential, request_timeout_sec)

        link_timeout_sec = float(self.get_parameter('motion_permit_link_timeout_sec').value)
        permit_period_sec = float(self.get_parameter('motion_permit_period_sec').value)
        if commands_enabled and min(link_timeout_sec, permit_period_sec) <= 0:
            raise RuntimeError('Motion permit timing parameters must be positive.')
        path = create_command_path(
            commands_enabled, create_navigator, create_transport,
            CommandWorkerConfig(float(self.get_parameter('command_poll_period_sec').value), retry_max_sec,
                                link_timeout_sec),
            map_key, frame_id, lambda: report_state.stream_id, self.get_logger().warning, goto_guard)
        if path is not None:
            self._commands, self._command_worker = path
            # Imported only here: the telemetry-only bridge publishes nothing.
            from .motion_permit import MotionPermit
            from .motion_permit_ros import MotionPermitPublisher
            commands, command_worker = path
            self._readiness.attach_navigator(commands.navigator)
            self._motion_permit_publisher = MotionPermitPublisher(
                self,
                MotionPermit(link_timeout_sec, lambda: command_worker.last_poll_success, commands.has_active_leg,
                             lambda: commands.interrupt_leg('LOCAL_LINK_LOSS'),
                             allowed=lambda: self._readiness.view().permit_allowed),
                permit_period_sec)

        self._head_worker = None
        if bool(self.get_parameter('head_enabled').value):
            # Imported only here: the telemetry-only bridge needs no bus_interfaces.
            from .head_ros import create_ros_head
            from .head_worker import FleetHeadHttpClient, FleetHeadWorker, HeadWorkerConfig, head_url_from_sync_url
            head_base = str(self.get_parameter('head_base_url').value).strip() or head_url_from_sync_url(backend_url)
            wait_ms = int(self.get_parameter('head_wait_ms').value)
            if not 0 <= wait_ms <= 10_000 or request_timeout_sec * 1000 <= wait_ms:
                raise RuntimeError('head_wait_ms must be 0..10000 and below request_timeout_sec.')
            applier, head_state = create_ros_head(self, self.get_logger().warning)
            self._head_worker = FleetHeadWorker(
                HeadWorkerConfig(wait_ms=wait_ms, retry_max_sec=min(retry_max_sec, 10.0)), applier,
                FleetHeadHttpClient(head_base, robot_code, credential, request_timeout_sec),
                head_state.latest, self.get_logger().warning)

        self._diagnostics_worker = None
        if bool(self.get_parameter('diagnostics_enabled').value):
            self._diagnostics_worker = self._create_diagnostics_worker(
                backend_url, robot_code, credential, request_timeout_sec, retry_max_sec)

        self._worker = FleetSyncWorker(
            report_state,
            transport,
            self._snapshot,
            self._on_worker_state,
        )
        self._worker.start()
        if self._command_worker is not None:
            self._command_worker.start()
        if self._head_worker is not None:
            self._head_worker.start()
            self.get_logger().info('Fleet Head enabled: Operator head buttons reach stm32_bridge head/*.')
        else:
            # Off by default: say so, otherwise "the head never sweeps at a POI" looks like a bug.
            self.get_logger().info('Fleet Head disabled (head_enabled: false): Operator head buttons and the '
                                   'automatic POI sweep do not reach this robot.')
        if self._diagnostics_worker is not None:
            self._diagnostics_worker.start()
            self.get_logger().info('Mini PC diagnostics report enabled.')
        self.get_logger().info(
            'Fleet Bridge started with commands enabled; do not run another goal sender on this robot.'
            if self._command_worker is not None else
            'Fleet Bridge started in telemetry-only mode; HTTPS runs on a background thread.')

    def _create_readiness_monitor(self):
        # Imported only here: the telemetry-only bridge keeps reporting null readiness.
        from .readiness import ReadinessLimits
        from .readiness_ros import ReadinessMonitor, ReadinessSources

        limits = ReadinessLimits(
            tf_max_age_sec=float(self.get_parameter('localized_max_tf_age_sec').value),
            max_xy_variance=float(self.get_parameter('localized_max_xy_variance').value),
            max_yaw_variance=float(self.get_parameter('localized_max_yaw_variance').value),
            odom_max_age_sec=float(self.get_parameter('motion_ready_max_odom_age_sec').value),
        )
        sources = ReadinessSources(
            odometry_topic=str(self.get_parameter('readiness_odometry_topic').value).strip(),
            map_package_path=str(self.get_parameter('map_package_path').value).strip(),
            map_package_sha256=str(self.get_parameter('map_package_sha256').value).strip(),
            map_server_name=str(self.get_parameter('map_server_name').value).strip(),
        )
        return ReadinessMonitor(self, limits, sources)

    def _create_gate_reset(self):
        """A new leg clears a BOOT or PERMIT_LOST latch through mode_manager's own reset (ADR-0049 addendum)."""
        from std_srvs.srv import Trigger  # Imported only on the command path.

        from .motion_gate_reset import MotionGateReset

        def one_shot(period_sec, callback):
            timer = None

            def fire():
                self.destroy_timer(timer)
                callback()
            timer = self.create_timer(period_sec, fire)
            return _TimerHandle(lambda: self.destroy_timer(timer))

        return MotionGateReset(self.create_client(Trigger, 'motion_inhibit_reset'), Trigger.Request, one_shot,
                               lambda: self._readiness.view().latch_resettable, on_log=self.get_logger().warning)

    def _create_diagnostics_worker(self, backend_url, robot_code, credential, request_timeout_sec,
                                   retry_max_sec):
        # Imported only here: the ROS message packages are needed only on this path.
        from .diagnostics import (
            DiagnosticsWorkerConfig,
            FleetDiagnosticsHttpClient,
            FleetDiagnosticsWorker,
            MiniPcCollector,
            build_diagnostics_report,
            diagnostics_url_from_sync_url,
        )
        from .diagnostics_ros import RosSensorObserver, SensorLimits, SensorTopics

        period = float(self.get_parameter('diagnostics_period_sec').value)
        stale_after = float(self.get_parameter('diagnostics_stale_after_sec').value)
        # The backend treats a report older than 60 s as stale; stay well inside that.
        if not 1.0 <= period <= 30.0 or stale_after <= 0:
            raise RuntimeError('diagnostics_period_sec must be 1..30 and diagnostics_stale_after_sec positive.')
        url = str(self.get_parameter('diagnostics_url').value).strip() or diagnostics_url_from_sync_url(backend_url)
        topics = SensorTopics(
            lidar=str(self.get_parameter('diagnostics_lidar_topic').value).strip(),
            odometry=str(self.get_parameter('diagnostics_odometry_topic').value).strip(),
            imu=str(self.get_parameter('diagnostics_imu_topic').value).strip(),
            depth_camera=str(self.get_parameter('diagnostics_depth_topic').value).strip(),
        )
        observer = RosSensorObserver(self, topics, SensorLimits(stale_after_sec=stale_after))
        collector = MiniPcCollector(str(self.get_parameter('diagnostics_disk_path').value).strip() or '/')

        def report() -> dict:
            with self._observation_lock:
                tf_valid = None if self._pose_reason == 'tf_not_sampled' else not self._pose_stale
            # Node liveness and Nav2 state are not observed here: graph introspection is unreliable under
            # the Fast DDS Discovery Server, so the report lists no nodes rather than guessing.
            ros2 = {'middlewareStatus': 'OK', 'nodes': [], 'tfValid': tf_valid, 'nav2State': 'UNKNOWN'}
            return build_diagnostics_report(robot_code, datetime.now(timezone.utc), collector.collect(), ros2,
                                            observer.sensors())

        return FleetDiagnosticsWorker(
            DiagnosticsWorkerConfig(report_period_sec=period, retry_max_sec=max(period, min(retry_max_sec, 60.0))),
            FleetDiagnosticsHttpClient(url, robot_code, credential, request_timeout_sec),
            report, self.get_logger().warning)

    def destroy_node(self):
        diagnostics_worker = getattr(self, '_diagnostics_worker', None)
        if diagnostics_worker is not None:
            diagnostics_worker.stop(join_timeout_sec=self._request_timeout_sec + 1.0)
        head_worker = getattr(self, '_head_worker', None)
        if head_worker is not None:
            head_worker.stop(join_timeout_sec=self._request_timeout_sec + 1.0)
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
            if self._readiness is not None:
                self._readiness.note_tf_stamp(transform.header.stamp)
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
        snapshot = {'pose': pose, **self._commands.snapshot()}
        readiness = self._readiness.view()
        # A goal nobody here owns may be moving the robot, so this bridge cannot claim to be idle.
        if snapshot['status'] == 'IDLE' and readiness.unowned_goal is not None:
            snapshot['status'] = 'UNKNOWN'
        snapshot.update(localized=readiness.localized, motion_ready=readiness.motion_ready,
                        fault_code=readiness.fault_code)
        return snapshot

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


class _TimerHandle:
    def __init__(self, cancel):
        self.cancel = cancel


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
