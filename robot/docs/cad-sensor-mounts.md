# CAD camera and sonar mounts

User measurements confirmed on 2026-09-28. ROS axes: X forward, Y left,
Z up. Keep the existing base_link, whose CAD origin is
(744.854355, 1164.497711, 1638.492310) mm. base_footprint to base_link
has z = 0.2068 m; the offsets below are relative to base_link, not the floor.

For CAD coordinates in cm:

```text
x = Zcad / 100 - 1.638492310
y = Xcad / 100 - 0.744854355
z = Ycad / 100 - 1.164497711
```

| Point | CAD XYZ (cm) | ROS XYZ (m) | Existing frame by corner |
|---|---|---|---|
| Point1 | 74.53, 123.09, 203.28 | 0.394307690, 0.000445645, 0.066402289 | Camera face reference only |
| Point2 | 101.32, 117.40, 202.70 | 0.388507690, 0.268345645, 0.009502289 | sonar1_link, front-left |
| Point3 | 47.65, 117.43, 202.69 | 0.388407690, -0.268354355, 0.009802289 | sonar2_link, front-right |
| Point4 | 47.65, 117.40, 125.00 | -0.388492310, -0.268354355, 0.009502289 | sonar4_link, rear-right |
| Point5 | 101.33, 117.43, 125.00 | -0.388492310, 0.268445645, 0.009802289 | sonar3_link, rear-left |

Extra decimal places preserve the conversion, not measurement accuracy.

## Sonar

All four sonar axes point 4 degrees below horizontal. For local +X along the
outgoing acoustic axis, positive pitch is downward: 0.06981317007977318 rad.
The URDF uses roll = 0 as the existing axis convention and retains the
provisional yaw values +45, -45, +135, -135 degrees for sonar1 through sonar4.
The outgoing vector is (cos(yaw)*cos(pitch), sin(yaw)*cos(pitch), -sin(pitch)),
so all four beams point down regardless of yaw.

The Point-to-frame association follows the existing corner convention, NOT
verified electrical wiring. Confirm actual SONAR1-4 channels and horizontal
angles before using the readings for navigation. Sonar remains disabled in
robot/ros2_ws/src/robot_control/config/nav2_params.yaml.

## Camera

The user confirmed the camera faces forward without tilt or roll. A body frame
with axes aligned with the robot therefore has rpy = 0 0 0. Point1 is marked
near the centre of the camera face, not at a specific optical sensor centre.
It is not yet a verified driver camera_link origin. Keep camera mount launch
defaults unchanged until that offset is established; do not publish another
camera_link or duplicate the optical transforms supplied by the camera driver.
The existing camera assembly mesh remains in its CAD position.

## Verification on ROS / hardware

After building and sourcing robot_description, run:

```bash
ros2 launch robot_description display.launch.py
ros2 run tf2_ros tf2_echo base_link sonar1_link
```

Repeat tf2_echo for sonar2_link, sonar3_link and sonar4_link. In RViz enable TF:
the red +X axes should leave their respective corners diagonally and tilt
down 4 degrees. Confirm heights against the actual chassis, then match each
live Range topic to the physical sensor/channel. Watch for swapped rear
channels, wrong yaw, and beams tilted up. CAD geometry and automated tests
do not establish correct wiring, ground reflections or obstacle detection.
