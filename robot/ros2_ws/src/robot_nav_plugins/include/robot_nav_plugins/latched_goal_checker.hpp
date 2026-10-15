// Copyright 2026 Smart Campus Tour
// Licensed under the Apache License, Version 2.0

#ifndef ROBOT_NAV_PLUGINS__LATCHED_GOAL_CHECKER_HPP_
#define ROBOT_NAV_PLUGINS__LATCHED_GOAL_CHECKER_HPP_

#include <memory>
#include <string>
#include <vector>

#include "geometry_msgs/msg/point.hpp"
#include "geometry_msgs/msg/pose.hpp"
#include "nav2_controller/plugins/simple_goal_checker.hpp"

namespace robot_nav_plugins
{

/**
 * SimpleGoalChecker (stateful) with two changes, both off by default:
 *
 * 1. Humble's controller_server calls GoalChecker::reset() on EVERY path
 *    update, so with the BT replanning at 1 Hz the stateful xy latch is lost
 *    every second while the robot turns in place at the goal. With
 *    relatch_distance > 0, a reset keeps the latch when the robot-to-goal
 *    vector moved by at most relatch_distance (the path still ends at the
 *    latched goal) and the robot is still within latched_xy_tolerance of it.
 *    A goal elsewhere always clears it.
 *
 * 2. RegulatedPurePursuit takes its "rotate to goal heading" radius from
 *    getTolerances(). Once latched, report latched_xy_tolerance instead of
 *    xy_goal_tolerance, so a few cm of localisation correction during the
 *    final turn cannot push the robot out of the rotate mode and make it
 *    turn back towards the path end.
 *
 * Acceptance itself is unchanged: xy within xy_goal_tolerance once, then yaw
 * within yaw_goal_tolerance. If the robot is ever more than
 * latched_xy_tolerance from the goal while latched, the latch is released.
 */
class LatchedGoalChecker : public nav2_controller::SimpleGoalChecker
{
public:
  LatchedGoalChecker() = default;

  void initialize(
    const rclcpp_lifecycle::LifecycleNode::WeakPtr & parent,
    const std::string & plugin_name,
    const std::shared_ptr<nav2_costmap_2d::Costmap2DROS> costmap_ros) override;
  void reset() override;
  bool isGoalReached(
    const geometry_msgs::msg::Pose & query_pose, const geometry_msgs::msg::Pose & goal_pose,
    const geometry_msgs::msg::Twist & velocity) override;
  bool getTolerances(
    geometry_msgs::msg::Pose & pose_tolerance,
    geometry_msgs::msg::Twist & vel_tolerance) override;

  bool latched() const {return !check_xy_;}
  double latchedXyTolerance() const;

protected:
  rcl_interfaces::msg::SetParametersResult
  latchParametersCallback(std::vector<rclcpp::Parameter> parameters);
  void release(const char * why);

  double latched_xy_tolerance_{0.0};
  double relatch_distance_{0.0};
  bool reset_pending_{false};
  bool have_latched_goal_{false};
  geometry_msgs::msg::Point latched_offset_;  // goal - robot when last latched
  rclcpp::Logger logger_{rclcpp::get_logger("LatchedGoalChecker")};
  rclcpp::node_interfaces::OnSetParametersCallbackHandle::SharedPtr latch_params_handler_;
};

}  // namespace robot_nav_plugins

#endif  // ROBOT_NAV_PLUGINS__LATCHED_GOAL_CHECKER_HPP_
