# Nav2 Baseline V1 (robot AMR, chốt 2026-10-16)

**Mức:** baseline **phát triển và kiểm thử**, đã chạy trên robot thật. **Chưa
phải production-ready.** Launch mặc định vẫn là `nav2_params.yaml`. Baseline V1
là opt-in qua `nav2_params_file`.

## 1. Định nghĩa

Code nằm ở `main` @ `5976d44` (PR #56 + #57). Phần ROS giống từng byte với
`dfcf889`, chính là bản đã chạy trong các lượt B2 và B2c.

| Thành phần | Nơi định nghĩa | Giá trị V1 |
|---|---|---|
| Hiệu chỉnh yaw LiDAR | launch `lidar_yaw` trong `robot_control/launch/manual_mode.launch.py` và `robot_navigation/launch/navigation.launch.py` (URDF mặc định 0 cho sim) | −0.2225 rad (−12.75°) |
| Tham số Nav2 | `robot_control/config/nav2_params_smooth.yaml` = `nav2_params_wide_global_inflation.yaml` (global inflation 1.50/2.0) + 2 thay đổi | xem dưới |
| Goal checker | `robot_nav_plugins::LatchedGoalChecker` (package `robot_nav_plugins`) | xy 0.15, yaw 0.30, stateful; `latched_xy_tolerance` 0.35, `relatch_distance` 0.10, `relatch_max_gap` 1.0 s |
| Tốc độ | `FollowPath.desired_linear_vel` | 0.20 m/s (trần velocity_smoother vẫn 0.24) |

Mọi tham số khác giống baseline wide-inflation: RPP, costmap, AMCL, EKF, BT
(không BackUp), velocity_smoother, collision detection.

**Khoá cấu hình:** `robot_control/test/test_nav2_baseline_v1_contract.py` ghim
sha256 của nội dung YAML đã chuẩn hoá
(`3a1f5b48e735273a913a96feb228b5d3797ff7908f2ba5c34010b737ebfa3d5b`), tốc độ,
tham số latch và `lidar_yaw`.

- Muốn đổi giá trị nào → làm **Baseline V2** (file/mục mới), không sửa V1.
- Comment và định dạng trong YAML thì được phép đổi.
- **Phạm vi khoá:** test chỉ khoá giá trị tham số và `lidar_yaw`. Hành vi của
  `LatchedGoalChecker` được giữ bằng 13 gtest của `robot_nav_plugins`, không
  khoá bằng hash. Thay đổi hành vi plugin hoặc hiệu chỉnh LiDAR cũng tính là
  phiên bản baseline mới.

**Phiên bản và tag:**

- Tag `nav2-baseline-v1` được gắn **sau khi PR baseline merge**, trên commit
  thực tế của `main` chứa doc này. Không tag trên commit của branch, vì nếu
  squash-merge thì commit đó không nằm trên `main`.
- Phiên bản sau dùng `nav2-baseline-v2`, … kèm doc và hash mới.
- Không di chuyển hay xoá tag đã đẩy lên.

## 2. Chạy

```bash
cd ~/smart-campus-tour && source robot/scripts/source-minipc
ros2 launch robot_navigation navigation.launch.py robot_id:=robot_01 \
  map:="$HOME/smart-campus-tour/robot/robot_maps/map2.yaml" enable_camera:=false rviz:=false \
  nav2_params_file:=$(ros2 pkg prefix robot_control)/share/robot_control/config/nav2_params_smooth.yaml
```

Install phải được build từ commit có `robot_nav_plugins`.

**Điều kiện bắt buộc khi robot tự hành.** Bằng chứng: mục 4, B2 và B2c.

- **Không** đặt `ROS_SUPER_CLIENT` cho lệnh launch. Biến này chỉ dành cho CLI
  (xem `robot/scripts/source-minipc`).
- **Không có node ROS nào trên máy khác** (laptop, RViz, `remote_rviz.launch.py`,
  `ros2 topic echo`…) đang subscribe dữ liệu của robot.
  - RViz chỉ dùng để đặt initial pose khi robot đứng yên, rồi **dừng cả launch**.
    Đóng cửa sổ RViz không dừng `scan_rviz` / `tf_rviz_relay`.
  - Kiểm tra trước khi chạy:

    ```bash
    ROS_SUPER_CLIENT=TRUE ros2 node list
    ```

    Không được có `scan_rviz`, `tf_rviz_relay`, `rviz2`.
- Kiểm tra sau khi launch:
  - `tf2_echo base_link lidar_link` cho yaw khoảng −12.75°;
  - `launch.log` có `LatchedGoalChecker ... relatch_max_gap 1.00 s`;
  - `FollowPath.desired_linear_vel` = 0.2.

**Rollback:**

- Launch với `nav2_params_wide_global_inflation.yaml`.
- Hoặc đổi khi đang chạy:
  - `goal_checker.relatch_distance` = 0 và `goal_checker.latched_xy_tolerance`
    = 0.15 → hành vi như `SimpleGoalChecker`;
  - `FollowPath.desired_linear_vel` = 0.24.
- Bỏ hiệu chỉnh LiDAR: `lidar_yaw:=0.0`.

## 3. Hành vi kỳ vọng (để so khi kiểm chứng lại)

Đo trên tuyến START ↔ POI_01, map2, khi không có subscriber từ xa (B2c):

| Chỉ số | V1 (B2c) | Cách đo |
|---|---|---|
| Thời gian một lượt | 81.6 / 83.5 s | `trips.py` |
| Huỷ FollowPath / recovery / dừng ≥ 0.5 s | 0 / 0 / 0 | `metrics.py`, `launch.log` |
| Quay tại chỗ ở đích | 1 lần (khoảng 120°, do yaw POI) | `smooth.py` |
| Sai số lúc báo thành công | 0.11 m / 0.08 m | pose AMCL lúc `Goal succeeded` |
| Cảnh báo bridge chạm giới hạn bánh | 0–11 mỗi lượt (0.24 m/s ở A/B1: 480–631) | `/rosout` |
| Khoảng hở footprint khi chạy | ≥ 0.60 m | `metrics.py` |
| Lệch tâm hành lang; lệch góc LiDAR còn lại | ±0.03 m; ≤ ±1° | `metrics.py`, `wallrate.py` (trừ yaw `tf_static`) |
| `/scan` hở > 0.3 s; scan thô bị mất | 0; 0 | `scanprobe` + `diag_scan.py` |

## 4. Bằng chứng (tóm tắt)

| Lượt | Cấu hình | Kết quả chính |
|---|---|---|
| 15/10 | 0.24 m/s, LiDAR **chưa** sửa | robot chạy lệch trái 0.27–0.39 m, AMCL lệch ngang p90 0.26–0.27 m |
| A | 0.24, Simple, LiDAR sửa | giữa hành lang ±0.02 m; 44 % lệnh chạm giới hạn bánh; `/scan` hở 14 lần |
| B1 | 0.24, Latched | latch được giữ khi AMCL trôi quá 0.15 m (robot chỉ dịch 0.6 cm); `/scan` hở 14 lần |
| B2 | 0.20, Latched | hết chạm giới hạn bánh, gia tốc góc lệnh giảm một nửa; `/scan` hở 27 lần, bộ lọc kẹt trong `sock_alloc_send_pskb` |
| **B2c** | **0.20, Latched, không có node ở xa** | **0 lần `/scan` hở, 0 lần huỷ, 0 recovery**, dù robot chuyển AP 2 lần |

- Mô phỏng Nav2 thật: 0/10 lượt quay qua lại ở đích, so với 2/6 lượt của
  `SimpleGoalChecker`.
- `robot_nav_plugins`: 13 gtest, 8/8 mutant bị bắt.

Dữ liệu thô (bag 0.6–1.9 GB, chỉ có trên miniPC) và gói bằng chứng kèm checksum,
công cụ phân tích nằm ở `$HOME/amr_logs/baselines/nav2_baseline_v1/`
(`MANIFEST.md`).

## 5. Trạng thái kiểm thử khi chốt (16/10)

- **Build sạch** 4 package (`robot_description`, `robot_control`,
  `robot_navigation`, `robot_nav_plugins`); `robot_nav_plugins` không có cảnh
  báo.
- **Test của baseline đạt:**
  - `robot_nav_plugins` 13/13 gtest;
  - `test_nav2_baseline_v1_contract.py` 4/4;
  - `test_nav2_smooth_contract.py` 6/6;
  - `test_lidar_calibration_contract.py` 5/5.
- **Lỗi có sẵn trên `main`, không do baseline** (không file nào bị PR #56/#57
  hay commit baseline sửa):
  - `robot_control` `test_nav2_baseline_contract.py::test_lidar_clears_no_returns_without_clearing_near_range_rejects`
    (`KeyError: '/**/scan_filter_chain'`);
  - 5 lỗi `ament_copyright` trong `robot_description` (launch display/gazebo
    và 3 file test);
  - `robot/scripts/verify` tier 1.4: `sensors.xacro` parse riêng lẻ lỗi (file
    dùng macro định nghĩa ở file khác).
- **Chưa chạy:**
  - tier 2 (`colcon build` toàn workspace);
  - `ruff` (không cài trên miniPC).

## 6. Giới hạn đã biết

1. **Nghẽn DDS qua Wi-Fi (chưa sửa ở tầng kỹ thuật).**
   - Fast DDS publish đồng bộ: một subscriber ở máy khác, khi Wi-Fi yếu hoặc
     chuyển AP, chặn publisher `/scan`.
   - Hệ quả: AMCL mất dữ liệu tới 2.5 s, FollowPath bị huỷ.
   - Hiện chỉ tránh bằng quy trình (mục 2).
2. **Số lượt thử ít.** 1 vòng sạch (B2c) và 1 vòng có nhiễu (B2), trên một tuyến,
   một map, ở 0.20 m/s. Chưa thử tuyến/POI khác, chưa thử có người đi lại nhiều.
3. **Yaw của POI** buộc robot quay khoảng 120° ở cả hai đích. Đây là lựa chọn
   sản phẩm, chưa chỉnh.
4. **Nhánh Bắc của map khớp kém** (36–39 % điểm scan). AMCL ở POI_01 có lúc trôi
   khoảng 0.2 m khi robot quay tại chỗ.
5. **Đường dừng khẩn phần mềm** (`mode_manager` `emergency_stop` cùng huỷ goal)
   mới kiểm chứng trong mô phỏng, chưa thử chủ động trên robot thật. E-stop phần
   cứng chưa có chức năng.
6. **Chưa giải thích:** EKF chỉ 20 Hz ở B2 (23–25 Hz ở các lượt khác). Chưa ảnh
   hưởng controller.
7. 0.20 m/s chậm hơn khoảng 15 % so với 0.24.

## 7. Việc tiếp theo

1. Sửa gốc giới hạn 1:
   - relay hiển thị chạy trên robot;
   - profile Fast DDS chỉ dùng transport nội bộ cho stack điều khiển.

   Kiểm chứng bằng một lượt có RViz từ xa đi qua vùng chuyển AP.
2. Thêm 2–3 vòng sạch, gồm ít nhất một tuyến/POI khác. Đạt thì mới đề xuất V1
   (hoặc V2) làm mặc định.
3. Chốt yaw của POI; xem lại map nhánh Bắc.
