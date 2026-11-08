# M2.3: ghi chú test Gazebo

Gom mọi việc phải chạy trên Ubuntu 22.04 có ROS 2 Humble + Gazebo Classic 11. Thiết kế: `docs/decisions/0049-m2-3-robot-local-safety.md`.

**Chỉ dùng trong mô phỏng. Không trỏ stub hay các lệnh dưới đây vào robot thật.**

| Phần | Trạng thái | Chạy được khi |
|---|---|---|
| A. Chuẩn bị và kiểm tra môi trường | Sẵn sàng | Ngay trên branch này |
| B. GATE S3.1 | Sẵn sàng | Ngay trên branch này |
| C. GATE S3.2 | Sẵn sàng | Ngay trên branch này |

Không tính PASS nếu chưa có log.

## A. Chuẩn bị và kiểm tra môi trường

Build một lần (chạy từ gốc repo), rồi mỗi terminal mới đều source lại:

```bash
cd robot/ros2_ws && colcon build --symlink-install --packages-up-to robot_navigation robot_control fleet_bridge && cd ../..
```

```bash
source robot/ros2_ws/install/setup.bash
```

Tạo credential cho stub. `X Y YAW` là một điểm trống, xa robot, trên map mô phỏng; chọn trong RViz để robot đi đủ lâu cho các ca dưới.

```bash
echo test-credential > /tmp/fleet.cred && chmod 600 /tmp/fleet.cred
```

Từ bước 3.2 bridge kiểm nội dung map, nên tạo gói ZIP từ map mô phỏng. Chạy từ gốc repo, mỗi terminal chạy bridge đều cần `MAP_SHA`:

```bash
(cd robot/ros2_ws/src/robot_navigation/maps && python3 -m zipfile -c /tmp/sim_map.zip warehouse_12x12.yaml warehouse_12x12.pgm)
```

```bash
export MAP_SHA=$(sha256sum /tmp/sim_map.zip | cut -d' ' -f1) && echo $MAP_SHA
```

Kiểm tra luồng cũ, chưa bật gate. Mỗi khối một terminal, đợi Nav2 active ở terminal 1 rồi mới chạy tiếp. Tìm topic odom của mô phỏng bằng `ros2 topic list | grep odom`; thường là `/diff_drive_controller/odom`, khác thì sửa trong lệnh bridge.

```bash
ros2 launch robot_navigation sim_navigation.launch.py
```

```bash
python3 robot/tools/fleet_commands_stub/fleet_commands_stub.py --robot-code robot_01 --credential-file /tmp/fleet.cred --map-key sim-map --goto X Y YAW
```

```bash
FLEET_SYNC_URL=http://127.0.0.1:8088/api/fleet/v1/sync FLEET_ROBOT_CODE=robot_01 FLEET_ROBOT_MAP_KEY=sim-map \
FLEET_ROBOT_CREDENTIAL_FILE=/tmp/fleet.cred \
ros2 run fleet_bridge fleet_bridge --ros-args \
  --params-file robot/ros2_ws/src/fleet_bridge/config/fleet_bridge.yaml \
  -p commands_enabled:=true -p report_period_sec:=0.5 \
  -p backend_url:=$FLEET_SYNC_URL -p robot_code:=$FLEET_ROBOT_CODE -p map_key:=$FLEET_ROBOT_MAP_KEY \
  -p readiness_odometry_topic:=/diff_drive_controller/odom \
  -p map_package_path:=/tmp/sim_map.zip -p map_package_sha256:=$MAP_SHA \
  -p localized_max_xy_variance:=0.3 -p localized_max_yaw_variance:=0.1
```

Đây là **lệnh bridge chuẩn** cho mọi ca dưới, trừ khi ca đó ghi khác. Hai giới hạn variance được nới vì AMCL mô phỏng seed với 0.25 và 0.0685, lớn hơn mặc định 0.09 và 0.05.

Từ bước 3.2, gate phải `OPEN` thì GoTo mới được nhận, nên chỉ phần B và C chạy trọn vẹn. Trên commit của bước 3.1 lệnh này vẫn chạy, các tham số mới bị bỏ qua.

| Kiểm tra (trên commit bước 3.1, chưa bật gate) | Mong đợi |
|---|---|
| Chạy GoTo | Stub in `ACCEPTED`, rồi `TERMINAL` với `ARRIVED`, và thoát 0 |
| Thêm `--cancel-after-sec 3` cho stub | `TERMINAL` với `CANCELLED`, hoặc `ARRIVED` nếu robot tới trước |

Giữ `use_sim_time` của `fleet_bridge` là false, nếu không nó từ chối khởi động. Stack Nav2 mô phỏng vẫn dùng sim time.

## B. GATE S3.1: motion permit + latch

### Dựng

Terminal 1, lần này bật gate:

```bash
ros2 launch robot_navigation sim_navigation.launch.py require_motion_permit:=true
```

Terminal thu log, chạy trước khi bắt đầu ca đầu tiên và để chạy suốt buổi. Mỗi dòng có đồng hồ thật ở đầu:

```bash
export LOG=$HOME/amr_logs/runs/$(date +%Y%m%d_%H%M%S)_s3_1 && mkdir -p $LOG && echo $LOG
```

```bash
for t in cmd_vel cmd_vel_nav motion_permit motion_gate_state; do (ros2 topic echo /$t --csv | while IFS= read -r l; do echo "$(date +%s.%N),$l"; done > $LOG/$t.csv) & done; wait
```

Lệnh trên in ra đường dẫn log. Mọi terminal khác dùng `$LOG` phải chạy `export LOG=<đường dẫn đó>` trước.

Mở thêm một terminal ghi tốc độ thực của robot. Tìm tên topic odom bằng `ros2 topic list | grep odom`, rồi thay `ODOM_TOPIC`:

```bash
ros2 topic echo ODOM_TOPIC --csv | while IFS= read -r l; do echo "$(date +%s.%N),$l"; done > $LOG/odom.csv
```

### Trình tự cho mỗi ca

1. Chạy stub với GoTo trễ 25 s, để kịp reset gate:

```bash
python3 robot/tools/fleet_commands_stub/fleet_commands_stub.py --robot-code robot_01 --credential-file /tmp/fleet.cred --map-key sim-map --goto X Y YAW --goto-delay-sec 25 --timeout-sec 300
```

2. Chạy bridge bằng lệnh ở phần A nếu nó chưa chạy.
3. Khi `motion_permit` đã `true`, trong vòng 25 s, reset gate. Trả về `success: true`, `motion_gate_state` phải là `OPEN`:

```bash
ros2 service call /motion_inhibit_reset std_srvs/srv/Trigger
```

4. Khi robot đang đi, ghi thời điểm rồi gây sự kiện của ca đó ngay trong cùng lệnh.

### Các ca

| Ca | Lệnh gây sự kiện | PASS |
|---|---|---|
| S1 | `date +%s.%N >> $LOG/S1_event.txt`, rồi Ctrl+C terminal stub | Tới `cmd_vel = 0` và robot đứng yên ≤ 3 s; gate `LATCHED:PERMIT_LOST` |
| S2 | Lệnh kill bên dưới | Như S1 |
| S3 | Lệnh chặn mạng bên dưới | Như S1 |
| S4 | Khôi phục sau mỗi ca (chạy lại stub, chạy lại bridge, hoặc mở chặn), theo dõi 30 s | Robot không tự chạy, gate vẫn `LATCHED:PERMIT_LOST` |
| S5 | Ngay sau S2, khi goal cũ còn sống, gọi lệnh reset | `success: false`, thông báo còn goal active |

Kill bridge (S2):

```bash
date +%s.%N >> $LOG/S2_event.txt; pkill -9 -f lib/fleet_bridge/fleet_bridge
```

Chặn cổng của stub (S3); không kết nối nào bị đóng nên giống mất mạng im lặng:

```bash
date +%s.%N >> $LOG/S3_event.txt; sudo iptables -I INPUT -i lo -p tcp --dport 8088 -j DROP
```

Mở lại sau S3. Stub phải in `TERMINAL` với `FAILED` và `LOCAL_LINK_LOSS`:

```bash
sudo iptables -D INPUT -i lo -p tcp --dport 8088 -j DROP
```

Sau S2 và S5, goal cũ vẫn còn trong Nav2. Người kết thúc nó bằng lệnh sau rồi mới sang ca tiếp theo:

```bash
ros2 service call /navigate_to_pose/_action/cancel_goal action_msgs/srv/CancelGoal "{}"
```

### Ghi lại

- Thời gian dừng của từng ca: lấy mốc trong `*_event.txt`, so với dòng `cmd_vel` bằng 0 đầu tiên và lúc odom về 0.
- Real-time factor của Gazebo. `mode_manager` dùng sim time, nên factor dưới 1 sẽ làm số đo theo đồng hồ thật dài ra.

## C. GATE S3.2: readiness

Dùng terminal 1 có `require_motion_permit:=true`, trừ ca ghi khác. Chạy stub với `--print-readiness` để xem telemetry; stub in một dòng mỗi khi `status`, `localized`, `motionReady` hoặc `faultCode` đổi:

```bash
python3 robot/tools/fleet_commands_stub/fleet_commands_stub.py --robot-code robot_01 --credential-file /tmp/fleet.cred --map-key sim-map --goto X Y YAW --goto-delay-sec 40 --timeout-sec 300 --print-readiness
```

| Ca | Làm gì | PASS |
|---|---|---|
| S6a | Chạy stub và bridge **trước** khi launch mô phỏng | `localized: null`, `motionReady: null` |
| S6b | Launch mô phỏng, bridge chạy **không** có hai tham số variance; không di chuyển robot, không reset | `localized` khác `true`; khi GoTo tới, stub in `REJECTED` với `NOT_LOCALIZED` hoặc lý do readiness khác |
| S7 | Gate `OPEN`, rồi bật E-stop phần mềm (lệnh bên dưới) | `motionReady: false`, `faultCode: ESTOP_ENGAGED`, gate `LATCHED:ESTOP` |
| S7b | Tắt E-stop | Gate vẫn `LATCHED:ESTOP`, `faultCode: MOTION_GATE_LATCHED` |
| S8 | Gate `OPEN`, chưa có GoTo, gửi goal bằng CLI (lệnh bên dưới) | `FOREIGN_NAV_GOAL`, `status: UNKNOWN`, gate `LATCHED:PERMIT_LOST`, terminal gửi goal vẫn đang chờ (bridge không cancel goal đó) |
| S8b | Khi goal lạ còn chạy, kill bridge rồi chạy lại | `UNOWNED_GOAL_AT_STARTUP`, `status: UNKNOWN`, goal vẫn còn |
| S9 | Launch với map đã sửa (lệnh bên dưới), bridge dùng `MAP_SHA` gốc | `faultCode: MAP_CONTENT_MISMATCH`, GoTo `REJECTED` với `MAP_MISMATCH` |
| S10 | Khi bridge đang chạy lệnh chuẩn, chạy `route_test.py` | In `Tu choi chay: fleet_bridge dang nhan lenh`, không gửi goal |

Bật và tắt E-stop phần mềm (S7, S7b):

```bash
ros2 service call /emergency_stop std_srvs/srv/SetBool "{data: true}"
```

```bash
ros2 service call /emergency_stop std_srvs/srv/SetBool "{data: false}"
```

Goal lạ (S8). Sau khi xong ca, kết thúc goal bằng lệnh cancel ở phần B:

```bash
ros2 action send_goal /navigate_to_pose nav2_msgs/action/NavigateToPose "{pose: {header: {frame_id: map}, pose: {position: {x: X, y: Y}, orientation: {w: 1.0}}}}"
```

Map đã sửa (S9). Chạy từ gốc repo, rồi launch thay cho terminal 1:

```bash
mkdir -p /tmp/altered && cp robot/ros2_ws/src/robot_navigation/maps/warehouse_12x12.* /tmp/altered/ && printf '\0' >> /tmp/altered/warehouse_12x12.pgm
```

```bash
ros2 launch robot_navigation sim_navigation.launch.py require_motion_permit:=true map:=/tmp/altered/warehouse_12x12.yaml
```

Route test (S10), dùng một file tuyến hợp lệ bất kỳ:

```bash
python3 robot/tools/route_test/route_test.py ROUTE.yaml --action /navigate_to_pose --no-confirm
```

## Gửi lại sau khi chạy

- Commit đã test (`git rev-parse HEAD`).
- Thư mục `$LOG` và output của từng terminal.
- Số đo từng ca, real-time factor, và ca nào FAIL.
