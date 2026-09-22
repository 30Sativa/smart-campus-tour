# ADR-0007: SmacPlanner2D + Regulated Pure Pursuit, with autonomous reverse disabled

## Context

The first supervised A->B run on the real campus-tour robot needed a
navigation baseline that is predictable enough to debug. The stack it
inherited was the Nav2 default pairing: `NavfnPlanner` for the global path and
`DWBLocalPlanner` for control.

Three things made that pairing a poor fit here.

DWB is a sampling local planner. It picks a velocity by scoring candidate
trajectories against a bag of weighted critics. That is powerful, and it is
also eleven interacting numbers to tune before the robot behaves the same way
twice. On a first hardware run, "why did it do that?" is the question you
cannot afford.

Navfn produces paths that graze obstacle inflation, because its cost function
barely penalises proximity. For a 0.49 m-radius robot in a campus corridor
that is the difference between driving down the middle and scraping a wall.

The robot's rear sensing is four SR04T sonars mounted diagonally out of the
chassis corners, with poses that are still schematic in `sensors.xacro` rather
than measured. There is no rear LiDAR and the depth camera faces forward.
Nav2's stock recovery behaviour tree ends its recovery round-robin with
`BackUp`, which reverses the robot 0.30 m on its own initiative.

## Decision

The global planner is `nav2_smac_planner/SmacPlanner2D` with
`cost_travel_multiplier: 2.0`. Grid A* with a real proximity penalty, so paths
stay nearer the corridor centre. Not Hybrid-A* or State Lattice: this base is
differential drive and rotates in place, so a kinematically feasible curve
planner buys nothing and costs predictability.

The controller is
`nav2_regulated_pure_pursuit_controller::RegulatedPurePursuitController` with
`use_rotate_to_heading: true`, `allow_reversing: false` and
`use_collision_detection: true`, at the existing 0.20 m/s baseline.

Autonomous reverse is off in two independent places: RPP will not command a
negative linear velocity, and `bt_navigator` runs
`robot_navigation/behavior_trees/navigate_{to_pose,through_poses}_no_backup.xml`
- the stock Humble trees with the `BackUp` node removed and nothing else
changed. The `BackUp` plugin stays loaded in `behavior_server` so a human can
still trigger a reverse deliberately during rear-coverage testing.

## Consequences

Positive:

- Behaviour is explainable. RPP has one geometric idea (chase a carrot on the
  path) plus speed regulation, instead of eleven critics negotiating.
- Paths keep clearance by construction rather than by inflation tuning.
- The robot cannot reverse into the blind wedge behind it on its own.
- Spin, Wait and costmap clearing remain as recoveries, and all three are safe
  in place.

Negative:

- **RPP is not a local trajectory planner.** It follows the global path and
  collision-checks the arc to its lookahead carrot. It does not search for a
  detour. An obstacle only the depth camera or sonar can see does not reach
  the global costmap, so the planner never learns to route around it and the
  robot stops instead. For the baseline that is the accepted outcome: detect
  and fail safely, not detour.
- A robot that cannot reverse can strand itself somewhere a three-point turn
  would fix. It stops and reports failure; a human recovers it.
- The two behaviour trees are now ours to maintain. If a future Nav2 release
  changes the stock trees, the diff has to be re-applied by hand.

Reversing is re-enabled only after the rear-coverage acceptance tests in
`robot_navigation/README.md` pass on the real robot: each sonar validated
individually, the centre-rear blind wedge measured, near-field blind distance
measured, and behaviour on a failed sensor understood.
