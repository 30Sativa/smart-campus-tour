"""RPLiDAR A3M1 driver and robot-body range filter: the one LiDAR chain of the real robot.

    rplidar_node -> <robot_id>/scan_raw -> scan_range_filter -> <robot_id>/scan

SLAM, AMCL and both costmaps read /scan; /scan_raw keeps the unfiltered returns. Included
by manual_mapping, auto_explore and navigation (robot_navigation). The filter drops every
point closer than lower_threshold in scan_range_filter.yaml (the vehicle body), replacing
it with NaN so a rejected close return never clears obstacles behind it.
Needs ros-humble-rplidar-ros and ros-humble-laser-filters.
"""
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    robot_id = LaunchConfiguration('robot_id')
    scan_filter_params = PathJoinSubstitution([
        FindPackageShare('robot_control'), 'config', 'scan_range_filter.yaml',
    ])
    return LaunchDescription([
        DeclareLaunchArgument('robot_id', default_value='',
                              description='ROS namespace for this robot.'),
        DeclareLaunchArgument('lidar_serial_port', default_value='/dev/ttyUSB0',
                              description='RPLiDAR serial port.'),
        DeclareLaunchArgument('lidar_serial_baudrate', default_value='256000',
                              description='RPLiDAR A3M1 serial baudrate.'),
        DeclareLaunchArgument('lidar_frame', default_value='lidar_link',
                              description='LaserScan frame_id.'),
        DeclareLaunchArgument('scan_mode', default_value='Sensitivity',
                              description='RPLiDAR scan mode (A3: Sensitivity/Boost).'),
        Node(
            package='rplidar_ros',
            executable='rplidar_node',
            name='rplidar_node',
            namespace=robot_id,
            output='screen',
            parameters=[{
                'channel_type': 'serial',
                'serial_port': LaunchConfiguration('lidar_serial_port'),
                'serial_baudrate': ParameterValue(
                    LaunchConfiguration('lidar_serial_baudrate'), value_type=int),
                'frame_id': LaunchConfiguration('lidar_frame'),
                'inverted': False,
                'angle_compensate': True,
                'scan_mode': LaunchConfiguration('scan_mode'),
            }],
            remappings=[('scan', 'scan_raw')],
        ),
        Node(
            package='laser_filters',
            executable='scan_to_scan_filter_chain',
            name='scan_range_filter',
            namespace=robot_id,
            output='screen',
            parameters=[scan_filter_params],
            remappings=[
                ('scan', 'scan_raw'),
                ('scan_filtered', 'scan'),
            ],
        ),
    ])
