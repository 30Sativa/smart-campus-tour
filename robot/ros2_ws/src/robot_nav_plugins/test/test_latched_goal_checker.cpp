// Copyright 2026 Smart Campus Tour
// Licensed under the Apache License, Version 2.0

#include <chrono>
#include <cmath>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#include "gtest/gtest.h"
#include "rclcpp/rclcpp.hpp"
#include "rclcpp_lifecycle/lifecycle_node.hpp"
#include "robot_nav_plugins/latched_goal_checker.hpp"

using robot_nav_plugins::LatchedGoalChecker;

namespace
{
geometry_msgs::msg::Pose pose(double x, double y, double yaw)
{
  geometry_msgs::msg::Pose p;
  p.position.x = x;
  p.position.y = y;
  p.orientation.z = std::sin(yaw / 2.0);
  p.orientation.w = std::cos(yaw / 2.0);
  return p;
}

struct Fixture
{
  std::shared_ptr<rclcpp_lifecycle::LifecycleNode> node;
  LatchedGoalChecker checker;
  geometry_msgs::msg::Twist still;

  explicit Fixture(const std::vector<rclcpp::Parameter> & extra)
  {
    std::vector<rclcpp::Parameter> params = {
      rclcpp::Parameter("gc.xy_goal_tolerance", 0.15),
      rclcpp::Parameter("gc.yaw_goal_tolerance", 0.30),
      rclcpp::Parameter("gc.stateful", true)};
    params.insert(params.end(), extra.begin(), extra.end());
    rclcpp::NodeOptions options;
    options.parameter_overrides(params);
    node = std::make_shared<rclcpp_lifecycle::LifecycleNode>("gc_test", options);
    checker.initialize(node, "gc", nullptr);
  }

  double reportedXy()
  {
    geometry_msgs::msg::Pose tol;
    geometry_msgs::msg::Twist vtol;
    EXPECT_TRUE(checker.getTolerances(tol, vtol));
    EXPECT_DOUBLE_EQ(tol.position.x, tol.position.y);
    return tol.position.x;
  }
};

const auto kGoal = pose(7.78, 7.78, -1.37);
const std::vector<rclcpp::Parameter> kEnabled = {
  rclcpp::Parameter("gc.latched_xy_tolerance", 0.35),
  rclcpp::Parameter("gc.relatch_distance", 0.10)};
}  // namespace

TEST(LatchedGoalChecker, DefaultsBehaveLikeSimpleGoalChecker)
{
  Fixture f({});
  EXPECT_DOUBLE_EQ(f.reportedXy(), 0.15);
  // Inside xy, wrong heading: latches, not reached.
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.70, 7.70, 1.0), kGoal, f.still));
  EXPECT_TRUE(f.checker.latched());
  EXPECT_DOUBLE_EQ(f.reportedXy(), 0.15);
  // Stock behaviour: no radius check while latched...
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.30, 7.78, 1.0), kGoal, f.still));  // 0.48 m
  EXPECT_TRUE(f.checker.latched());
  // ...and a path update resets the latch.
  f.checker.reset();
  EXPECT_FALSE(f.checker.latched());
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.62, 7.70, -1.37), kGoal, f.still));  // 0.18 m
}

TEST(LatchedGoalChecker, LiveRollbackParametersRestoreSimpleGoalChecker)
{
  Fixture f(kEnabled);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.66, 7.70, 1.0), kGoal, f.still));
  ASSERT_TRUE(f.checker.latched());
  ASSERT_TRUE(f.node->set_parameter(rclcpp::Parameter("gc.relatch_distance", 0.0)).successful);
  ASSERT_TRUE(
    f.node->set_parameter(rclcpp::Parameter("gc.latched_xy_tolerance", 0.15)).successful);
  EXPECT_FALSE(f.checker.extensionsEnabled());
  EXPECT_DOUBLE_EQ(f.reportedXy(), 0.15);
  // Like SimpleGoalChecker: no radius check while latched, reset clears.
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.30, 7.78, 1.0), kGoal, f.still));
  EXPECT_TRUE(f.checker.latched());
  f.checker.reset();
  EXPECT_FALSE(f.checker.latched());
}

TEST(LatchedGoalChecker, NewFollowPathAfterAPauseStartsUnlatched)
{
  // A success, cancel or recovery ends the control loop; the next FollowPath
  // (even to the same place) must earn the latch again.
  auto params = kEnabled;
  params.push_back(rclcpp::Parameter("gc.relatch_max_gap", 0.05));
  Fixture f(params);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.66, 7.70, 1.0), kGoal, f.still));  // 0.144 m
  ASSERT_TRUE(f.checker.latched());
  std::this_thread::sleep_for(std::chrono::milliseconds(120));
  f.checker.reset();
  EXPECT_FALSE(f.checker.latched());
  EXPECT_DOUBLE_EQ(f.reportedXy(), 0.15);
  // Robot nudged to 0.19 m meanwhile: right heading is not enough any more.
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.61, 7.70, -1.37), kGoal, f.still));
  EXPECT_FALSE(f.checker.latched());
}

TEST(LatchedGoalChecker, NotReachedOutsideXyEvenWithRightHeading)
{
  Fixture f(kEnabled);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.60, 7.78, -1.37), kGoal, f.still));  // 0.18 m
  EXPECT_FALSE(f.checker.latched());
  EXPECT_DOUBLE_EQ(f.reportedXy(), 0.15);
}

TEST(LatchedGoalChecker, LatchSurvivesReplanToTheSameGoalAndWidensControllerRadius)
{
  Fixture f(kEnabled);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.66, 7.70, 1.0), kGoal, f.still));  // 0.144 m
  ASSERT_TRUE(f.checker.latched());
  EXPECT_DOUBLE_EQ(f.reportedXy(), 0.35);
  // 1 Hz replan; localisation moved the robot 4 cm and the path end 2 cm.
  f.checker.reset();
  EXPECT_TRUE(f.checker.latched());
  EXPECT_DOUBLE_EQ(f.reportedXy(), 0.35);
  const auto goal2 = pose(7.80, 7.78, -1.37);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.62, 7.70, 0.0), goal2, f.still));  // 0.197 m
  EXPECT_TRUE(f.checker.latched());
  // Heading reached while still outside 0.15 m: accepted thanks to the latch.
  EXPECT_TRUE(f.checker.isGoalReached(pose(7.62, 7.70, -1.30), goal2, f.still));
}

TEST(LatchedGoalChecker, LatchSurvivesAnOdomFrameRotationFarFromTheOrigin)
{
  // The controller hands both poses over in odom. An AMCL yaw step rotates
  // map->odom about the odom origin; 11 m away, 1.5 deg moves the goal by
  // 0.29 m in odom although nothing changed relative to the robot.
  Fixture f(kEnabled);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.66, 7.70, 1.0), kGoal, f.still));
  ASSERT_TRUE(f.checker.latched());
  const double a = 1.5 * M_PI / 180.0;
  auto rotate = [a](const geometry_msgs::msg::Pose & p, double yaw) {
      return pose(
        std::cos(a) * p.position.x - std::sin(a) * p.position.y,
        std::sin(a) * p.position.x + std::cos(a) * p.position.y, yaw + a);
    };
  const auto goal2 = rotate(kGoal, -1.37);
  ASSERT_GT(std::hypot(goal2.position.x - 7.78, goal2.position.y - 7.78), 0.25);
  f.checker.reset();
  // The same AMCL update also shifted the robot 5 cm: now 0.19 m from the
  // goal, outside xy_goal_tolerance, so only a kept latch is still latched.
  const auto robot2 = rotate(pose(7.61, 7.70, 0.0), 0.0);
  ASSERT_GT(std::hypot(
      goal2.position.x - robot2.position.x, goal2.position.y - robot2.position.y), 0.15);
  EXPECT_FALSE(f.checker.isGoalReached(robot2, goal2, f.still));
  EXPECT_TRUE(f.checker.latched());
  EXPECT_DOUBLE_EQ(f.reportedXy(), 0.35);
}

TEST(LatchedGoalChecker, GoalMovedRelativeToTheRobotClearsTheLatch)
{
  Fixture f(kEnabled);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.66, 7.70, 1.0), kGoal, f.still));
  ASSERT_TRUE(f.checker.latched());
  f.checker.reset();
  // New goal 0.15 m away from the old one: same neighbourhood, different goal.
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.66, 7.70, -1.37), pose(7.93, 7.78, -1.37), f.still));
  EXPECT_FALSE(f.checker.latched());
}

TEST(LatchedGoalChecker, NewGoalElsewhereClearsTheLatch)
{
  Fixture f(kEnabled);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.70, 7.70, 1.0), kGoal, f.still));
  ASSERT_TRUE(f.checker.latched());
  f.checker.reset();
  const auto start = pose(-0.32, -0.52, 0.077);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.70, 7.70, 0.077), start, f.still));
  EXPECT_FALSE(f.checker.latched());
  EXPECT_DOUBLE_EQ(f.reportedXy(), 0.15);
}

TEST(LatchedGoalChecker, SameGoalButRobotFarAwayClearsTheLatch)
{
  Fixture f(kEnabled);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.70, 7.70, 1.0), kGoal, f.still));
  ASSERT_TRUE(f.checker.latched());
  f.checker.reset();
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.20, 7.70, -1.37), kGoal, f.still));  // 0.585 m
  EXPECT_FALSE(f.checker.latched());
}

TEST(LatchedGoalChecker, DriftingOutOfTheLatchedRadiusReleasesWithoutReset)
{
  Fixture f(kEnabled);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.70, 7.70, 1.0), kGoal, f.still));
  ASSERT_TRUE(f.checker.latched());
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.30, 7.78, -1.37), kGoal, f.still));  // 0.48 m
  EXPECT_FALSE(f.checker.latched());
}

TEST(LatchedGoalChecker, PathUpdateAfterDriftStillHonoursTheLatchedRadius)
{
  Fixture f(kEnabled);
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.66, 7.70, 1.0), kGoal, f.still));  // 0.144 m
  ASSERT_TRUE(f.checker.latched());
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.48, 7.70, 1.0), kGoal, f.still));  // 0.31 m
  ASSERT_TRUE(f.checker.latched());
  f.checker.reset();
  // Robot-to-goal vector moved only 0.08 m since the last check, but the robot
  // is now 0.39 m away: outside latched_xy_tolerance.
  EXPECT_FALSE(f.checker.isGoalReached(pose(7.40, 7.70, -1.37), kGoal, f.still));
  EXPECT_FALSE(f.checker.latched());
}

TEST(LatchedGoalChecker, NonFiniteLatchedToleranceFallsBackToXy)
{
  Fixture f({rclcpp::Parameter("gc.latched_xy_tolerance", std::nan(""))});
  EXPECT_DOUBLE_EQ(f.checker.latchedXyTolerance(), 0.15);
}

TEST(LatchedGoalChecker, LatchedToleranceBelowXyIsClamped)
{
  Fixture f({rclcpp::Parameter("gc.latched_xy_tolerance", 0.05)});
  EXPECT_DOUBLE_EQ(f.checker.latchedXyTolerance(), 0.15);
}

int main(int argc, char ** argv)
{
  ::testing::InitGoogleTest(&argc, argv);
  rclcpp::init(argc, argv);
  const int result = RUN_ALL_TESTS();
  rclcpp::shutdown();
  return result;
}
