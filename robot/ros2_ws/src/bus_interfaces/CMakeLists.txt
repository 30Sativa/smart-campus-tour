cmake_minimum_required(VERSION 3.8)
project(bus_interfaces)

find_package(ament_cmake REQUIRED)
find_package(action_msgs REQUIRED)
find_package(std_msgs REQUIRED)
find_package(rosidl_default_generators REQUIRED)

rosidl_generate_interfaces(${PROJECT_NAME}
  "msg/BusStatus.msg"
  "msg/HeadState.msg"
  "msg/HeadJog.msg"
  "msg/HeadStep.msg"
  "action/GoToStop.action"
  "action/SetHead.action"
  "srv/HeadSweep.srv"
  DEPENDENCIES action_msgs std_msgs
)

ament_export_dependencies(rosidl_default_runtime)
ament_package()
