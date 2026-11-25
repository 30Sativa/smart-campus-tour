"""sonar_memory: the two inputs the sonar collision_monitor cannot make itself.

1. ``sonar_guard/memory`` (PointCloud2, odom frame, ~10 Hz): when a sonar loses a
   near echo (the object went into its 0.20 m blind zone, which the firmware reports as
   "no echo"), the arc of that last echo, held where it was until there is evidence it
   is gone (sonar_memory_core.py). Without it the robot drives on into the object.
2. ``sonar_guard/footprint`` (PolygonStamped, base frame, 1 Hz): the Nav2 costmap
   footprint grown by ``padding``. Humble's "approach" polygon reads the robot shape
   only from a topic and has no padding, so without this the robot creeps until it
   touches the nearest sonar point.

Poses come from the EKF ``odom`` topic (30 Hz) and the sonar mounts from /tf_static,
not from a TF listener: a Python listener decoding all of /tf cost ~20 % of a J5005
core offline. It never commands motion and is not on the velocity path: if it dies,
collision_monitor still has the four live Range sources and drops the stale memory
after source_timeout. robot/docs/sonar-perception.md.
"""

import collections
import math

import rclpy
from geometry_msgs.msg import Point32, PolygonStamped
from nav_msgs.msg import Odometry
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy, qos_profile_sensor_data
from sensor_msgs.msg import Range
from sensor_msgs_py import point_cloud2
from std_msgs.msg import Header
from tf2_msgs.msg import TFMessage

from robot_navigation.sonar_memory_core import (
    MemoryConfig, SonarMemory, compose, half_extents, mount_in_base, pad_footprint,
    parse_footprint, pose_at)


def _yaw(q):
    return math.atan2(2.0 * (q.w * q.z + q.x * q.y), 1.0 - 2.0 * (q.y * q.y + q.z * q.z))


class SonarMemoryNode(Node):

    def __init__(self):
        super().__init__('sonar_memory')
        p = self.declare_parameter
        footprint = parse_footprint(p('footprint', '').value)
        padding = float(p('padding', 0.05).value)
        if padding < 0.0:
            raise ValueError('padding must be >= 0')
        self.odom_frame = p('odom_frame', 'odom').value
        self.base_frame = p('base_frame', 'base_footprint').value
        topics = list(p('topics', [f'ultrasonic/sonar{i}/range' for i in range(1, 5)]).value)
        hl, hw = half_extents(footprint)
        defaults = MemoryConfig()
        self.memory = SonarMemory(MemoryConfig(
            hold_trigger=float(p('hold_trigger', defaults.hold_trigger).value),
            blind_clear_range=float(p('blind_clear_range', defaults.blind_clear_range).value),
            forget_radius=float(p('forget_radius', defaults.forget_radius).value),
            max_age=float(p('max_age', defaults.max_age).value),
            half_length=hl, half_width=hw))
        self.point_z = float(p('point_z', 0.10).value)

        self.static = {}      # child frame -> (parent, (x, y, yaw)) from /tf_static
        self.mounts = {}      # sonar frame -> (x, y, yaw) in base_frame
        self.odom = collections.deque(maxlen=90)   # ~3 s of the 30 Hz EKF
        latched = QoSProfile(depth=100, durability=DurabilityPolicy.TRANSIENT_LOCAL,
                             reliability=ReliabilityPolicy.RELIABLE)
        self.create_subscription(TFMessage, '/tf_static', self._on_static, latched)
        self.create_subscription(Odometry, p('odom_topic', 'odom').value, self._on_odom, 10)
        for topic in topics:
            self.create_subscription(Range, topic, self._on_range(topic), qos_profile_sensor_data)

        self.cloud_pub = self.create_publisher(point_cloud2.PointCloud2, 'sonar_guard/memory', 1)
        self.footprint_pub = self.create_publisher(PolygonStamped, 'sonar_guard/footprint', 1)
        self.footprint = PolygonStamped()
        # Stamp 0 and the base frame: the polygon never moves relative to the robot, so the
        # monitor's FootprintSubscriber looks up base -> base "latest" and needs no history.
        self.footprint.header.frame_id = self.base_frame
        self.footprint.polygon.points = [
            Point32(x=x, y=y, z=0.0) for x, y in pad_footprint(footprint, padding)]
        self.create_timer(1.0 / float(p('publish_rate', 10.0).value), self._publish_memory)
        self.create_timer(1.0, lambda: self.footprint_pub.publish(self.footprint))
        self.footprint_pub.publish(self.footprint)
        self._last_held = []
        self.get_logger().info(
            f'sonar memory on {topics}; footprint padded by {padding:.3f} m: '
            + ', '.join(f'({pt.x:.3f}, {pt.y:.3f})' for pt in self.footprint.polygon.points))

    def _on_static(self, msg):
        for t in msg.transforms:
            tr = t.transform
            self.static[t.child_frame_id] = (
                t.header.frame_id, (tr.translation.x, tr.translation.y, _yaw(tr.rotation)))
        self.mounts.clear()

    def _on_odom(self, msg):
        q = msg.pose.pose
        stamp = msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9
        self.odom.append((stamp, q.position.x, q.position.y, _yaw(q.orientation)))

    def _sensor_pose(self, frame, stamp):
        mount = self.mounts.get(frame)
        if mount is None:
            mount = mount_in_base(self.static, frame, self.base_frame)
            if mount is None:
                return None
            self.mounts[frame] = mount
        robot = pose_at(self.odom, stamp)
        return compose(robot, mount) if robot is not None else None

    def _on_range(self, topic):
        def callback(msg):
            now = self.get_clock().now().nanoseconds * 1e-9
            pose = None
            if self.memory.needs_pose(topic, msg.range, msg.min_range):
                # The first frame carrying a new value arrives right after the firmware
                # measured it, so its stamp is the best measurement time there is.
                stamp = msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9
                pose = self._sensor_pose(msg.header.frame_id, stamp)
            event = self.memory.observe(topic, now, msg.range, msg.min_range,
                                        msg.field_of_view, pose)
            if event:
                self.get_logger().info(event)
        return callback

    def _publish_memory(self):
        now = self.get_clock().now()
        robot = self.odom[-1][1:] if self.odom else None
        pts = self.memory.points(now.nanoseconds * 1e-9, robot)
        header = Header(stamp=now.to_msg(), frame_id=self.odom_frame)
        self.cloud_pub.publish(point_cloud2.create_cloud_xyz32(
            header, [(x, y, self.point_z) for x, y in pts]))
        held = self.memory.held_sensors()
        if held != self._last_held:
            self.get_logger().info(f'sonar memory: holding {held}' if held else 'sonar memory: clear')
        self._last_held = held


def main(args=None):
    rclpy.init(args=args)
    node = SonarMemoryNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()
