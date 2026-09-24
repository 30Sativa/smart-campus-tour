import json
import queue
import threading
import time
import uuid
from urllib.request import Request, urlopen
from urllib.error import URLError

from gazebo_msgs.msg import ModelStates
import rclpy
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from gazebo_preview_bridge.telemetry import pose_payload


class GazeboTelemetry(Node):
    def __init__(self):
        super().__init__('gazebo_telemetry')
        for name in ('endpoint', 'model_name', 'robot_id', 'world_id', 'model_states_topic'):
            self.declare_parameter(name, '')
        self.declare_parameter('rate_hz', 10.0)
        self.declare_parameter('http_timeout', 1.0)
        self.endpoint = self.get_parameter('endpoint').value
        self.model_name = self.get_parameter('model_name').value
        self.robot_id = self.get_parameter('robot_id').value
        self.world_id = self.get_parameter('world_id').value
        rate = float(self.get_parameter('rate_hz').value)
        self.timeout = float(self.get_parameter('http_timeout').value)
        if not self.endpoint or not 0 < rate <= 10 or not 0 < self.timeout <= 5:
            raise ValueError('Load gazebo_telemetry.yaml; rate must be (0,10], timeout (0,5]')
        self.period = 1 / rate
        self.stream_id = str(uuid.uuid4())
        self.seq = 0
        self.last_sample = -self.period
        self.pending = queue.Queue(maxsize=1)
        self.stopping = threading.Event()
        self.subscription = self.create_subscription(
            ModelStates, self.get_parameter('model_states_topic').value,
            self.on_states, qos_profile_sensor_data)
        self.worker = threading.Thread(target=self.send_loop, daemon=True)
        self.worker.start()

    def on_states(self, message):
        now = time.monotonic()
        if now - self.last_sample < self.period:
            return
        try:
            index = message.name.index(self.model_name)
            self.seq += 1
            payload = pose_payload(message.pose[index], self.robot_id,
                                   self.world_id, self.stream_id, self.seq)
        except (ValueError, IndexError):
            return
        self.last_sample = now
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
            request = Request(self.endpoint, data=json.dumps(payload).encode(),
                              headers={'Content-Type': 'application/json'}, method='POST')
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    response.read()
            except (URLError, OSError, TimeoutError):
                if time.monotonic() - last_warning >= 5:
                    self.get_logger().warning('Preview backend unavailable; dropping old poses.')
                    last_warning = time.monotonic()

    def destroy_node(self):
        self.stopping.set()
        self.worker.join(timeout=self.timeout + 0.5)
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = GazeboTelemetry()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()
