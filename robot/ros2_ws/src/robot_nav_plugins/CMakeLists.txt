cmake_minimum_required(VERSION 3.8)
project(robot_nav_plugins)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(ament_cmake REQUIRED)
find_package(angles REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(nav2_controller REQUIRED)
find_package(nav2_core REQUIRED)
find_package(nav2_costmap_2d REQUIRED)
find_package(nav2_util REQUIRED)
find_package(pluginlib REQUIRED)
find_package(rclcpp REQUIRED)
find_package(rclcpp_lifecycle REQUIRED)

set(dependencies
  angles geometry_msgs nav2_controller nav2_core nav2_costmap_2d nav2_util
  pluginlib rclcpp rclcpp_lifecycle)

add_library(latched_goal_checker SHARED src/latched_goal_checker.cpp)
target_include_directories(latched_goal_checker PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>)
ament_target_dependencies(latched_goal_checker ${dependencies})

pluginlib_export_plugin_description_file(nav2_core plugins.xml)

install(TARGETS latched_goal_checker
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin)
install(DIRECTORY include/ DESTINATION include/)

if(BUILD_TESTING)
  find_package(ament_cmake_gtest REQUIRED)
  ament_add_gtest(test_latched_goal_checker test/test_latched_goal_checker.cpp)
  target_link_libraries(test_latched_goal_checker latched_goal_checker)
  ament_target_dependencies(test_latched_goal_checker ${dependencies})
endif()

ament_export_include_directories(include)
ament_export_libraries(latched_goal_checker)
ament_export_dependencies(${dependencies})
ament_package()
