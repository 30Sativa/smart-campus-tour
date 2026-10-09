# Nav2 — thử nghiệm tiến 0.24 m/s, quay 0.45 rad/s

Trạng thái: **READY FOR HARDWARE TEST**. Bộ thông số này cần test trên xe;
static tests không chứng minh độ êm, góc quay hoặc quãng đường dừng thực tế.

## Thay đổi và phạm vi

Người vận hành ghi nhận robot đứng lại, quay rồi đi; có lúc quay nhanh/giật,
có lúc chậm. RPP được cấu hình quay căn hướng trước khi tiến khi lệch hơn
khoảng 45°. Recovery Spin là nguồn quay riêng và trước đây có trần cao hơn RPP.
Chưa có log để kết luận chính xác nguyên nhân giật trên phần cứng. Thử nghiệm
này tăng mức tiến từ 0.22 lên 0.24 m/s và đồng bộ RPP/Spin/smoother lên
0.45 rad/s; đây là tốc độ lệnh, không phải cam kết tốc độ xe đo được.

File: `robot/ros2_ws/src/robot_control/config/nav2_params.yaml`.

| Parameter | Baseline ngay trước thử nghiệm | Test này |
|---|---:|---:|
| `controller_server.FollowPath.desired_linear_vel` | 0.22 | 0.24 m/s |
| `controller_server.FollowPath.rotate_to_heading_angular_vel` | 0.35 | 0.45 rad/s |
| `behavior_server.max_rotational_vel` | 0.40 | 0.45 rad/s |
| `velocity_smoother.max_velocity` | [0.22, 0.0, 0.40] | [0.24, 0.0, 0.45] |
| `velocity_smoother.min_velocity` | [-0.20, 0.0, -0.40] | [-0.20, 0.0, -0.45] |

Giữ nguyên `max_angular_accel: 0.50`, `rotational_acc_lim: 0.50` rad/s²,
Spin `min_rotational_vel: 0.10`, smoother `max_accel: [0.50, 0.0, 0.50]`
và `max_decel: [-0.50, 0.0, -2.50]`. Không đổi EKF, IMU, wheel odometry,
footprint, map, camera, lookahead, inflation, cost weights hay thuật toán tránh
vật cản. Sonar vẫn OFF; chạy cùng camera baseline `enable_camera:=false`.
Giữ timeout và cơ chế manual/e-stop; không tăng tốc lùi.
Không dùng đợt này để ép robot qua cửa hẹp.

RPP căn hướng và Spin có cùng trần khoảng 26°/s. Smoother tăng
vận tốc góc tối đa khoảng 0.025 rad/s mỗi tick 20 Hz. Đây là giới hạn lệnh,
không phải phép đo chuyển động. `rotational_acc_lim` của Spin Humble dùng trong
tính tốc độ theo góc còn lại; startup ramp do smoother phía sau đảm nhiệm.
Đổi trần góc làm các cung rẽ khi đang đi cũng có thể thay đổi; cần kiểm tra
bám path, không chỉ quay tại chỗ. Cơ chế này không giới hạn jerk.

File YAML dùng chung cho real/sim navigation và auto-explore. Các launch dùng
file này đều nhận giới hạn mới. Mapping manual/keyboard teleop không đi qua
Nav2 velocity smoother, nên bộ thông số không làm teleop quay chậm hơn.

## Chuỗi vận tốc và giới hạn bánh

`RPP / Recovery Spin -> cmd_vel_ctrl -> velocity_smoother -> cmd_vel_nav
-> mode_manager -> cmd_vel -> stm32_bridge -> CMD wheel pair -> STM32`.
Giữ các remap và `use_composition: false` để mọi lệnh Nav2 đi qua smoother
và mux; không publish thử nghiệm trực tiếp vào `cmd_vel`.

- RPP đặt mức tiến mong muốn 0.24; regulation vẫn giảm tốc theo curvature,
  cost và khoảng cách tới goal. `rotate_to_heading_angular_vel` là mức quay
  tại chỗ, không ép mọi cung rẽ phải quay đúng 0.45.
- Spin có trần riêng 0.45, giảm theo góc còn lại. Smoother OPEN_LOOP/20 Hz
  giữ trần góc đối xứng ±0.45, trần tiến 0.24 và các ramp cũ.
- ModeManager chuyển tiếp Twist, không có một trần vận tốc thấp hơn; giữ
  manual override, timeout 0.5 s và software emergency stop.
- Navigation thật include `manual_mode.launch.py`; bridge dùng effective
  `wheel_base: 0.4714 m`, `speed_scale: 1.0`, trần bánh **250 mm/s**. Không
  đổi giá trị calibration hoặc nâng trần bánh. `manual_mapping.launch.py`
  là luồng riêng có trần 350 mm/s, không phải trần navigation này.

Trước invert dấu motor, bridge tính `left/right = (v ∓ w * 0.4714 / 2) * 1000`.
Tiến thẳng 0.24 cần 240/240 mm/s; quay tại chỗ ±0.45 cần hai bánh đối dấu
±106.065 mm/s (làm tròn 106), đều không bị scale. Nếu đồng thời `v=0.24`
và `|w|=0.45`, bánh ngoài cần **346.065 mm/s**: bridge giữ trần 250 và scale
cả cặp theo tỷ lệ khoảng 0.7224, thành 97/250 mm/s hoặc ngược lại. Trước làm
tròn, tương đương `v≈0.1734 m/s`, `|w|≈0.3251 rad/s`. Đây là giới hạn bánh
có chủ đích, không phải cả hai mức cực đại đồng thời có thể đạt được. Nếu cần
đạt cả hai đồng thời, phải đánh giá riêng việc nâng trần bánh; thử nghiệm này
không làm vậy. Pair scaling giữ độ cong tới sai số làm tròn, không clip riêng
một bánh; các ramp của smoother không chứng minh gia tốc thực của bánh sau scale.

STM32 vẫn nhận mm/s, giữ watchdog 300 ms và giới hạn pulse 12000 Hz. Tại
250 mm/s, drivetrain 194.5 mm / 16000 pulse mỗi vòng bánh cần khoảng 6546 Hz,
dưới trần firmware; không cần đổi firmware/protocol. Bridge vẫn gửi 20 Hz,
giữ `cmd_timeout: 0.5 s` và feedback timeout 1 s.

Đối chiếu implementation Humble:
[RPP](https://github.com/ros-navigation/navigation2/blob/humble/nav2_regulated_pure_pursuit_controller/src/regulated_pure_pursuit_controller.cpp),
[Spin](https://github.com/ros-navigation/navigation2/blob/humble/nav2_behaviors/plugins/spin.cpp),
[smoother](https://github.com/ros-navigation/navigation2/blob/humble/nav2_velocity_smoother/src/velocity_smoother.cpp).

## Nạp đúng bản trên MiniPC

Đây là thay đổi source trong repo; không tự đồng bộ sang MiniPC hay publish image.
Dừng navigation cũ và xác nhận robot đứng yên trước khi cập nhật/restart.

Trước cập nhật checkout/build bản mới, từ terminal đã source bản cũ, lưu YAML
đang cài để rollback mà không sửa các file khác. Với symlink-install, thay đổi
source cũng có thể thay đổi file cài; kiểm tra snapshot còn đúng cột trước:

```bash
cp "$(ros2 pkg prefix robot_control)/share/robot_control/config/nav2_params.yaml" \
  /tmp/nav2_params.before-024-045.yaml
```

Sau khi thay đổi source, trên miniPC dừng navigation cũ, xác nhận robot đứng
yên, rồi build native và source lại môi trường:

```bash
bash robot/scripts/build-native
source robot/scripts/source-minipc
```

Workspace native phải đã build thành công. Không chạy một launch thứ hai chồng
lên launch cũ.

Trên miniPC, kiểm tra map rồi launch:

```bash
test -r "$ROBOT_MAP_DIR/map2.yaml" && test -r "$ROBOT_MAP_DIR/map_fix.pgm"
```

Baseline `robot/robot_maps/map2.yaml` có `image: map_fix.pgm`. Khi hai file tồn tại:

```bash
ros2 launch robot_navigation navigation.launch.py \
  robot_id:=robot_01 \
  map:="$ROBOT_MAP_DIR/map2.yaml" \
  enable_camera:=false
```

Giữ terminal launch chạy. Trong terminal `robot-ros2` khác, xác nhận runtime:

```bash
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/controller_server FollowPath.rotate_to_heading_angular_vel
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/controller_server FollowPath.desired_linear_vel
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/controller_server FollowPath.max_angular_accel
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/behavior_server max_rotational_vel
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/behavior_server min_rotational_vel
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/behavior_server rotational_acc_lim
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/velocity_smoother max_velocity
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/velocity_smoother min_velocity
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/velocity_smoother max_accel
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/velocity_smoother max_decel
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/stm32_bridge_node max_wheel_speed_mm_s
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/stm32_bridge_node wheel_base
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/stm32_bridge_node speed_scale
```

Kết quả phải khớp cột Test này và các giới hạn giữ nguyên. Nếu còn mốc cũ,
kiểm tra image, install và `nav2_params_file`; đừng tiếp tục tune bản source mà
runtime chưa dùng. `movement_time_allowance` vẫn 15 s: ước lượng quay 180° có
ramp khoảng 7.9 s; cộng tiến 0.25 m ở regulated minimum 0.10 m/s và margin
2 s vẫn dưới 15 s. Đây chỉ là ngân sách lý tưởng, không chứng minh motor/TF.

## Test có giám sát

1. Chỗ trống, scan bám map và TF/localization ổn; đặt initial pose đúng.
   Xác nhận phương tiện dừng của người vận hành sẵn dùng.
2. Goal thẳng khoảng 0.5 m rồi 1 m. Sau đó chọn goal lệch hướng khoảng 90° ở cả
   hai phía, rồi 180° trong vùng trống. Đây là góc hướng ban đầu tới đường đi,
   không phải cam kết RPP sẽ xoay đúng góc đó trước khi bắt đầu tiến.
3. Lặp lại ít nhất ba lần mỗi phía. Quan sát khởi động quay, kết thúc quay,
   chuyển sang tiến và bám path khi rẽ. Ghi thời gian đứng chờ và góc vượt quá.
4. Kiểm tra Spin riêng ở chỗ trống, không có goal navigation đang chạy. Sau khi
   đảm bảo quyền điều khiển độc quyền, người vận hành có thể gọi
   `ros2 action send_goal /robot_01/spin nav2_msgs/action/Spin
   "{target_yaw: 1.57, time_allowance: {sec: 20, nanosec: 0}}" --feedback`,
   rồi lặp lại với `target_yaw: -1.57`. Giữ mode explore để mux nhận lệnh Nav2.
   Nếu recovery tự kích hoạt, ghi log `behavior_server` để phân biệt Spin với
   quay căn hướng. Không chặn robot bằng người/vật sát thân để ép recovery.
5. Chỉ sau khi vùng trống ổn mới thử lối hẹp đã đo. Ghi nguyên văn lỗi Nav2,
   chiều rộng lối, vị trí goal và ảnh costmap; chưa giảm footprint/cost.

6. Thử cancel, chuyển mode manual, manual override, E-stop và mất nguồn lệnh
   có kiểm soát. Xác nhận đầu ra zero khi timeout/E-stop; kiểm tra phản hồi
   cancel khi chuyển mode manual hoặc bật E-stop. Manual override tạm thời và
   timeout không tự hủy goal: Nav2 có thể tiếp tục khi nguồn lệnh trở lại.
   Trước kết thúc mỗi lượt, chuyển manual và xác nhận goal đã cancel; chỉ gửi
   goal mới có giám sát, không tự nhả emergency stop bằng script.

Ghi dữ liệu bằng terminal native đã source riêng trước khi gửi goal (nếu có rosbag2):

```bash
ros2 bag record -o "$ROBOT_MAP_DIR/nav2_speed_test_$(date +%Y%m%d_%H%M%S)" \
  /robot_01/cmd_vel_ctrl /robot_01/cmd_vel_nav /robot_01/cmd_vel \
  /robot_01/wheel/odom /robot_01/odom /robot_01/plan /robot_01/robot_mode_state \
  /robot_01/emergency_stop_state /tf /tf_static /rosout
```

Log/bag nằm ở thư mục map native; không commit chúng. Ctrl+C recorder khi
xong. Nếu không có rosbag2, tối thiểu giữ terminal launch log và quan sát
`angular.z` từng topic bằng `ros2 topic echo`; không cài thêm phần mềm giữa lượt test.

Kỳ vọng: quay có ramp ổn định, không đổi hướng liên tục, không cần clear costmap thủ công,
goal liên tiếp hoàn tất. Khi chỉ Nav2 điều khiển, sau smoother `|angular.z|` không
vượt 0.45 rad/s, `linear.x` không vượt 0.24 m/s (cho phép sai số số thực).
Chạy thẳng đủ dài mới kỳ vọng đạt 0.24; quay tại chỗ đủ góc mới kỳ vọng đạt
0.45 trước giảm tốc. Rẽ kết hợp có thể chậm hơn do wheel cap; kiểm tra warning
`Wheel command pair scaled` và bám path, không nâng cap để xóa warning.
So sánh lệnh với chuyển động thật:
`odom` wheel-derived không phải phép đo độc lập xác nhận motor không trượt.

Watch for: rung/stall, overshoot, stop vẫn gắt, path tracking kém
do trần góc mới, hoặc `Failed to make progress` khi quay. Không tăng timeout
để che lỗi khi chưa kiểm tra. Nếu lệnh sau smoother êm mà xe giật, kiểm tra
bridge/motor/cơ khí tiếp; bộ thông số không chứng minh nguyên nhân đã được sửa.
Tăng tiến 0.22 -> 0.24 làm quãng phanh lý tưởng ở 0.50 m/s² tăng từ 0.0484
lên 0.0576 m, chưa tính latency/trượt/tải. Với cùng latency, robot cũng đi xa
hơn trước khi bắt đầu phanh; cần đo khoảng dừng thật. Quay nhanh hơn cũng
cần kiểm tra góc vượt và vùng chassis quét, không đổi footprint để né lỗi.

## Dừng và rollback

Phím `k` không hủy goal Nav2. Dừng nguồn teleop rồi chuyển mode ở terminal native:

```bash
ros2 topic pub --once /robot_01/robot_mode std_msgs/msg/String "{data: manual}"
```

Chuyển explore → manual yêu cầu cancel goal theo config hiện tại; kiểm tra log
cancel và trạng thái goal. Nếu cần khóa software output:

```bash
ros2 service call /robot_01/emergency_stop std_srvs/srv/SetBool "{data: true}"
```

Xác nhận xe đứng yên, rồi Ctrl+C launch cũ. Software stop phụ thuộc process ROS,
không bền qua restart và không thay thế ngắt phần cứng khi cần. Không tự nhả stop
hay chuyển explore trong script test.

Nếu cần rollback: sau khi đã dừng và đóng launch cũ, nạp bản snapshot đã lưu:

```bash
ros2 launch robot_navigation navigation.launch.py \
  robot_id:=robot_01 map:="$ROBOT_MAP_DIR/map2.yaml" enable_camera:=false \
  nav2_params_file:=/tmp/nav2_params.before-024-045.yaml
```

Xác nhận runtime về baseline trước thử nghiệm và chỉ gửi goal mới có giám sát.
Nếu không có snapshot, phục hồi **chỉ năm parameter** trong bảng về cột trước,
build native/source rồi restart. Rollback source lâu dài phải đồng bộ lại các
contract test/tài liệu về baseline tương ứng, không vô hiệu test. Không reset
toàn repo hoặc đụng thay đổi chưa commit của phần khác.

## Verification tự động

`scripts/verify robot` là gate chính; nếu thiếu môi trường ROS, Tier 2 colcon
build/test được ghi SKIPPED. Có thể chạy các contract trên máy không ROS:

```bash
python3 -B robot/ros2_ws/src/robot_control/test/test_nav2_baseline_contract.py
python3 -B robot/ros2_ws/src/stm32_bridge/test/test_odometry.py
python3 -B robot/ros2_ws/src/robot_control/test/test_mode_manager.py
python3 -B robot/ros2_ws/src/robot_control/test/test_ekf_contract.py
python3 -B robot/ros2_ws/src/robot_control/test/test_namespace_contract.py
```

Các test xác nhận producer/ceiling, ramp/braking, wheel conversion/pair scaling,
kiểm tra freshness/non-finite của mux và contract localization/namespace.
Chúng không đo độ êm, tốc độ
thật, clearance hay xác nhận phần mềm đang chạy trên MiniPC đã nạp YAML mới.
