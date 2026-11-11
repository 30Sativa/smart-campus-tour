# Ba workflow của robot thật: MANUAL, BUILD MAP, NAV2

Hướng dẫn cho người mới. Đọc hết trang này trước khi chạy bất cứ thứ gì. Lệnh ở đây là quy trình,
không phải sự cho phép vận hành. Trạng thái được phép chạy (bánh kê, trên sàn, có người hay
không) nằm ở [test-readiness-2026-11-10.md](test-readiness-2026-11-10.md).

## 1. Cấu trúc

```
                       manual_mode.launch.py  (LÕI CHUNG, mọi workflow)
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ robot_state_publisher  URDF (xacro, lidar_yaw)  -> /tf_static             │
  │ stm32_bridge           cmd_vel -> STM32; wheel/odom, imu/data, sonar      │
  │ ekf_filter_node        wheel/odom + imu/data -> odom, TF odom->base       │
  │ mode_manager_node      cmd_vel_manual | cmd_vel_nav -> cmd_vel (duy nhất)  │
  └──────────────────────────────────────────────────────────────────────────┘
        │ + lidar.launch.py (rplidar_node -> scan_raw -> scan_range_filter -> scan)
        │
  MANUAL      = lõi                       mode manual,  không map->odom
  BUILD MAP   = lõi + LiDAR + slam_toolbox  mode manual, SLAM phát map->odom
  NAV2        = lõi + LiDAR + map_server/AMCL + Nav2   mode explore, AMCL phát map->odom
  (auto_explore = BUILD MAP + Nav2 + frontier explorer: BLOCKED trên robot thật)
```

| Workflow | Launch | Package |
|---|---|---|
| MANUAL | `robot_control/launch/manual_mode.launch.py` | robot_control |
| BUILD MAP | `robot_control/launch/manual_mapping.launch.py` (gamepad + camera: `manual_mapping_gamepad_camera.launch.py`) | robot_control |
| NAV2 | `robot_navigation/launch/navigation.launch.py` (→ `localization.launch.py` + `nav2_bringup`) | robot_navigation |
| Mô phỏng | `sim_manual`, `sim_auto_explore` (robot_control), `sim_navigation` (robot_navigation) | Gazebo, không dùng hiệu chuẩn robot thật |

`test_workflow_launch_contract.py` khoá các điều trên. Test resolve launch thật, không chạy
process, và kiểm:
- mỗi workflow có đúng một nguồn phát `map→odom`;
- bridge không phát TF;
- có một mode_manager duy nhất;
- Nav2 chỉ ra `cmd_vel_nav`;
- tham số hiệu chuẩn tới đúng node.

## 2. Ai được cho robot chạy

Chỉ `mode_manager` phát `cmd_vel`.

| Lớp | Cơ chế | Thời gian |
|---|---|---|
| Teleop | `cmd_vel_manual` (bàn phím hoặc gamepad, chạy ở terminal riêng) | mode_manager dừng nếu 0.5 s không có lệnh mới |
| Nav2 | `cmd_vel_nav` (velocity_smoother) | 0.5 s. Ở mode `explore`, lệnh tay được ưu tiên và huỷ goal (`cancel_nav2_on_manual`) |
| Dừng phần mềm | service `emergency_stop`; `tools/ops/stopkey.py` (Enter = dừng + huỷ mọi goal) | ép `cmd_vel = 0` mỗi chu kỳ |
| Bridge / firmware | STM32 tự dừng sau 300 ms không nhận lệnh | 300 ms |
| E-stop phần cứng | cắt nguồn driver (PA10). **Chưa đo (A10)**; firmware vẫn phát xung khi E-stop đang bấm | — |

Gamepad yêu cầu giữ nút enable (`gamepad_teleop.yaml`). Bàn phím không có deadman riêng, nên
dựa vào timeout 0.5 s. Chỉ chạy **một** workflow mỗi lúc: preflight FAIL khi thấy hai bridge hoặc
SLAM và AMCL cùng chạy.

## 3. Hiệu chuẩn

| Tham số | Khai báo ở | Mặc định | Baseline 02/11 | Ghi chú |
|---|---|---|---|---|
| `lidar_yaw` (rad) | mọi launch phần cứng | −0.2225 (góc lắp trước 20/10) | **−3.0695** | Candidate 3.1241. Launch in **cảnh báo** khi không truyền. URDF mặc định 0 (sim) |
| `wheel_base` | mọi launch phần cứng, bridge | 0.4714 | 0.4714 | Giá trị hiệu dụng; CAD 0.4325 |
| `wheel_radius` | như trên | 0.09725 | 0.09725 | |
| `odom_linear_scale` | như trên | 1.0 | 1.0 | Localization V2 candidate. Chỉ nhân quãng đường |

- Truyền tham số trên dòng lệnh của launch ngoài cùng; mọi launch con đều được chuyển tiếp
  tường minh.
- `preflight.py` FAIL nếu TF `base_link→lidar_link` khác `--lidar-yaw` (so modulo 2π).
- Không đổi mặc định trong launch khi giá trị mới chưa HARDWARE VALIDATED.

## 4. Config dùng ở đâu

| File | Dùng bởi |
|---|---|
| `robot_control/config/nav2_params_v2.yaml` | NAV2 trên robot thật (baseline). Truyền bằng `nav2_params_file:=` |
| `robot_control/config/nav2_params.yaml` | Mặc định của `navigation.launch.py`, `auto_explore`, mô phỏng. **Không** dùng cho robot thật |
| `robot_navigation/config/localization_params.yaml` | AMCL baseline (mặc định) |
| `robot_navigation/config/localization_params_v2.yaml` | Localization V2 candidate (chỉ khác `update_min_d/a`) |
| `robot_control/config/ekf.yaml` | EKF wheel + IMU (mặc định). `ekf_wheel_only.yaml` là thí nghiệm |
| `robot_control/config/slam_toolbox_online_async.yaml` | BUILD MAP |
| `robot_control/config/scan_range_filter.yaml` | Lọc thân xe < 0.20 m (NaN), dùng cho mọi workflow có LiDAR |
| `robot_control/config/mode_manager.yaml` | Mode manager |
| `robot_control/config/gamepad_teleop.yaml` | Gamepad (0.20 / 0.30 m/s, 0.8 / 1.2 rad/s) |

Nav2 V1 (`nav2_params_smooth.yaml`) đã bị xoá khỏi source ngày 02/11. File vẫn còn trong tag
`nav2-baseline-v1` và trong overlay `smoothws`.

## 5. Chạy từng workflow

**Môi trường terminal:** mỗi terminal là terminal mới. Dòng dưới là runtime hiện tại; khi đã có
overlay staged thì làm theo [runtime-deploy.md](runtime-deploy.md):

```bash
export ROBOT_RUNTIME_ROOT="$HOME/smart-campus-tour/robot"; source "$HOME/sct-r3-deploy/robot/scripts/source-minipc"; source "$HOME/.cache/armtc/smoothws/install/setup.bash"; unset ROS_SUPER_CLIENT
```

**Mở sẵn cho mọi workflow:**
- `python3 robot/tools/ops/stopkey.py /robot_01` ở một terminal riêng;
- ghi bag trước khi chạy: `robot/tools/ops/record_session.sh start ~/amr_logs/runs/<phiên>`.

Đường dẫn `robot/...` ở trang này tính từ một checkout chứa các tool này: branch này, hoặc
`~/sct-test-ready` cho đến khi merge.

| Workflow | Launch | Preflight (trước khi bất cứ thứ gì chạy) |
|---|---|---|
| MANUAL | `ros2 launch robot_control manual_mode.launch.py robot_id:=robot_01 lidar_yaw:=<rad>` | `python3 robot/tools/preflight/preflight.py manual --lidar-yaw <rad>` |
| BUILD MAP | `ros2 launch robot_control manual_mapping.launch.py robot_id:=robot_01 lidar_yaw:=<rad> max_wheel_speed_mm_s:=250.0` | `preflight.py mapping --lidar-yaw <rad>` |
| NAV2 | lệnh trong [robot-baseline-2026-11-02.md](robot-baseline-2026-11-02.md) §2, kèm `lidar_yaw:=<rad>` | `preflight.py navigation --lidar-yaw <rad>`, sau khi đặt 2D Pose Estimate |

**Teleop** (MANUAL và BUILD MAP):

```bash
ros2 run teleop_twist_keyboard teleop_twist_keyboard --ros-args -r cmd_vel:=/robot_01/cmd_vel_manual -p speed:=0.1 -p turn:=0.3
```

Khi không có `robot_id`, topic là `/cmd_vel_manual`.

**Kết quả của BUILD MAP:** lưu map vào thư mục phiên, **không** lưu vào `robot/robot_maps/`.
Cách đưa một map mới vào dùng: [../robot_maps/README.md](../robot_maps/README.md).

**Goal NAV2:** gửi bằng `robot/tools/route_test/route_test.py` (tuyến dùng POI trong
`robot_maps/`). Mỗi lúc chỉ một nơi gửi goal.

**Dừng:** Ctrl+C route/goal → `record_session.sh stop <phiên>` → launch. Luôn dùng SIGINT. Chỉ đọc
bag sau khi recorder báo đã đóng.

## 6. Công cụ

| Công cụ | Việc | Ghi/điều khiển? |
|---|---|---|
| `tools/preflight/preflight.py` | Kiểm process, TF, tần số topic, CPU, mode, E-stop, lifecycle/AMCL | Chỉ đọc |
| `tools/ops/stopkey.py` | Dừng phần mềm + huỷ goal | Gọi service dừng |
| `tools/ops/record_session.sh` | Ghi bag một phiên | Ghi bag |
| `tools/lidar_calibration/static_lidar_check.sh` | Kiểm góc LiDAR bằng tường, khi nguồn động lực đã cắt | Chỉ bật LiDAR, ở domain riêng |
| `tools/nav2_bench/verify_params.sh` | Tham số Nav2 và TF mà stack đang chạy thực sự nạp | Chỉ đọc |
| `scripts/runtime_provenance.py` | Mỗi package đang lấy từ đâu, có khớp git ref không | Chỉ đọc |
| `scripts/stage-runtime` | Build overlay bất biến từ một commit | Chỉ thư mục mới |
| `tools/route_test`, `tools/nav2_bench`, `tools/odom_calibration` | Gửi tuyến; đo Nav2; hiệu chuẩn odom | Gửi goal / chỉ đọc |
| `tools/*.ps1` | Bring-up motor trên Windows qua USB (lịch sử, `stm32_bridge/README.md`) | Điều khiển motor trực tiếp |

## 7. Kiểm tra mã nguồn

```bash
robot/scripts/verify          # tier 1 + tier 2 khi đã source ROS
```

Các lỗi đã biết có sẵn trên `origin/main` được ghi trong báo cáo cleanup. Một lỗi mới phải sửa
trước khi merge.
