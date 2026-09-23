# Nav2 — test quay chậm sau phản hồi quay giật

Trạng thái: **READY FOR HARDWARE TEST**. Bộ thông số này cần test trên xe;
static tests không chứng minh độ êm, góc quay hoặc quãng đường dừng thực tế.

## Thay đổi và phạm vi

Người vận hành ghi nhận robot đứng lại, quay rồi đi; có lúc quay nhanh/giật,
có lúc chậm. RPP được cấu hình quay căn hướng trước khi tiến khi lệch hơn
khoảng 45°. Recovery Spin là nguồn quay riêng và trước đây có trần cao hơn RPP.
Chưa có log để kết luận chính xác nguyên nhân giật trên phần cứng.

File: `robot/ros2_ws/src/robot_control/config/nav2_params.yaml`.

| Parameter | Trước | Test này |
|---|---:|---:|
| `controller_server.FollowPath.rotate_to_heading_angular_vel` | 0.80 | 0.35 rad/s |
| `controller_server.FollowPath.max_angular_accel` | 1.50 | 0.50 rad/s² |
| `behavior_server.max_rotational_vel` | 1.20 | 0.40 rad/s |
| `behavior_server.min_rotational_vel` | 0.20 | 0.10 rad/s |
| `behavior_server.rotational_acc_lim` | 2.50 | 0.50 rad/s² |
| `velocity_smoother.max_velocity` | [0.20, 0.0, 1.20] | [0.20, 0.0, 0.40] |
| `velocity_smoother.min_velocity` | [-0.20, 0.0, -1.20] | [-0.20, 0.0, -0.40] |
| `velocity_smoother.max_accel` | [0.50, 0.0, 2.50] | [0.50, 0.0, 0.50] |

Giữ tốc độ tiến 0.20 m/s, lookahead, footprint, inflation, cost weights và
sonar-OFF như baseline. Chạy với `enable_camera:=false`. Giữ giới hạn giảm tốc
`max_decel: [-0.50, 0.0, -2.50]`, timeout và cơ chế manual/e-stop.
Không dùng đợt này để ép robot qua cửa hẹp.

RPP căn hướng khoảng 20°/s; trần góc sau smoother khoảng 23°/s. Smoother tăng
vận tốc góc tối đa khoảng 0.025 rad/s mỗi tick 20 Hz. Đây là giới hạn lệnh,
không phải phép đo chuyển động. `rotational_acc_lim` của Spin Humble dùng trong
tính tốc độ theo góc còn lại; startup ramp do smoother phía sau đảm nhiệm.
Giảm tốc góc làm các cung rẽ khi đang đi cũng có thể thay đổi; cần kiểm tra
bám path, không chỉ quay tại chỗ. Cơ chế này không giới hạn jerk.

File YAML dùng chung cho real/sim navigation và auto-explore. Các launch dùng
file này đều nhận giới hạn mới. Mapping manual/keyboard teleop không đi qua
Nav2 velocity smoother, nên bộ thông số không làm teleop quay chậm hơn.

## Nạp đúng bản trên MiniPC

Đây là thay đổi source trong repo; không tự đồng bộ sang MiniPC hay publish image.
Dừng navigation cũ và xác nhận robot đứng yên trước khi cập nhật/restart.

- Deployment image: sau khi CI publish image có thay đổi này, pull và recreate
  service hardware theo `robot/README.md`.
- Ngoại lệ TEST hiện có: đưa source mới vào đúng clone bind-mounted trên MiniPC,
  rồi build **trong `robot-ros2`**, không build trên host. Kiểm tra source trong
  container đã có bảng giá trị mới trước khi build.

MiniPC host, mở shell:

```bash
docker exec -it robot-ros2 bash
```

Trong container, chỉ với flow TEST source mount:

```bash
cd /ros2_ws
colcon build --symlink-install --packages-select robot_control
source /ros2_ws/install/setup.bash
```

Chỉ tiếp tục khi build thành công. Các package khác phải đã được build trong
image/workspace hiện tại. Không chạy một launch thứ hai chồng lên launch cũ.

Trong container, kiểm tra map rồi launch:

```bash
test -r /maps/map2.yaml && test -r /maps/map_fix.pgm
```

Baseline `robot/robot_maps/map2.yaml` có `image: map_fix.pgm`. Khi hai file tồn tại:

```bash
ros2 launch robot_navigation navigation.launch.py \
  robot_id:=robot_01 \
  map:=/maps/map2.yaml \
  enable_camera:=false
```

Giữ terminal launch chạy. Trong terminal `robot-ros2` khác, xác nhận runtime:

```bash
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/controller_server FollowPath.rotate_to_heading_angular_vel
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/controller_server FollowPath.max_angular_accel
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/behavior_server max_rotational_vel
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/behavior_server min_rotational_vel
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/behavior_server rotational_acc_lim
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/velocity_smoother max_velocity
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/velocity_smoother min_velocity
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/velocity_smoother max_accel
```

Kết quả phải khớp cột Test này. Nếu còn 0.8/1.2/2.5 ở các parameter quay đã đổi,
kiểm tra image, install và `nav2_params_file`; đừng tiếp tục tune bản source mà
runtime chưa dùng. `movement_time_allowance` vẫn 15 s: ước lượng quay 180° có
ramp khoảng 9.7 s, còn thời gian tiến để progress checker ghi nhận tiến triển.

## Test có giám sát

1. Chỗ trống, scan bám map và TF/localization ổn; đặt initial pose đúng.
   Xác nhận phương tiện dừng của người vận hành sẵn dùng.
2. Goal thẳng khoảng 0.5 m rồi 1 m. Sau đó chọn goal lệch hướng khoảng 90° ở cả
   hai phía, rồi 180° trong vùng trống. Đây là góc hướng ban đầu tới đường đi,
   không phải cam kết RPP sẽ xoay đúng góc đó trước khi bắt đầu tiến.
3. Lặp lại ít nhất ba lần mỗi phía. Quan sát khởi động quay, kết thúc quay,
   chuyển sang tiến và bám path khi rẽ. Ghi thời gian đứng chờ và góc vượt quá.
4. Nếu recovery tự kích hoạt, ghi log `behavior_server` để phân biệt Spin với
   quay căn hướng. Không cố chặn robot bằng người/vật sát thân để ép recovery.
5. Chỉ sau khi vùng trống ổn mới thử lối hẹp đã đo. Ghi nguyên văn lỗi Nav2,
   chiều rộng lối, vị trí goal và ảnh costmap; chưa giảm footprint/cost.

Ghi dữ liệu bằng terminal container riêng trước khi gửi goal (nếu image có rosbag2):

```bash
ros2 bag record -o "/maps/nav2_turn_test_$(date +%Y%m%d_%H%M%S)" \
  /robot_01/cmd_vel_ctrl /robot_01/cmd_vel_nav /robot_01/cmd_vel \
  /robot_01/odom /robot_01/plan /robot_01/robot_mode_state \
  /robot_01/emergency_stop_state /tf /tf_static /rosout
```

Log/bag nằm ở host `robot/robot_maps`; không commit chúng. Ctrl+C recorder khi
xong. Nếu không có rosbag2, tối thiểu giữ terminal launch log và quan sát
`angular.z` từng topic bằng `ros2 topic echo`; không cài thêm phần mềm giữa lượt test.

Kỳ vọng: quay nhẹ hơn, không đổi hướng liên tục, không cần clear costmap thủ công,
goal liên tiếp hoàn tất. Khi chỉ Nav2 điều khiển, sau smoother `|angular.z|` không
vượt 0.40 rad/s (cho phép sai số số thực). So sánh lệnh với chuyển động thật:
`odom` wheel-derived không phải phép đo độc lập xác nhận motor không trượt.

Watch for: rung/stall ở tốc độ thấp, overshoot, stop vẫn gắt, path tracking kém
do trần góc mới, hoặc `Failed to make progress` khi quay. Không tăng timeout
để che lỗi khi chưa kiểm tra. Nếu lệnh sau smoother êm mà xe giật, kiểm tra
bridge/motor/cơ khí tiếp; bộ thông số không chứng minh nguyên nhân đã được sửa.

## Dừng và rollback

Phím `k` không hủy goal Nav2. Dừng nguồn teleop rồi chuyển mode trong container:

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

Nếu cần rollback: sau khi đã dừng, phục hồi **chỉ tám parameter** ở bảng về cột
Trước trong `robot/ros2_ws/src/robot_control/config/nav2_params.yaml`, build lại
`robot_control` trong container TEST (hoặc dùng image đã ghi nhận trước đó),
rồi launch lại và xác nhận parameter runtime. Cấu hình cũ quay nhanh hơn; chỉ
dùng để so sánh có kiểm soát, không mặc định nó là cấu hình đã an toàn.
