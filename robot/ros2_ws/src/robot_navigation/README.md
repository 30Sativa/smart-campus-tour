# robot_navigation

Localization (map_server + AMCL) và navigation trên **map đã lưu** cho AMR.
Package này bổ sung phase "chạy production" sau khi đã build map bằng
`robot_control`.

## Workflow tổng thể (3 bước)

```
BƯỚC 1 — BUILD MAP (chọn 1 trong 2 case, đều dùng slam_toolbox):

  Case A: map unknown, tự khám phá (kiểu robot hút bụi)
    ros2 launch robot_control auto_explore.launch.py          # robot thật
    ros2 launch robot_control sim_auto_explore.launch.py      # Gazebo

  Case B: điều khiển tay, quét build map
    ros2 launch robot_control manual_mapping.launch.py        # robot thật
    ros2 launch robot_control sim_manual.launch.py            # Gazebo

BƯỚC 2 — LƯU MAP (khi map trong RViz đã kín):
    ros2 run nav2_map_server map_saver_cli -f \
        /maps/campus_map
    # tạo /maps/campus_map.yaml + /maps/campus_map.pgm trên volume host
    # ./robot_maps:/maps; không lưu map robot thật vào source/image.

BƯỚC 3 — NAVIGATE trên map đã lưu (KHÔNG chạy SLAM nữa):
    ros2 launch robot_navigation navigation.launch.py \
        robot_id:=robot_01 \
        map:=/maps/campus_map.yaml \
        enable_camera:=false                                 # robot thật
    # enable_camera:=true khi camera đã calibrate xong (Phase 2 mục 3).
    # Sau khi lên: PHẢI đặt "2D Pose Estimate" trong RViz. AMCL không tự
    # đoán robot đang ở gốc map.
    ros2 launch robot_navigation localization.launch.py \
        robot_id:=robot_01 map:=/maps/campus_map.yaml        # AMCL standalone
    ros2 launch robot_navigation sim_navigation.launch.py    # Gazebo (map co san)
    # Gui goal: RViz "Nav2 Goal", hoac bus_manager (/go_to_stop).
    # RViz KHONG tu mo; them rviz:=true neu muon xem.

LUU Y robot that: KHONG co map mac dinh. Quen map:= se bao loi ro rang roi dung.
       Sim thi da co san maps/warehouse_12x12 (khop world Gazebo), khong can map:=.
```

## Launch files

| File | Mục đích |
|---|---|
| `localization.launch.py` | map_server + AMCL + lifecycle manager; standalone cần truyền `map:=...` |
| `navigation.launch.py` | Robot thật: bringup + LiDAR + AMCL + Nav2 trên map đã lưu |
| `sim_navigation.launch.py` | Gazebo: mode_manager + relay + AMCL + Nav2 trên map đã lưu |

Cờ chung: `rviz:=true` mở RViz (mặc định tắt); `camera_enable_color:=true` bật
RGB cho Phase 4 (mặc định tắt để tiết kiệm băng thông USB). `enable_camera` mặc
định true — Astra vào local costmap; `camera_x/y/z/roll/pitch/yaw` **phải** là bộ
số Phase 2 đã hiệu chỉnh.

## Nav2 baseline (A→B trên robot thật)

**Baseline tạm thời: cả 4 sonar OFF trong Nav2.**
`robot/ros2_ws/src/robot_control/config/nav2_params.yaml` loại `sonar_layer`
khỏi danh sách `local_costmap.plugins` và giữ block của nó với `enabled: false`.
LiDAR và depth giữ nguyên. Bridge vẫn publish Range để quan sát; đây không phải
lệnh tắt nguồn cảm biến. Chưa áp dụng patch semantic bridge hoặc timeout policy.
Trước khi nạp lại sonar vào costmap cần xử lý đồng thời hai vấn đề đó và test
từng sensor; chỉ đổi checkbox RViz không bật sonar vào navigation.

### RViz Nav2 và bật/tắt hiển thị từng sensor

Mở riêng RViz sau khi build/source package trên máy có desktop:

```bash
ros2 run rviz2 rviz2 -d "$(ros2 pkg prefix --share robot_navigation)/rviz/navigation.rviz"
```

Hoặc thêm `rviz:=true` vào lệnh launch navigation hiện tại. RViz vẫn OFF mặc định.
Layout có map, global/local costmap, footprint, LiDAR, depth, AMCL particles,
global path, RPP transformed path, TF và công cụ Nav2 Goal.
Trong **Displays → Sonar - display only**, bốn mục Front Left / Front Right /
Rear Left / Rear Right có màu riêng và đều bỏ tick sẵn. Tick từng mục để xem
Range khi test lại; các checkbox chỉ thay đổi hiển thị, không đổi costmap,
publisher hay nguồn điện sensor. TF cũng có thể bật riêng để kiểm tra hướng.

File dành cho phiên không namespace (`robot_id:=''`), dùng `/scan`,
`/ultrasonic/sonar1/range`, ... . Nếu chạy `robot_id:=robot_01`, cần cấu hình
topic/action tương ứng có tiền tố `/robot_01` cho RViz trước khi gửi goal;
layout này chưa tự thêm tiền tố theo launch argument. Frame cố định vẫn là `map`.

Các mô tả sonar bên dưới chỉ áp dụng khi layer được bật lại sau kiểm chứng.

```
Goal / tour waypoint
   │
   ▼
BT Navigator  ── navigate_to_pose_no_backup.xml (KHÔNG auto BackUp)
   ├── Planner Server      : nav2_smac_planner/SmacPlanner2D
   ├── Controller Server   : RegulatedPurePursuitController (RPP)
   └── Behavior Server     : Spin / Wait / DriveOnHeading / BackUp*
   │
   ▼
Velocity Smoother ─► cmd_vel_nav ─► ModeManager ─► cmd_vel ─► STM32 ─► motors
```

`*` BackUp vẫn được **load** để test tay qua action interface, nhưng BT mặc
định **không bao giờ gọi** nó. Lý do trong
[ADR-0007](../../../../docs/decisions/0007-smac2d-rpp-no-autonomous-reverse.md).

Tham số ở `robot_control/config/nav2_params.yaml`. Những chỗ ghi
`TUNE ON HARDWARE` là chỗ cần chỉnh sau khi có số liệu chạy thật — đừng chỉnh
trước.

### RPP làm gì và KHÔNG làm gì

RPP bám global path và collision-check cung đường tới lookahead carrot bằng
**local costmap**.

RPP **không phải** local trajectory planner kiểu DWB. Nó không tự tìm đường
vòng. Hệ quả trực tiếp:

| Vật cản | Ai thấy | Hành vi baseline |
|---|---|---|
| LiDAR thấy | global + local costmap | Planner replan vòng qua **nếu còn chỗ** |
| Chỉ depth camera thấy | local costmap thôi | Robot **dừng / nav fail**. KHÔNG đảm bảo tự vòng |
| Chỉ sonar thấy | OFF trong baseline hiện tại | Chưa đóng góp vật cản vào navigation |

Yêu cầu tối thiểu của baseline là **phát hiện + dừng an toàn**, không phải tự
vòng. Muốn robot tự vòng vật chỉ camera thấy thì phải đưa depth vào global
costmap — đó là một architectural decision riêng, không nằm trong baseline này
(global costmap không cuộn, mà camera chỉ xoá được trong nón ~58° của nó, nên
vết đánh dấu sẽ đóng băng vĩnh viễn vào map).

### Costmap — sensor nào chịu trách nhiệm gì

```
global_costmap                      local_costmap
├── static_layer   (saved map)      ├── lidar_obstacle_layer  (LaserScan)
├── obstacle_layer (LiDAR ONLY)     ├── depth_obstacle_layer  (PointCloud2)
└── inflation_layer                 ├── sonar_layer           (OFF, không load)
                                    └── inflation_layer
```

LiDAR là **nguồn vật cản động duy nhất** của global costmap.

LiDAR và depth nằm ở **hai ObstacleLayer riêng**, không chung một layer. Lý do:
tia raytrace clearing của LiDAR đi ngang qua phía trên một cái thùng thấp và
xoá luôn vết mà camera vừa đánh dấu. Tách layer + `combination_method: 1`
(Maximum) nghĩa là mỗi layer giữ lưới riêng rồi ghi vào master bằng MAX, nên
LiDAR không xoá được vết của depth.

**Tách layer KHÔNG giải quyết hết stale depth obstacles.** Depth layer vẫn chỉ
clear được trong nón camera, nên vật đã bị dọn đi trong lúc robot quay mặt chỗ
khác sẽ còn nguyên vết cho tới khi robot quay lại nhìn. Phải test thật —
acceptance test D bên dưới.

### Sonar — giới hạn, đọc kỹ trước khi tin

4 × SR04T gắn chéo ra 4 góc thân xe. Chúng bù đúng một trường hợp: vật **thấp**
và **gần hơn 0.85 m**, chỗ Astra đã mù còn LiDAR thì raytrace vượt qua.

KHÔNG được coi đây là bảo vệ 360°:

- Pose sonar trong `sensors.xacro` là **schematic, chưa đo**, chưa calibrate.
- Có vùng mù: chính giữa phía trước, chính giữa phía sau, sát mặt sensor, và
  vùng thân xe quét qua khi robot **xoay tại chỗ**.
- `no_readings_timeout` **không phải** watchdog từng sensor.
  `RangeSensorLayer` trên Humble giữ **một** `last_reading_time_` chung cho cả
  4 topic, nên chỉ cần 1 sonar còn sống là cả layer vẫn được coi là "current"
  dù 3 cái kia đã chết. Không có tín hiệu health per-sensor ở bất kỳ đâu trong
  stack này.
- `mode_manager` **không đọc sonar**. Không có gì dừng robot theo sonar ngoài
  chuỗi costmap → RPP collision check.
- Sonar sau (sonar3/sonar4) **không** đủ để coi reverse tự động là an toàn.
  Đó là lý do `allow_reversing: false` và BT không gọi BackUp.

### Camera tắt (`enable_camera:=false`)

Nav2 vẫn launch bình thường, local costmap chạy bằng LiDAR trong baseline sonar OFF.
Cơ chế: `depth_obstacle_layer.pointcloud.expected_update_rate: 0.0` — layer
không bao giờ tự đánh dấu stale khi topic không có publisher, nên lifecycle
không fail và navigation không bị chặn. Không cần rewrite parameter lúc launch.

### ModeManager KHÔNG phải collision monitor

`nav2_collision_monitor` **chưa** được wire vào. ModeManager chỉ có manual
override, E-stop, và timeout — nó **không** là bộ giám sát va chạm độc lập.
Baseline đầu tiên bù bằng: tốc độ thấp, khu vực test có kiểm soát, và **có
người giám sát**.

Collision Monitor là phase sau, khi AMCL ổn / Smac path ổn / RPP A→B ổn /
local sensors đã verify. Khi làm, nên đặt safety filter sao cho **cả manual và
Nav2** đều được bảo vệ, chứ không chỉ đường Nav2.

## TF ownership

```
map
└── odom                      ← AMCL
    └── base_footprint        ← EKF (robot_localization)
        └── base_link         ← robot_state_publisher
            ├── lidar_link
            ├── camera_link / optical frames   ← orbbec_bringup
            ├── imu_link
            └── sonar1..4_link
```

Mỗi transform có **đúng một** chủ. `stm32_bridge` chạy với `publish_tf:=false`
để không tranh `odom -> base_footprint` với EKF. Nav2 dùng `base_footprint` làm
`robot_base_frame` ở mọi chỗ.

**Nav2 namespace + TF.** `nav2_bringup/navigation_launch.py` trên Humble remap
`/tf -> tf` trong mọi node. Khi push namespace, cái đó thành `/robot_01/tf`,
trong khi AMCL / EKF / robot_state_publisher vẫn broadcast lên `/tf` global →
Nav2 sẽ thấy cây TF rỗng. Các launch file ở đây chèn
`SetRemap('/tf', '/tf')` + `SetRemap('/tf_static', '/tf_static')` để vô hiệu
hoá remap của Nav2, giữ **một** cây TF global như trước.

Topic namespace-ready **không đồng nghĩa** multi-robot TF isolation. Chạy
nhiều robot chung một ROS domain vẫn cần chiến lược prefix/frame isolation
riêng ở phase multi-robot — xem `docs/architecture.md` mục 2.1.

## Odometry thực tế (không tô hồng)

```
STM32 STEP-derived wheel odometry ─┐
                                   ├─► EKF ─► odom -> base_footprint
BNO085 orientation yaw ────────────┘
```

- Wheel odom là **suy ra từ số STEP đã phát**, KHÔNG phải encoder feedback thật.
  HBS57H đóng vòng encoder bên trong nó; ROS không đọc vị trí encoder. Trượt
  bánh hay chuyển động không nằm trong STEP count thì odom sai, EKF không sửa
  hết được.
- IMU fuse **orientation yaw** của BNO085 (`imu0_config` chỉ bật field 5),
  ở chế độ relative. Firmware **không** publish raw gyro yaw-rate, nên đừng ghi
  ở đâu là đang fuse gyro.
- EKF fuse từ `wheel/odom`: `vx`, ràng buộc nonholonomic `vy = 0`, và `vyaw`
  suy ra từ bánh.
- Sửa sai số toàn cục là việc của AMCL qua `map -> odom`.

## Initial pose (AMCL) — robot thật KHÔNG tự đoán

`set_initial_pose` mặc định **false** trên robot thật.

Map origin `[0, 0, 0]` chỉ nói góc dưới-trái của file PGM nằm ở đâu trong frame
`map`. Nó **không** nói robot đang đứng ở đó. Seed AMCL ở (0,0,0) khi robot ở
chỗ khác cho ra một `map -> odom` **sai một cách tự tin**: particle cloud trông
chụm, RViz trông hợp lý, và robot đâm vào bức tường cách chỗ nó tưởng 4 m.

Robot thật chờ initial pose trên:

```
/robot_01/initialpose        (frame_id PHẢI là "map")
```

gửi từ RViz **"2D Pose Estimate"**, hoặc từ một dock/homing routine sau này.

**Đã gửi initialpose ≠ đã localize đúng.** Luôn verify runtime: scan có trùng
tường trên map đã lưu không, `map -> odom` có ổn định khi chạy và khi xoay không.

Gazebo (`sim_navigation.launch.py`) truyền `set_initial_pose:=true` vì ở đó
robot thật sự spawn đúng gốc world mà map sim được ghi từ đó.

## Footprint / inflation

- `robot_radius: 0.49` — bán kính bao của box CAD trong
  `robot_description/urdf/common_properties.xacro`
  (`base_length 0.8022` × `base_width 0.5628` → nửa đường chéo 0.490 m).
  Con số 0.47 cũ tính từ ước lượng 74×55 cm, tức là **nhỏ hơn thân xe theo CAD**.
  Đây KHÔNG liên quan gì tới `wheel_base=0.4714` của odometry.
- `inflation_radius: 0.60` (cả local lẫn global). Inflation đo **từ vật cản**,
  không phải "lề thêm ngoài robot radius", nên nó phải `>= robot_radius`.
  Bản cũ để local `0.35` < `robot_radius 0.47` — đó là bug.
- Robot dùng **circular footprint** conservative, chưa dùng polygon. Polygon
  chỉ nên làm khi đã đo thân xe hoàn thiện.
- TODO(hardware): đo envelope xe thật, kể cả bumper / tay cầm / dây nhô ra
  ngoài box CAD, rồi tính lại.
- Nếu robot từ chối một cái cửa mà nó lọt được thật: hạ `inflation_radius`,
  **đừng** hạ `robot_radius`.

## Nav2 namespace — root cause của lỗi cũ

Triệu chứng cũ với `robot_id:=robot_01`:

```
controller_server: No critics defined for FollowPath
```

`nav2_bringup/launch/navigation_launch.py` trên Humble dùng `namespace`
**chỉ** cho `RewrittenYaml(root_key=...)` và cho tên composition container.
Không Node nào nhận `namespace=`, và không có `PushRosNamespace`. Nên:

- node lên ở **root**: `/controller_server`, `/planner_server`, …
- còn YAML đã rewrite thì khai báo tham số cho `/robot_01/controller_server`

Không khớp gì cả → mọi Nav2 server khởi động với **tập tham số rỗng** → gặp
goal đầu tiên là chết, dù `FollowPath` nằm sờ sờ trong `nav2_params.yaml`.
Với `robot_id:=''` thì `RewrittenYaml` bỏ qua root key, nên bug chỉ hiện khi
có namespace.

Fix: `PushRosNamespace(robot_id)` bọc GroupAction của Nav2. Sau fix phải thấy:

```
/robot_01/controller_server   /robot_01/bt_navigator
/robot_01/planner_server      /robot_01/waypoint_follower
/robot_01/smoother_server     /robot_01/velocity_smoother
/robot_01/behavior_server
```

Giữ `use_composition:=false`. `SetRemap` chỉ tới được plain `Node` action;
composable node bỏ qua nó, và khi đó Nav2 publish thẳng vào `cmd_vel`,
**bypass ModeManager và E-stop**.

### Costmap sensor topic phải đi qua `$(var robot_ns)`

Costmap plugin subscribe trên **node costmap**, mà namespace của nó là
`<robot_ns>/local_costmap` (Costmap2DROS tự push sub-namespace). Nên một tên
tương đối `scan` ở đó resolve thành `<robot_ns>/local_costmap/scan` — không ai
publish. Nav2 upstream giải quyết bằng cách hardcode `/robot1/scan` trong
multirobot params; ở đây dùng `$(var robot_ns)/scan` để khỏi nhét robot id vào
file config. Launch file nào include `navigation_launch.py` với
`nav2_params.yaml` này **phải** `SetLaunchConfiguration('robot_ns', ...)` trước.

## Chuỗi cmd_vel (đừng phá)

```
controller_server ─┐
behavior_server   ─┴─► cmd_vel_ctrl ─► velocity_smoother ─► cmd_vel_nav
                                                                 │
teleop ─► cmd_vel_manual (ưu tiên override khi explore) ─────────┤
                                                                 ▼
                                                        mode_manager ─► cmd_vel
                                                                 │
                                                                 ▼
                                                           stm32_bridge
```

`cmd_vel_ctrl` là tên nội bộ của Nav2 sau khi remap. **Đừng** remap
`cmd_vel_smoothed` về `cmd_vel_nav` mà vẫn để `cmd_vel` trỏ vào đó —
`velocity_smoother` sẽ publish đúng lên topic nó đang subscribe (vòng lặp), và
`cmd_vel_nav` có hai publisher tranh nhau, làm hỏng luôn watchdog `nav_timeout`
của mode_manager.

Nav2 **không** được bypass ModeManager. Không publish thẳng controller output
vào STM32.

## Cảm biến vật cản (Phase 3)

```
RPLiDAR /scan                -> local costmap + global costmap
Astra   /camera/depth/points -> local costmap CHỈ (depth_obstacle_layer)
4x SR04T /ultrasonic/sonarN/range -> RViz khi bật display; sonar_layer hiện OFF
```

`navigation.launch.py` bật camera mặc định (`enable_camera:=true`). Bộ số
`camera_x/y/z/roll/pitch/yaw` **phải** là kết quả hiệu chỉnh của Phase 2 —
xem `docs/phase2-perception.md` mục 3. Sai pitch là sàn biến thành tường.

Kiểm chứng camera có thực sự đóng góp: `ros2 run orbbec_bringup costmap_contrib`.
Chi tiết trong `docs/phase3-nav2.md`.

## Tuning nhanh

- Odom trượt nhiều → tăng `alpha1..alpha4` trong `config/localization_params.yaml`.
- Bị "lost" giữa chừng → `recovery_alpha_slow: 0.001`, `recovery_alpha_fast: 0.1`
  đã bật recovery re-seeding; có thể tăng `max_particles`.
- LiDAR A3M1: `laser_max_range: 15.0` (spec 25 m trên bề mặt trắng, ~10 m vật
  tối) — khớp với costmap trong `robot_control/config/nav2_params.yaml`
  (raytrace 15 / obstacle 12). Đổi LiDAR thì sửa cả hai chỗ.
- Robot cắt cua → tăng `FollowPath.lookahead_dist`. Robot lượn rộng trong hành
  lang → giảm. Đừng xuống dưới `robot_radius`.
- Planner từ chối lối hẹp → giảm `GridBased.cost_travel_multiplier`, rồi mới
  tới `inflation_radius`.

## Acceptance tests trên robot THẬT — chưa cái nào chạy

Tier 1/2 (`bash scripts/verify robot`) chỉ chứng minh **config** nói đúng thứ
mình nghĩ. Nó không chứng minh gì về hành vi. Danh sách dưới đây là việc phải
làm trên xe thật, có người giám sát, tay đặt sẵn E-stop.

**A. AMCL**
1. Đặt "2D Pose Estimate" trong RViz.
2. Scan phải chồng khớp tường trên map đã lưu.
3. Chạy tới lui + xoay tại chỗ; `map -> odom` phải đủ ổn định, particle hội tụ.

**B. A→B không vật cản**
1. Smac sinh được path.
2. RPP bám path tới goal.
3. Không dao động, không oscillation quanh path.
4. `ros2 topic info /robot_01/cmd_vel_nav` — đúng **một** publisher.

**C. Vật cản LiDAR thấy**
1. Vật hiện trên cả global và local costmap.
2. Planner replan vòng qua nếu còn chỗ; nếu không thì dừng/fail an toàn.

**D. Vật thấp chỉ depth thấy**
1. Chỉ hiện trên local costmap.
2. Robot **dừng trước khi va**. Tự vòng KHÔNG phải yêu cầu của baseline.
3. Dọn vật đi → vết phải được clear khi robot quay mặt lại nhìn.
4. Thử: quay robot ra chỗ khác rồi dọn vật — xem vết có bị đóng băng không.
5. Rút camera giữa chừng → navigation phải tiếp tục bằng LiDAR (sonar hiện OFF).

**E. Sonar**
1. Test **từng** sonar một, riêng lẻ (che tay trước từng cái, xem `ros2 topic echo`).
2. Đo vùng mù chính giữa phía trước.
3. Đo vùng mù chính giữa phía sau.
4. Đo khoảng mù near-field (sát mặt sensor).
5. Kiểm tra cross-talk / nhiễu giữa 4 cái khi cùng bật.
6. Ghi lại pose đo được và cập nhật `sensors.xacro`.

**F. Reverse**
- `allow_reversing` và auto BackUp **vẫn tắt** cho tới khi E xong và rear
  coverage được ghi nhận bằng số đo thật.

**G. Camera tắt**
```
ros2 launch robot_navigation navigation.launch.py   robot_id:=robot_01 map:=/maps/campus_map.yaml enable_camera:=false
```
Nav2 phải lên đủ lifecycle, local costmap vẫn chạy bằng LiDAR (sonar hiện OFF).

**H. E-stop / manual override**
1. Teleop khi đang chạy nav → manual chiếm quyền, Nav2 goal bị cancel.
2. Gọi E-stop service → `cmd_vel` về 0 và giữ 0 cho tới khi reset.

Chỉ khi A–H xong mới được nói baseline "DONE". Trước đó là
**READY FOR HARDWARE TEST**.
