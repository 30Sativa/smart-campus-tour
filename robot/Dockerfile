# syntax=docker/dockerfile:1

ARG ROS_DISTRO=humble
FROM ros:${ROS_DISTRO}-ros-base

ARG ROS_DISTRO
ENV ROS_DISTRO=${ROS_DISTRO}
ENV ROS_WS=/ros2_ws

SHELL ["/bin/bash", "-c"]

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    python3-colcon-common-extensions \
    python3-rosdep \
    && rm -rf /var/lib/apt/lists/*

RUN if [ ! -f /etc/ros/rosdep/sources.list.d/20-default.list ]; then \
      rosdep init; \
    fi && \
    rosdep update --rosdistro "${ROS_DISTRO}"

WORKDIR /tmp/rosdep_ws

# Keep this layer dependent on manifests only. --parents preserves the ROS
# package directory layout, and the recursive glob picks up newly added
# packages under ros2_ws/src without maintaining a package-name list.
COPY --parents ros2_ws/src/**/package.xml ./

RUN apt-get update && \
    rosdep install \
      --from-paths ros2_ws/src \
      --ignore-src \
      --rosdistro "${ROS_DISTRO}" \
      -r -y && \
    rm -rf /var/lib/apt/lists/*

WORKDIR ${ROS_WS}
COPY ros2_ws/src ./src

RUN source "/opt/ros/${ROS_DISTRO}/setup.bash" && \
    colcon build

# `docker exec ... bash` does not run ENTRYPOINT, so interactive shells need
# the same base-then-overlay setup order in root's bashrc. Keep ROS_DISTRO
# literal here so the persisted container environment resolves it at runtime.
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

ENTRYPOINT ["/ros_entrypoint.sh"]
CMD ["bash"]
