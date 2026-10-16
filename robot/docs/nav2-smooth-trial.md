# Nav2 — thử nghiệm độ mượt: goal checker giữ latch + 0.20 m/s

Trạng thái: **READY FOR HARDWARE TEST** (chỉ mới kiểm thử offline). Chạy cùng
bản hiệu chỉnh LiDAR `lidar_yaw=-0.2225` (mặc định của launch robot thật trên
branch này). Opt-in bằng `nav2_params_file`; launch mặc định không đổi.

## Thay đổi

File `robot_control/config/nav2_params_smooth.yaml` = `nav2_params_wide_global_inflation.yaml`
cộng đúng 2 thay đổi (contract test `test_nav2_smooth_contract.py` khoá điều này):

| # | Parameter | Đang dùng (wide inflation) | Thử nghiệm |
|---|---|---|---|
| 1 | `controller_server.goal_checker.plugin` | `nav2_controller::SimpleGoalChecker` | `robot_nav_plugins::LatchedGoalChecker` |
|   | `goal_checker.latched_xy_tolerance` | — | 0.35 m |
|   | `goal_checker.relatch_distance` | — | 0.10 m |
|   | `goal_checker.relatch_max_gap` | — | 1.0 s |
| 2 | `controller_server.FollowPath.desired_linear_vel` | 0.24 | 0.20 m/s |

Giữ nguyên: ngưỡng chấp nhận goal (0.15 m, 0.30 rad, stateful), velocity
smoother (trần 0.24 / 0.45, gia tốc và **phanh** cũ), collision detection,
regulation, lookahead, costmap, inflation, planner, BT (không BackUp),
progress checker, AMCL, EKF, bridge, e-stop/manual.

### 1. `LatchedGoalChecker` (package mới `robot_nav_plugins`)

Lỗi gốc trong Nav2 Humble:

- `controller_server` gọi `GoalChecker::reset()` mỗi lần path cập nhật. BT
  replan 1 Hz, nên latch xy của `stateful: true` bị xoá mỗi giây trong lúc
  robot quay tại đích. Mô phỏng xác nhận khoảng 5 lần cập nhật path trong một
  lần quay ở đích.
- RPP lấy bán kính "quay về hướng goal" từ chính goal checker (0.15 m). Chỉ
  cần AMCL hiệu chỉnh vài cm trong lúc quay là robot ra khỏi bán kính, RPP
  quay ngược về phía cuối path, rồi lại quay về hướng goal.

Bằng chứng:

- **Mô phỏng:** 2/6 lượt quay qua lại khoảng 340°, 22–23 s cho 0.6 m cuối,
  `Failed to make progress`.
- **Bag 13/10:** 4 lần quay rời nhau ở đích.
- **Bag 15/10:** robot lượn ở 0.16–0.21 m quanh POI_01 khoảng 8 s.

Đối chiếu source Nav2 1.1.20 (bản đang cài):

- `controller_server.cpp`: `setPlannerPath()` gọi `goal_checker->reset()`.
  Hàm này chạy cả khi bắt đầu FollowPath (`computeControl`) lẫn khi bị preempt
  (`updateGlobalPath`, mỗi lần BT replan). `isGoalReached()` so robot với **cuối
  path** đã đổi sang frame `odom`. Thứ tự mỗi chu kỳ là: cập nhật path → RPP
  tính lệnh → `isGoalReached`.
- `regulated_pure_pursuit_controller.cpp`: `goal_dist_tol_` lấy từ
  `getTolerances()` mỗi chu kỳ. RPP quay về hướng goal (`v = 0`) khi
  `hypot(carrot) < goal_dist_tol_`; gần cuối path thì carrot chính là điểm cuối
  path. `rotateToHeading` đã có giảm tốc trước khi tới góc đích.

Plugin kế thừa `SimpleGoalChecker` và chỉ thêm hai việc:

- **Giữ latch qua replan.** Một lần reset chỉ giữ latch khi đủ cả ba điều kiện:
  - lần kiểm tra trước nằm trong cùng vòng điều khiển (≤ `relatch_max_gap`
    = 1 s);
  - vector robot→goal đổi ≤ `relatch_distance` (0.10 m). Plugin so vector
    tương đối, vì so toạ độ tuyệt đối trong frame `odom` sẽ "nhảy" khoảng 0.19 m
    mỗi 1° AMCL chỉnh góc ở POI_01;
  - robot còn trong `latched_xy_tolerance`.
- **Sau khi đã latch,** báo `latched_xy_tolerance` (0.35 m) cho RPP để RPP ở yên
  chế độ quay về hướng goal.

Rà soát rủi ro (mỗi dòng có unit test; 8/8 mutant bị test bắt):

| Tình huống | Hành vi |
|---|---|
| BT replan cùng goal (~1 Hz) khi đang quay ở đích | giữ latch, RPP tiếp tục quay; log `xy latch kept` |
| Goal mới (`GoalUpdated`/preempt) cách goal cũ > 0.10 m | xoá latch ngay ở chu kỳ đó (`goal moved`) |
| Goal xong hoặc bị cancel, rồi FollowPath mới (kể cả cùng chỗ) | bắt đầu chưa latch, phải vào lại ≤ 0.15 m |
| Recovery (spin/wait/clear costmap) rồi FollowPath lại | như trên (vòng điều khiển đã dừng > 1 s) |
| Robot thật sự rời xa > 0.35 m (bị đẩy, trượt, AMCL nhảy) | xoá latch, RPP chạy lại về đích bình thường |
| Robot lệch 0.15–0.35 m khi đang latch | vẫn quay tại chỗ (`v = 0`). Thành công khi đúng góc, giống `SimpleGoalChecker` stateful khi không bị reset |

**Plugin không làm goal thành công sớm hơn về vị trí.** Robot vẫn phải vào
≤ 0.15 m (so với cuối path) mới latch. Sau khi latch, RPP chỉ quay (`v = 0`),
nên vị trí lúc báo thành công chính là vị trí lúc latch. Mô phỏng cho sai số vị
trí thật 0.12–0.17 m, cấu hình cũ là 0.11–0.14 m. Điều plugin chặn là việc RPP
quay ngược về cuối path khi nhiễu đẩy khoảng cách vượt 0.15 m.

Chưa xử lý: robot lượn chậm ở 0.16–0.21 m mà chưa từng vào 0.15 m (bag 15/10).
Hiện tượng này không tái hiện được trong mô phỏng. Nhiễu định vị giảm khoảng
một nửa sau khi sửa LiDAR. Nếu còn thấy trong bag test thì đó là việc riêng.

### 2. `desired_linear_vel` 0.24 → 0.20

Ở 0.24 m/s, cứ quay > 0.04 rad/s là một bánh vượt trần bridge 250 mm/s. Bag
15/10 có 39–50 % lệnh bị scale cả cặp và 1225 cảnh báo mỗi vòng. Ở 0.20 m/s,
robot quay tới 0.21 rad/s vẫn không chạm trần.

## Kết quả offline

Mô phỏng chạy **đúng các node Nav2 thật** với cùng namespace, remap, params,
map2 và BT; chỉ thay AMCL và robot. Công cụ nằm ngoài repo:
`~/.cache/armtc/navsim`.

Robot giả mô phỏng như sau:

- Bridge scale cả cặp bánh ở 250 mm/s và trễ 0.09 s (fit từ bag 15/10).
- Scan được raycast trên `map_fix.pgm`.
- Nhiễu định vị kiểu AMCL: hiệu chỉnh mỗi 0.25 m / 0.2 rad, p50 khoảng 2 cm và
  0.5°, khớp replay sau khi sửa LiDAR.

Tuyến là (−0.49, −0.41) → POI_01 (7.76, 7.75, −1.370) → START (−0.319, −0.535,
0.077), 3 seed. Mỗi ô là *trung vị (min–max)* của 6 lượt:

| Chỉ số | Wide inflation (đang dùng) | `nav2_params_smooth.yaml` |
|---|---|---|
| Lượt quay qua lại ở đích / progress failure | 2/6, 2 | 0/6, 0 |
| 0.6 m cuối (s) | 9.7 (9.2–23.2) | 9.6 (9.3–10.1) |
| Quay tại chỗ ở đích (°) | 139 (133–341) | 129 (124–146) |
| Sai số vị trí cuối, thật (m) | 0.14 (0.11–0.14) | 0.15 (0.12–0.17) |
| Sai số hướng cuối (°) | 14.4 (11.8–16.1) | 13.9 (13.1–16.1) |
| Lệnh bị bridge scale (%) | 40 (38–46) | 0 (0–1) |
| \|dω/dt\| thực p95 (rad/s²) | 0.27 (0.23–0.36) | 0.18 (0.15–0.20) |
| Khoảng hở footprint min (m) | 0.61 (0.52–0.69) | 0.61 (0.51–0.68) |
| Thời gian một lượt (s) | 70.2 (69.3–82.7) | 80.0 (78.6–80.4) |

Kiểm tra độ bền với nhiễu cao, như trước khi sửa LiDAR (hiệu chỉnh p50 khoảng
4 cm và 0.9°):

| Nhiễu cao | Wide inflation (4 lượt) | xy tol 0.25 (4 lượt) | `nav2_params_smooth.yaml` (6 lượt) |
|---|---|---|---|
| Lượt quay qua lại / progress failure | 2/4, 3 | 1/4, 0 | 0/6, 0 |
| 0.6 m cuối (s) | 20.8 (9.6–26.5) | 9.7 (8.1–21.8) | 9.7 (9.5–10.4) |
| Sai số vị trí cuối (m) | 0.12 (0.06–0.14) | 0.20 (0.15–0.24) | 0.15 (0.09–0.19) |

Code cuối, sau review ngày 16/10 (thêm `relatch_max_gap`, rollback đúng như
bản gốc), chạy lại 5 vòng (10 lượt, cả hai mức nhiễu):

- 0 lần quay qua lại.
- Robot chỉ tịnh tiến 0–1.2 cm từ lúc latch tới lúc báo thành công.
- Mỗi lần sang goal mới đều có log `latch cleared (new path)`.

Một lượt có recovery giữa đường do planner bị trễ, vì lúc đó máy chạy song song
pytest. Chạy lại seed đó khi máy rảnh thì bình thường.

Sai số vị trí thật tăng nhẹ (tối đa 0.17 so với 0.14 m) vì latch được giữ
trong khi nhiễu định vị vẫn còn; ngưỡng chấp nhận không đổi. Góc quay ở đích
(khoảng 130°) là do hướng POI so với hướng tới, không phải do
controller. Muốn bớt góc này thì phải đổi yaw của POI, việc đó thuộc về sản
phẩm/tour.

**Đã thử và loại:**

- **`xy_goal_tolerance` 0.25:** bớt quay qua lại nhưng không hết (1/4 lượt ở
  nhiễu cao), và sai số dừng tăng lên 0.15–0.25 m.
- **Velocity smoother `max_decel` góc −2.5 → −1.0:** \|dω/dt\| p95 lại kém hơn
  (0.23–0.33), và làm yếu giới hạn phanh.

Mô phỏng không có trượt bánh, độ trễ USB thật hay người đi lại. Đây là bằng
chứng về logic, không thay được test trên robot.

## Chuẩn bị (miniPC)

Overlay chứa branch này: `robot_description`, `robot_control`,
`robot_navigation` và `robot_nav_plugins`, build trên install chính. Từ
worktree của branch:

```bash
source /opt/ros/humble/setup.bash
source ~/smart-campus-tour/robot/ros2_ws/install/setup.bash
colcon --log-base ~/.cache/armtc/smoothws/log build --symlink-install \
  --base-paths robot/ros2_ws/src \
  --packages-select robot_description robot_control robot_navigation robot_nav_plugins \
  --build-base ~/.cache/armtc/smoothws/build --install-base ~/.cache/armtc/smoothws/install
```

(`source-minipc` không dùng được từ worktree, nên phải source thẳng install
chính làm underlay.) Trên miniPC, overlay này đã được build sẵn từ branch, nên
ngày test không cần build lại.

## Chạy test

Cả ba cấu hình chạy từ **cùng overlay, cùng launch**, nên cùng có bản sửa LiDAR
(`lidar_yaw` mặc định −0.2225 nằm ở launch, không ở params Nav2). Cấu hình
chỉ khác nhau ở params Nav2, mỗi bước thêm đúng một thay đổi:

| | `nav2_params_file` | Thêm sau khi launch |
|---|---|---|
| **A** đối chứng | `nav2_params_wide_global_inflation.yaml` | — |
| **B1** chỉ plugin | `nav2_params_smooth.yaml` | `ros2 param set /robot_01/controller_server FollowPath.desired_linear_vel 0.24` |
| **B2** plugin + 0.20 m/s | `nav2_params_smooth.yaml` | — |

Mỗi cấu hình là một session log mới (`robot/docs/logging.md`), cùng initial
pose ở START, một vòng START→POI_01→START (B2 hai vòng nếu kịp).

**Terminal 1, Nav2:**

```bash
source robot/scripts/source-minipc
source ~/.cache/armtc/smoothws/install/setup.bash
SHARE=$(ros2 pkg prefix robot_control)/share/robot_control/config
PARAMS=$SHARE/nav2_params_wide_global_inflation.yaml   # A
PARAMS=$SHARE/nav2_params_smooth.yaml                  # B1, B2
ROS_SUPER_CLIENT=TRUE ros2 launch robot_navigation navigation.launch.py \
  robot_id:=robot_01 map:="$HOME/smart-campus-tour/robot/robot_maps/map2.yaml" \
  enable_camera:=false rviz:=false nav2_params_file:="$PARAMS" \
  2>&1 | tee "$AMR_RUN_DIR/launch.log"
```

**Kiểm tra trước khi gửi goal** (ghi kết quả vào `notes.md`):

```bash
grep -c "Managed nodes are active" "$AMR_RUN_DIR/launch.log"                # phải >= 2 (localization + navigation); nếu không: Ctrl+C, launch lại
ROS_SUPER_CLIENT=TRUE ros2 run tf2_ros tf2_echo base_link lidar_link        # cả 3: yaw ≈ -12.75°
grep "goal_checker" "$AMR_RUN_DIR/launch.log"                               # A: SimpleGoalChecker; B: LatchedGoalChecker ... relatch_max_gap 1.00 s
ROS_SUPER_CLIENT=TRUE ros2 param get /robot_01/controller_server FollowPath.desired_linear_vel   # A 0.24, B1 0.24 (sau set), B2 0.2
```

**Terminal 2, bag:** bật trước goal; dừng bằng Ctrl+C rồi đợi ghi xong.

```bash
ROS_SUPER_CLIENT=TRUE ros2 bag record --include-hidden-topics -o "$AMR_RUN_DIR/bag" \
  /rosout /tf /tf_static /diagnostics \
  /robot_01/scan_raw /robot_01/scan /robot_01/imu/data /robot_01/odom /robot_01/wheel/odom \
  /robot_01/joint_states /robot_01/amcl_pose /robot_01/initialpose /robot_01/plan \
  /robot_01/local_costmap/costmap /robot_01/local_costmap/costmap_updates \
  /robot_01/global_costmap/costmap /robot_01/global_costmap/costmap_updates \
  /robot_01/local_costmap/published_footprint \
  /robot_01/cmd_vel_ctrl /robot_01/cmd_vel_nav /robot_01/cmd_vel \
  /robot_01/emergency_stop_state /robot_01/robot_mode_state \
  /robot_01/navigate_to_pose/_action/status /robot_01/navigate_to_pose/_action/feedback \
  2>&1 | tee "$AMR_RUN_DIR/bag_record.log"
```

**Terminal 3, goal** (cùng toạ độ với lần 15/10):

```bash
ROS_SUPER_CLIENT=TRUE ros2 action send_goal /robot_01/navigate_to_pose nav2_msgs/action/NavigateToPose \
  "{pose: {header: {frame_id: map}, pose: {position: {x: 7.76, y: 7.75}, orientation: {z: -0.633, w: 0.774}}}}" \
  --feedback 2>&1 | tee -a "$AMR_RUN_DIR/goal.log"
ROS_SUPER_CLIENT=TRUE ros2 action send_goal /robot_01/navigate_to_pose nav2_msgs/action/NavigateToPose \
  "{pose: {header: {frame_id: map}, pose: {position: {x: -0.319, y: -0.535}, orientation: {z: 0.03849, w: 0.99926}}}}" \
  --feedback 2>&1 | tee -a "$AMR_RUN_DIR/goal.log"
```

## Rollback

1. **Từng mục, ngay khi đang chạy** (đã kiểm trong mô phỏng: có hiệu lực ngay,
   không cần restart):

   ```bash
   C=/robot_01/controller_server
   ROS_SUPER_CLIENT=TRUE ros2 param set $C FollowPath.desired_linear_vel 0.24     # bỏ 0.20 m/s
   ROS_SUPER_CLIENT=TRUE ros2 param set $C goal_checker.relatch_distance 0.0      # } hai lệnh này cùng nhau:
   ROS_SUPER_CLIENT=TRUE ros2 param set $C goal_checker.latched_xy_tolerance 0.15 # } plugin = SimpleGoalChecker
   ```

2. **Bỏ toàn bộ độ mượt:** launch lại với `nav2_params_wide_global_inflation.yaml`
   (cấu hình A, plugin không được nạp).
3. **Bỏ cả bản sửa LiDAR:** thêm `lidar_yaw:=0.0`, hoặc không source overlay.

## Tiêu chí đánh giá

Phân tích bag bằng `trips.py`, `extract.py`, `smooth.py`, `metrics.py`
(`~/.cache/armtc/analysis`).

So **B1 với A** để đánh giá plugin (hành vi ở đích). So **B2 với B1** để đánh
giá tốc độ (bridge scale, gia tốc góc, thời gian).

| Chỉ số | 15/10 (cũ) | Đạt |
|---|---|---|
| Quay qua lại / lượn ở đích; lỗi progress | có (POI_01) | B1, B2: 0 |
| 0.6 m cuối | 12.5 / 11.0 s | B1, B2: ≤ 11 s, gồm cả lần quay theo yaw POI |
| Quay tại chỗ ở đích | 22° / 148° | một lần, đúng chiều, ≤ góc cần + 20° |
| Tịnh tiến sau khi latch (log `xy latched` → `Goal succeeded`) | — | ≤ 0.05 m |
| Sai số dừng (AMCL so với goal) | — | ≤ 0.20 m; yaw ≤ 0.30 rad |
| Lệnh bị bridge scale | 39 / 50 % | B2: < 5 % |
| \|dω/dt\| thực p95 khi chạy | 0.22–0.24 rad/s² | B2 ≤ B1 |
| Khoảng hở khi chạy | 0.44 m | ≥ 0.7 m, không kém A |
| Dừng ≥ 0.3 s giữa đường; recovery; collision stop | 0 / 1; 0 | 0 |

Rollback ngay nếu thấy một trong các dấu hiệu sau:

- Robot tiến lại gần vật cản hơn A.
- Robot đứng quay mãi ở đích mà không kết thúc (`latch kept` lặp lại nhưng goal
  không xong).
- Goal được báo thành công khi robot còn cách đích > 0.35 m.
