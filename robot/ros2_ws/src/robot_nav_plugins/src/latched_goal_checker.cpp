// Copyright 2026 Smart Campus Tour
// Licensed under the Apache License, Version 2.0

#include "robot_nav_plugins/latched_goal_checker.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <memory>
#include <string>
#include <vector>

#include "nav2_util/node_utils.hpp"
#include "pluginlib/class_list_macros.hpp"

namespace robot_nav_plugins
{

namespace
{
double planarDistance(const geometry_msgs::msg::Pose & a, const geometry_msgs::msg::Pose & b)
{
  return std::hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

// Robot-to-goal vector. The controller passes both poses in the costmap
// frame (odom); an AMCL yaw correction rotates map->odom about the odom
// origin, so absolute goal positions jump by (distance from origin) x (yaw
// step) - 0.19 m per degree at POI_01. The robot-to-goal vector only moves by
// the correction at the robot.
geometry_msgs::msg::Point offset(
  const geometry_msgs::msg::Pose & robot, const geometry_msgs::msg::Pose & goal)
{
  geometry_msgs::msg::Point o;
  o.x = goal.position.x - robot.position.x;
  o.y = goal.position.y - robot.position.y;
  return o;
}
}  // namespace

void LatchedGoalChecker::initialize(
  const rclcpp_lifecycle::LifecycleNode::WeakPtr & parent,
  const std::string & plugin_name,
  const std::shared_ptr<nav2_costmap_2d::Costmap2DROS> costmap_ros)
{
  SimpleGoalChecker::initialize(parent, plugin_name, costmap_ros);
  auto node = parent.lock();
  logger_ = node->get_logger();

  nav2_util::declare_parameter_if_not_declared(
    node, plugin_name + ".latched_xy_tolerance", rclcpp::ParameterValue(xy_goal_tolerance_));
  nav2_util::declare_parameter_if_not_declared(
    node, plugin_name + ".relatch_distance", rclcpp::ParameterValue(0.0));
  nav2_util::declare_parameter_if_not_declared(
    node, plugin_name + ".relatch_max_gap", rclcpp::ParameterValue(1.0));
  node->get_parameter(plugin_name + ".latched_xy_tolerance", latched_xy_tolerance_);
  node->get_parameter(plugin_name + ".relatch_distance", relatch_distance_);
  node->get_parameter(plugin_name + ".relatch_max_gap", relatch_max_gap_);

  if (!(latched_xy_tolerance_ >= xy_goal_tolerance_)) {
    RCLCPP_WARN(
      logger_, "%s.latched_xy_tolerance (%.3f) < xy_goal_tolerance (%.3f); using %.3f.",
      plugin_name.c_str(), latched_xy_tolerance_, xy_goal_tolerance_, xy_goal_tolerance_);
    latched_xy_tolerance_ = xy_goal_tolerance_;
  }
  if (!(relatch_distance_ >= 0.0)) {
    RCLCPP_WARN(logger_, "%s.relatch_distance < 0; disabled.", plugin_name.c_str());
    relatch_distance_ = 0.0;
  }
  if (!(relatch_max_gap_ > 0.0)) {
    RCLCPP_WARN(logger_, "%s.relatch_max_gap <= 0; using 1.0 s.", plugin_name.c_str());
    relatch_max_gap_ = 1.0;
  }
  RCLCPP_INFO(
    logger_,
    "%s: xy %.3f, yaw %.3f, stateful %d, latched_xy %.3f, relatch_distance %.3f, "
    "relatch_max_gap %.2f s",
    plugin_name.c_str(), xy_goal_tolerance_, yaw_goal_tolerance_, stateful_,
    latched_xy_tolerance_, relatch_distance_, relatch_max_gap_);

  latch_params_handler_ = node->add_on_set_parameters_callback(
    std::bind(&LatchedGoalChecker::latchParametersCallback, this, std::placeholders::_1));
}

double LatchedGoalChecker::latchedXyTolerance() const
{
  return std::max(latched_xy_tolerance_, xy_goal_tolerance_);
}

bool LatchedGoalChecker::extensionsEnabled() const
{
  // relatch_distance 0 and latched_xy_tolerance == xy_goal_tolerance make this
  // class behave exactly like SimpleGoalChecker (the live rollback).
  return relatch_distance_ > 0.0 || latchedXyTolerance() > xy_goal_tolerance_;
}

void LatchedGoalChecker::release(const char * why)
{
  if (!check_xy_) {
    RCLCPP_INFO(logger_, "Goal xy latch released (%s).", why);
  }
  check_xy_ = true;
  have_latched_goal_ = false;
  reset_pending_ = false;
}

void LatchedGoalChecker::reset()
{
  // controller_server resets on every path update inside one control loop
  // (BT replan, ~1 Hz) and also when a NEW FollowPath starts after a success,
  // cancel or recovery. Only the former may keep the latch: the previous check
  // must be from the running loop (the controller checks every cycle).
  const bool same_loop = have_latched_goal_ &&
    std::chrono::duration<double>(std::chrono::steady_clock::now() - last_check_).count() <=
    relatch_max_gap_;
  if (!check_xy_ && same_loop && relatch_distance_ > 0.0) {
    // Decide on the next isGoalReached(), which carries the new path end.
    reset_pending_ = true;
    return;
  }
  if (!check_xy_) {
    RCLCPP_INFO(logger_, "Goal xy latch cleared (new path).");
  }
  SimpleGoalChecker::reset();
  have_latched_goal_ = false;
  reset_pending_ = false;
}

bool LatchedGoalChecker::isGoalReached(
  const geometry_msgs::msg::Pose & query_pose, const geometry_msgs::msg::Pose & goal_pose,
  const geometry_msgs::msg::Twist & velocity)
{
  last_check_ = std::chrono::steady_clock::now();
  const bool path_updated = reset_pending_;
  if (reset_pending_) {
    reset_pending_ = false;
    const auto now = offset(query_pose, goal_pose);
    if (std::hypot(now.x - latched_offset_.x, now.y - latched_offset_.y) > relatch_distance_) {
      release("goal moved");
    }
  }
  if (!check_xy_ && extensionsEnabled() &&
    planarDistance(query_pose, goal_pose) > latchedXyTolerance())
  {
    release("robot left the latched radius");
  }

  const bool was_latched = !check_xy_;
  const bool reached = SimpleGoalChecker::isGoalReached(query_pose, goal_pose, velocity);
  if (!check_xy_) {
    latched_offset_ = offset(query_pose, goal_pose);
    have_latched_goal_ = true;
    if (!was_latched) {
      RCLCPP_INFO(
        logger_, "Goal xy latched at %.3f m; turning to the goal heading.",
        planarDistance(query_pose, goal_pose));
    } else if (path_updated) {
      RCLCPP_INFO(logger_, "Path updated to the same goal; xy latch kept.");
    }
  }
  return reached;
}

bool LatchedGoalChecker::getTolerances(
  geometry_msgs::msg::Pose & pose_tolerance,
  geometry_msgs::msg::Twist & vel_tolerance)
{
  const bool ok = SimpleGoalChecker::getTolerances(pose_tolerance, vel_tolerance);
  if (!check_xy_) {
    pose_tolerance.position.x = latchedXyTolerance();
    pose_tolerance.position.y = latchedXyTolerance();
  }
  return ok;
}

rcl_interfaces::msg::SetParametersResult
LatchedGoalChecker::latchParametersCallback(std::vector<rclcpp::Parameter> parameters)
{
  rcl_interfaces::msg::SetParametersResult result;
  result.successful = true;
  for (auto & parameter : parameters) {
    if (parameter.get_type() != rclcpp::ParameterType::PARAMETER_DOUBLE) {
      continue;
    }
    const auto & name = parameter.get_name();
    if (name == plugin_name_ + ".latched_xy_tolerance") {
      latched_xy_tolerance_ = parameter.as_double();
    } else if (name == plugin_name_ + ".relatch_distance") {
      relatch_distance_ = std::max(0.0, parameter.as_double());
    } else if (name == plugin_name_ + ".relatch_max_gap" && parameter.as_double() > 0.0) {
      relatch_max_gap_ = parameter.as_double();
    }
  }
  return result;
}

}  // namespace robot_nav_plugins

PLUGINLIB_EXPORT_CLASS(robot_nav_plugins::LatchedGoalChecker, nav2_core::GoalChecker)
