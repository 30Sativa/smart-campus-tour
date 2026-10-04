# syntax=docker/dockerfile:1

# ros-base/ros-core images include build/test tooling in inherited layers.
# Keep Humble/Jammy, using the pinned apt-source package from upstream instead.
ARG ROS_DISTRO=humble
FROM ubuntu:22.04 AS base
ARG ROS_DISTRO
# Build-time only: apt/rosdep must not prompt if tzdata enters the closure.
ARG DEBIAN_FRONTEND=noninteractive
ARG TZ=Etc/UTC
ENV ROS_DISTRO=${ROS_DISTRO}
ENV ROS_WS=/ros2_ws
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN printf '%s\n' 'APT::Install-Recommends "false";' 'APT::Install-Suggests "false";' \
    > /etc/apt/apt.conf.d/99no-recommends

RUN ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime && echo "${TZ}" > /etc/timezone && \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && \
    curl -fsSL -o /tmp/ros2-apt-source.deb \
      https://github.com/ros-infrastructure/ros-apt-source/releases/download/1.2.0/ros2-apt-source_1.2.0.jammy_all.deb && \
    echo "767884cf4ed03116b9d64438930a832ed854147ae435279a7924dfdf60f94433 */tmp/ros2-apt-source.deb" | sha256sum --strict --check && \
    apt-get install -y --no-install-recommends /tmp/ros2-apt-source.deb && \
    apt-get purge -y --auto-remove curl && \
    apt-get update && apt-get install -y --no-install-recommends \
      "ros-${ROS_DISTRO}-ros2launch" \
      "ros-${ROS_DISTRO}-ros2cli-common-extensions" \
      "ros-${ROS_DISTRO}-rosbag2" \
      "ros-${ROS_DISTRO}-rmw-fastrtps-cpp" && \
    rm -f /tmp/ros2-apt-source.deb && \
    rm -rf /var/lib/apt/lists/*

# docker exec does not run ENTRYPOINT; keep one bashrc auto-source mechanism.
RUN printf '%s\n' \
    '' \
    '# ROS 2 environment for interactive container shells.' \
    'source "/opt/ros/${ROS_DISTRO}/setup.bash"' \
    'if [ -f "/ros2_ws/install/setup.bash" ]; then' \
    '  source "/ros2_ws/install/setup.bash"' \
    'fi' \
    >> /root/.bashrc
COPY docker/ros_entrypoint.sh /ros_entrypoint.sh
RUN chmod +x /ros_entrypoint.sh
WORKDIR ${ROS_WS}
ENTRYPOINT ["/ros_entrypoint.sh"]
CMD ["bash"]

# Metadata-only dependency/cache layer for builds and iterative development.
FROM base AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git python3-pip python3-colcon-common-extensions \
    python3-rosdep "ros-${ROS_DISTRO}-ros-base" && \
    rm -rf /var/lib/apt/lists/*
RUN rosdep init && rosdep update --rosdistro "${ROS_DISTRO}"
# Complete pinned wheels (including .so files) are copied to hardware.
# Keep this before manifest COPY so manifest edits reuse the wheel layer.
# Export tools (torch/ultralytics) are never installed.
RUN python3 -m pip install --no-cache-dir \
    "numpy==1.26.4" "openvino==2024.6.0" "openvino-telemetry==2024.1.0"
WORKDIR /tmp/rosdep_ws
COPY --parents ros2_ws/src/**/package.xml ./
COPY docker/runtime_dependencies.py /runtime_dependencies.py
# Optional display/sim launches retain full native manifest dependencies.
# xacro is NOT optional: real hardware launches execute it.
ARG OPTIONAL_ROS_KEYS="gazebo_ros gazebo_ros2_control gazebo_msgs controller_manager diff_drive_controller joint_state_broadcaster joint_state_publisher_gui rviz2"
RUN apt-get update && \
    rosdep install --from-paths ros2_ws/src --ignore-src \
      --rosdistro "${ROS_DISTRO}" --skip-keys "${OPTIONAL_ROS_KEYS}" -r -y && \
    python3 /runtime_dependencies.py ros2_ws/src --rosdistro "${ROS_DISTRO}" \
      --skip-keys "${OPTIONAL_ROS_KEYS}" > /tmp/runtime-packages.txt && \
    rm -rf /var/lib/apt/lists/*

FROM dependencies AS builder
WORKDIR ${ROS_WS}
COPY ros2_ws/src ./src
# Production install is self-contained, not symlinked into src/build.
RUN source "/opt/ros/${ROS_DISTRO}/setup.bash" && colcon build

# Start development with symlinks too; switching an existing Python install
# directory to symlink-install can fail on the first iterative rebuild.
FROM dependencies AS development-builder
WORKDIR ${ROS_WS}
COPY ros2_ws/src ./src
RUN source "/opt/ros/${ROS_DISTRO}/setup.bash" && colcon build --symlink-install

# Fresh filesystem: build/test deps, source/logs and rosdep caches are not
# inherited. Respect upstream runtime Depends (including CMake/headers/Qt);
# never purge those by package-name patterns.
FROM base AS runtime
COPY --from=dependencies /tmp/runtime-packages.txt /tmp/runtime-packages.txt
RUN apt-get update && \
    xargs -r apt-get install -y --no-install-recommends < /tmp/runtime-packages.txt && \
    rm -f /tmp/runtime-packages.txt && rm -rf /var/lib/apt/lists/*

FROM dependencies AS debug
RUN apt-get update && apt-get install -y --no-install-recommends \
    "ros-${ROS_DISTRO}-rviz2" \
    "ros-${ROS_DISTRO}-compressed-image-transport" \
    "ros-${ROS_DISTRO}-joint-state-publisher-gui" \
    "ros-${ROS_DISTRO}-rqt" \
    "ros-${ROS_DISTRO}-rqt-graph" \
    "ros-${ROS_DISTRO}-rqt-topic" \
    "ros-${ROS_DISTRO}-rqt-plot" \
    "ros-${ROS_DISTRO}-rqt-reconfigure" \
    "ros-${ROS_DISTRO}-rqt-service-caller" \
    "ros-${ROS_DISTRO}-plotjuggler-ros" && \
    rm -rf /var/lib/apt/lists/*
WORKDIR ${ROS_WS}
COPY --from=development-builder /ros2_ws/ /ros2_ws/

FROM dependencies AS sim
RUN apt-get update && \
    rosdep install --from-paths ros2_ws/src --ignore-src \
      --rosdistro "${ROS_DISTRO}" -r -y && \
    rm -rf /var/lib/apt/lists/*
WORKDIR ${ROS_WS}
COPY --from=development-builder /ros2_ws/ /ros2_ws/

# MUST stay last: existing CI/local builds without --target publish hardware.
FROM runtime AS hardware
COPY --from=builder /ros2_ws/install /ros2_ws/install
# Ubuntu 22.04/Humble uses Python 3.10. Copy complete local wheels, not system
# Python (provided by apt), pip executables, or builder caches.
COPY --from=dependencies /usr/local/lib/python3.10/dist-packages/ /usr/local/lib/python3.10/dist-packages/
RUN packages="$(dpkg-query -W -f='${binary:Package}\n')" && \
    ! grep -E "^(ros-${ROS_DISTRO}-(rqt|plotjuggler|gazebo|rviz2|controller-manager|diff-drive-controller|joint-state-broadcaster|joint-state-publisher-gui|ament-lint-(auto|common))(-|$)|gazebo[0-9]*$|libgazebo|build-essential$|g\+\+(-[0-9]+)?$|git$|python3-(colcon|rosdep))" <<< "$packages"
