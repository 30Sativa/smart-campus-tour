"""Send the robot's localized pose (AMCL, ROS `map` frame) to the backend.

    TF map -> base_footprint  --+
                                +--> POST /api/robots/telemetry (<= 5 Hz)
    amcl_pose covariance -------+

The browser never talks to the robot: the backend authenticates this node with
the robot's device credential and forwards the latest pose to Staff/Admin
(3D twin) and to Students of the RUNNING Tour (2D map).

- The secret comes from the environment variable named by `secret_env`
  (default ROBOT_TELEMETRY_SECRET); it is never a ROS parameter or a file in git.
- Pose is read from TF, not /odom: odom drifts, map is what POIs use.
- A TF older than `max_tf_age` is not sent: the web marks the robot stale
  instead of showing an old position as current.
- `localized` is false until AMCL publishes a pose whose x/y variance is
  within `max_cov_xy`, or when AMCL has been silent for `amcl_timeout`.
- HTTP runs on its own thread with a one-slot buffer: a slow network drops
  old samples instead of queueing them.
"""
from datetime import datetime, timedelta, timezone
import json
import os
import queue
import threading
import time
import uuid
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from geometry_msgs.msg import PoseWithCovarianceStamped
import rclpy
from rclpy.node import Node
from rclpy.time import Time
from tf2_ros import Buffer, TransformException, TransformListener

from fleet_bridge.telemetry import (localization_quality, map_pose_payload,
                                    robot_authorization, yaw_from_quaternion)


class PoseTelemetry(Node):
    def __init__(self):
        super().__init__('pose_telemetry')
        params = {
            'endpoint': '', 'robot_code': '', 'source': 'physical', 'map_key': '',
            'global_frame': 'map', 'base_frame': 'base_footprint',
            'amcl_topic': 'amcl_pose', 'secret_env': 'ROBOT_TELEMETRY_SECRET',
        }
        for name, default in params.items():
            self.declare_parameter(name, default)
        for name, default in (('rate_hz', 5.0), ('http_timeout', 1.0), ('max_cov_xy', 0.25),
                              ('amcl_timeout', 5.0), ('max_tf_age', 1.0)):
            self.declare_parameter(name, default)

        get = lambda name: self.get_parameter(name).value  # noqa: E731
        self.endpoint, self.robot_code, self.source = get('endpoint'), get('robot_code'), get('source')
        self.map_key, self.global_frame, self.base_frame = get('map_key'), get('global_frame'), get('base_frame')
        rate, self.timeout = float(get('rate_hz')), float(get('http_timeout'))
        self.max_cov_xy, self.amcl_timeout = float(get('max_cov_xy')), float(get('amcl_timeout'))
        self.max_tf_age = float(get('max_tf_age'))
        secret = os.environ.get(get('secret_env'), '')
        if not self.endpoint or not self.robot_code or not self.map_key:
            raise ValueError('Load pose_telemetry.yaml and set endpoint, robot_code and map_key')
        if not 0 < rate <= 10 or not 0 < self.timeout <= 5:
            raise ValueError('rate_hz must be in (0, 10], http_timeout in (0, 5]')
        if not secret:
            raise ValueError(f'Set the robot secret in ${get("secret_env")}')
        self.authorization = robot_authorization(self.robot_code, secret)

        self.stream_id = str(uuid.uuid4())
        self.seq = 0
        self.amcl = (False, None)
        self.amcl_at = -1e9
        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)
        self.create_subscription(PoseWithCovarianceStamped, get('amcl_topic'), self.on_amcl, 10)
        self.pending = queue.Queue(maxsize=1)
        self.stopping = threading.Event()
        self.worker = threading.Thread(target=self.send_loop, daemon=True)
        self.worker.start()
        self.create_timer(1.0 / rate, self.sample)
        self.get_logger().info(
            f'Sending {self.global_frame}->{self.base_frame} of {self.robot_code} '
            f'({self.source}, map {self.map_key}) to {self.endpoint} at {rate:g} Hz')

    def on_amcl(self, message):
        self.amcl = localization_quality(list(message.pose.covariance), self.max_cov_xy)
        self.amcl_at = time.monotonic()

    def sample(self):
        try:
            tf = self.tf_buffer.lookup_transform(self.global_frame, self.base_frame, Time())
        except TransformException:
            return
        now = self.get_clock().now()
        age = (now - Time.from_msg(tf.header.stamp)).nanoseconds / 1e9
        if age > self.max_tf_age or age < -0.5:
            return
        t, q = tf.transform.translation, tf.transform.rotation
        localized, cov_xy = self.amcl
        if time.monotonic() - self.amcl_at > self.amcl_timeout:
            localized = False
        try:
            self.seq += 1
            payload = map_pose_payload(
                self.robot_code, self.source, self.map_key, self.global_frame,
                self.stream_id, self.seq, t.x, t.y, yaw_from_quaternion(q.x, q.y, q.z, q.w),
                localized, cov_xy,
                # Wall clock of the TF sample, so ROS sim time never reaches the backend.
                datetime.now(timezone.utc) - timedelta(seconds=max(age, 0.0)))
        except ValueError as error:
            self.get_logger().warning(f'Skipping pose: {error}', throttle_duration_sec=5.0)
            return
        try:
            self.pending.get_nowait()
        except queue.Empty:
            pass
        self.pending.put_nowait(payload)

    def send_loop(self):
        last_warning = -10.0
        while not self.stopping.is_set():
            try:
                payload = self.pending.get(timeout=0.2)
            except queue.Empty:
                continue
            request = Request(self.endpoint, data=json.dumps(payload).encode(), method='POST',
                              headers={'Content-Type': 'application/json', 'Authorization': self.authorization})
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    response.read()
            except HTTPError as error:
                if time.monotonic() - last_warning >= 5:
                    # 401: wrong secret or robot_code; 409: wrong source or a clock/sequence problem.
                    self.get_logger().error(f'Backend refused pose ({error.code}): {error.read()[:300]!r}')
                    last_warning = time.monotonic()
            except (URLError, OSError, TimeoutError):
                if time.monotonic() - last_warning >= 5:
                    self.get_logger().warning('Backend unavailable; dropping old poses.')
                    last_warning = time.monotonic()

    def destroy_node(self):
        self.stopping.set()
        self.worker.join(timeout=self.timeout + 0.5)
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = PoseTelemetry()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()
