#!/bin/bash
# go.sh POI_01|START|POI_03 : send a Nav2 goal ONLY if a rosbag recorder is really recording
# and no external CPU load (Quest stream) is running. Use instead of the raw send_goal command.
# Run in a sourced robot terminal (S3 helper + smoothws, ROS_SUPER_CLIENT=TRUE).
case $1 in
  POI_01) P="x: 7.76, y: 7.75}, orientation: {z: -0.633, w: 0.774";;
  START)  P="x: -0.319, y: -0.535}, orientation: {z: 0.03849, w: 0.99926";;
  POI_03) P="x: 42.460, y: -23.038}, orientation: {z: -0.72197, w: 0.69193";;
  *) echo "usage: $0 POI_01|START|POI_03"; exit 2;;
esac
rec=$(pgrep -af "ros2 bag record" | grep -v pgrep | grep -oE "\-o [^ ]+" | head -1 | cut -c4-)
if [ -z "$rec" ]; then echo "REFUSED: no 'ros2 bag record' running. Start rec_start.sh first."; exit 1; fi
db=$(ls "$rec"/*.db3 2>/dev/null | head -1)
s1=$(stat -c %s "$db" 2>/dev/null || echo 0); sleep 2; s2=$(stat -c %s "$db" 2>/dev/null || echo 0)
if [ "$s2" -le "$s1" ]; then echo "REFUSED: bag $db is not growing ($s1 -> $s2 bytes)."; exit 1; fi
if pgrep -x "ffmpeg|scrcpy" > /dev/null; then echo "REFUSED: Quest stream (ffmpeg/scrcpy) is running - it saturates the CPU and invalidates the A/B. Unplug the Quest."; exit 1; fi
echo "recording OK: $db ($s1 -> $s2 bytes); sending goal $1"
echo "$(date '+%F %T') goal $1" >> "$(dirname "$rec")/goals_sent.txt"
ros2 action send_goal /robot_01/navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {$P}}}}"
