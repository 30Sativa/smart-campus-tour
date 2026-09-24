# ADR-0003: The robot runs a prebuilt Docker image

## Context

The robot miniPC is a Dell OptiPlex 3050 Micro (i3-7100T, 8 GB, no discrete
GPU). Building a ROS 2 workspace on it is slow, and a build that fails halfway
leaves the robot in a state where nothing runs.

Development happens on a laptop, sometimes inside a VM, with a different USB
stack and different package versions from the miniPC — so "it built on my
machine" is not evidence it will run on the robot.

## Decision

The deployment artifact is a Docker image.

1. Develop and test on the laptop.
2. Push to GitHub.
3. GitHub Actions builds the ROS 2 image (build context `robot/`).
4. Pull requests build only. Pushes to `main`/`master` push `latest` and a
   short-SHA tag to DockerHub.
5. The miniPC explicitly pulls the published image before recreating the
   hardware service:

   ```bash
   docker compose --profile hardware pull robot-ros2
   docker compose --profile hardware up -d --force-recreate robot-ros2
   ```

   The hardware service has no `build:`; `--build` therefore does not update
   the deployed image. We do not use `pull_policy: always`, so startup can
   still use a cached image when the miniPC is temporarily offline.

There is no normal deployment path that runs `git pull` and builds the full ROS
workspace on the naked miniPC host. The drivetrain, navigation, and main ROS
runtime remain image-based.

Temporary exception during bring-up: the `hardware` service bind-mounts
`./ros2_ws/src:/ros2_ws/src`, so ROS source can be `git pull`-ed on the host
and rebuilt *inside the container* (`colcon build --symlink-install`) without
a CI round trip. The build still never runs on the naked host. The mount is
marked in `docker-compose.yml` and is removed before production. Removing that
test-phase mount makes the main runtime image-only; the Astra Pro camera-only
native-host exception below remains in force.

Maps are stored on the host and bind-mounted (`./robot_maps:/maps`) so a map
the robot built survives an image update.

### Clarification: Astra Pro native-host exception

The Astra Pro is a hardware exception to the container runtime boundary. Its
host USB dependencies and `orbbec_bringup` camera driver run natively on the
miniPC host, using a ROS overlay built for the camera package and its
dependencies. This exception does not authorize a host deployment of the full
ROS workspace, nor duplicate STM32, Nav2, `robot_control`, or other drivetrain
nodes outside the container. The container's `network_mode: host` and shared
`ROS_DOMAIN_ID` allow the native camera node and container runtime to discover
each other.

## Consequences

Positive:

- What runs on the robot is byte-identical to what CI built.
- Rollback is retagging to an earlier short SHA.
- The miniPC never spends its CPU on compilation.

Negative:

- Every code change requires a CI round trip before it can run on the robot,
  which is slow for a one-line fix.
- Requires network on the robot to pull an update.
- The container/host split for the camera is a real source of confusion and has
  to be remembered whenever discovery breaks. The camera-only host overlay is
  an explicit hardware exception, not a second deployment path for the robot
  stack.
- Image size and DockerHub rate limits become operational concerns.
