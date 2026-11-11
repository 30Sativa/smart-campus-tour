# Launcher `robot`: khởi động workflow không cần `export`/`source` tay

`robot/scripts/robot` (Python 3, chỉ thư viện chuẩn). **Chưa cài trên MiniPC**; phần cài đặt ở §6
chờ phê duyệt. Lệnh trong file này là quy trình, không phải sự cho phép vận hành: trạng thái
được phép chạy nằm ở [test-readiness-2026-11-10.md](test-readiness-2026-11-10.md).

## 1. Ý tưởng

**Mỗi tiến trình robot có môi trường riêng**, không phụ thuộc terminal đang đứng. Env được dựng
lại từ đầu mỗi lần chạy:

1. Một env sạch (chỉ `HOME`, `USER`, `LANG`, `TERM`, `DISPLAY`, và `PATH` hệ thống).
2. `robot/scripts/source-minipc` với `ROBOT_RUNTIME_ROOT=$SCT_ROBOT_ROOT`. Bước này nạp `.env`
   (domain, RMW, discovery, localhost) và **giữ nguyên các kiểm tra S3**; launcher không có bản
   logic DDS thứ hai.
3. **Tối đa một** overlay (`SCT_OVERLAY`).
4. Kiểm tra env sau khi dựng:
   - đủ `ROS_DOMAIN_ID`, `RMW`, `ROS_DISCOVERY_SERVER`;
   - không có `ROS_SUPER_CLIENT`;
   - mọi mục trong `AMENT_PREFIX_PATH` đều thuộc `/opt/ros/humble`, install gốc hoặc
     `SCT_OVERLAY`. Overlay nào trỏ sang workspace khác thì bị từ chối.

Biến từ shell người gọi (domain, overlay đã source, super client) **không lọt vào** env này.
`.bashrc` không bị đụng tới.

## 2. Lệnh

| Lệnh | Việc làm | Kết nối ROS? |
|---|---|---|
| `robot status` | Profile, overlay (+ `PROVENANCE` nếu có), DDS, package nào lấy từ đâu, `lidar_yaw` có dùng được không, các process robot/teleop/recorder (domain, namespace), log và dung lượng trống | **Không** (đọc file và `/proc`) |
| `robot env` / `robot shell` | In env sẽ dùng / mở `bash --norc` với env đó (prompt `[robot robot_01 d30]`) | Không |
| `robot manual` / `robot map` / `robot nav` | Chạy đúng một workflow (§3) | Launch thật |
| `robot teleop [--speed --turn]` | `teleop_twist_keyboard` → `/<ROBOT_ID>/cmd_vel_manual`; chạy độc lập với launch | Teleop |
| `robot stop` | **Dừng phần mềm** (`tools/ops/stopkey.py`) | Gọi service dừng |
| `robot preflight manual\|map\|nav [--static]` | `tools/preflight` với `--lidar-yaw` từ profile; chỉ tiến trình này là super client | Chỉ đọc |
| `robot record start\|stop [DIR]` | `tools/ops/record_session.sh`, mặc định vào thư mục phiên đang chạy | Ghi bag |
| `robot lidar-check -- --motor-power-off-confirmed --side … --front-cm … --rear-cm … --baseline-m …` | Kiểm tường tĩnh với **`LIDAR_YAW_CANDIDATE`** (domain 97 riêng) | Chỉ bật LiDAR |
| `robot calibration accept DIR [--yes]` | Đưa candidate thành `LIDAR_YAW` khi `DIR/verdict.txt` là PASS | Không (ghi profile, có backup) |
| `robot logs [prune [--yes]]` | Xem / dọn log phiên (§5) | Không |

`--dry-run` (với manual, map, nav, teleop, stop, preflight, record, lidar-check) in đúng argv và env
rồi thoát, không tạo thư mục, không lấy lock. `--dry-run` đặt sau `--` cũng vẫn được hiểu là chạy thử.

## 3. Một workflow mỗi lúc; teleop riêng

**`robot manual|map|nav` từ chối chạy khi:**
- lock `~/.local/state/sct-robot/workflow.lock` đang bị giữ. Tiến trình launch giữ lock qua
  `exec`, nên khi launch thoát là lock tự nhả;
- có bất kỳ process robot nào đang chạy, kể cả process khởi động tay ngoài launcher:
  `stm32_bridge_node`, `mode_manager_node`, `ekf_node`, `robot_state_publisher`,
  `rplidar_node`, SLAM, AMCL, `controller_server`, frontier explorer;
- `lidar_yaw` không dùng được cho chuyển động (§4);
- thiếu package của runtime. NAV2 cần `robot_nav_plugins` (LatchedGoalChecker), tức phải có overlay;
- còn dưới `MIN_FREE_GB` dung lượng trống.

**Lệnh khởi động** (giống lệnh baseline):

| Workflow | Lệnh |
|---|---|
| manual | `ros2 launch robot_control manual_mode.launch.py robot_id:=<ID> lidar_yaw:=<LIDAR_YAW>` |
| map | `… manual_mapping.launch.py … max_wheel_speed_mm_s:=<MAP_MAX_WHEEL_SPEED_MM_S> rviz:=false` |
| nav | `ros2 launch robot_navigation navigation.launch.py … map:=<MAP> enable_camera:=false rviz:=false nav2_params_file:=<NAV2_PARAMS>` |

**`robot teleop` từ chối chạy khi:**
- chưa có `mode_manager`, hoặc có hai `mode_manager`;
- `mode_manager` chạy ở domain hoặc namespace khác với profile;
- đã có một teleop khác (bàn phím hoặc gamepad).

Tốc độ bị chặn cứng: tối đa 0.30 m/s và 1.00 rad/s.

Launcher **không bao giờ** đặt `require_motion_permit`, không gửi `cmd_vel` hay goal, và không
khởi động motor ngoài lệnh launch mà người vận hành gõ.

## 4. Calibration LiDAR

| Trường hợp | Kết quả |
|---|---|
| `LIDAR_YAW` = giá trị của một baseline đã chạy trên robot (`robot-baseline-20261102`: −3.0695) | Dùng được |
| `LIDAR_YAW` khác, có `LIDAR_YAW_EVIDENCE` = thư mục kiểm tường với `verdict=PASS`, `tf_ok=True`, `candidate_rad` = giá trị này (so modulo 2π) | Dùng được |
| Mọi trường hợp khác, kể cả sửa tay `LIDAR_YAW=3.1241` | **Bị từ chối** cho manual, map và nav. Không có cờ nào bỏ qua được |

**Đường đi của candidate:**
1. `robot lidar-check …` (drive power off). Bước này luôn dùng `LIDAR_YAW_CANDIDATE`; `--lidar-yaw`
   truyền tay bị từ chối.
2. Nếu PASS: `robot calibration accept <thư mục kiểm>`. Lệnh này chỉ in ra thay đổi sẽ làm.
3. `robot calibration accept <thư mục kiểm> --yes`: ghi `LIDAR_YAW`, `LIDAR_YAW_EVIDENCE` và
   `LIDAR_YAW_PREVIOUS`, sao lưu `runtime.env.bak-<giờ>`.

**Rollback:** `cp runtime.env.bak-<giờ> ~/.config/sct-robot/runtime.env`.

Thêm một baseline mới vào `BASELINE_LIDAR_YAWS` là thay đổi code, phải qua review.

## 5. Log theo phiên

- Mỗi `robot manual|map|nav` tạo `SCT_LOG_ROOT/<YYYYmmdd_HHMMSS>_<workflow>/`, gồm:
  - `ros_log/`: `ROS_LOG_DIR` của launch;
  - `session.json`: argv, pid, env tóm tắt;
  - `.sct-session`: đánh dấu thư mục do launcher tạo.
- Teleop, stop và preflight ghi vào `ros_log_<tool>/` của phiên đang chạy. Bag ghi vào `bag/`
  của cùng phiên.
- `robot logs`: dung lượng từng phiên; `LIVE` khi pid trong `session.json` còn sống.
- `robot logs prune` (mặc định chỉ liệt kê; `--yes` mới xoá):
  - chỉ xét thư mục **có `.sct-session`**;
  - không xét phiên đang chạy (pid còn sống, hoặc đang giữ lock);
  - chọn phiên cũ hơn `LOG_KEEP_DAYS`, rồi tiếp phiên cũ nhất cho tới khi tổng dưới `LOG_MAX_MB`;
  - **chỉ xoá `ros_log/`**; bag, `session.json` và ghi chú được giữ lại.
- `~/.ros/log` (log của các lệnh gõ tay) không bị đụng tới; `robot status` không quản lý nó.

## 6. Cài đặt (CHƯA LÀM, chờ phê duyệt)

1. Tạo profile từ mẫu:
   ```bash
   mkdir -p ~/.config/sct-robot && cp robot/config/runtime.env.example ~/.config/sct-robot/runtime.env
   ```
   Điền giá trị hiện tại của MiniPC:
   - `SCT_ROBOT_ROOT=$HOME/smart-campus-tour/robot`;
   - `SCT_OVERLAY=$HOME/.cache/armtc/smoothws/install` (runtime đang chạy, **giữ nguyên**).
2. Đưa wrapper vào `PATH`, trỏ vào một bản **không đổi theo checkout**:
   ```bash
   ln -s <thư mục staged hoặc checkout đã review>/robot/scripts/robot ~/.local/bin/robot
   ```
   `~/.local/bin` đã nằm trong `PATH` của Ubuntu khi thư mục tồn tại.
3. Kiểm tra (không chạy gì trên robot): `robot status`, `robot manual --dry-run`, `robot nav --dry-run`.
   So env in ra với `bash -ic env` hiện tại.
4. `.bashrc` **không cần sửa**. Ba dòng hiện có vẫn chạy được; launcher không dùng chúng.

**Gỡ:** `rm ~/.local/bin/robot` (profile để lại không ảnh hưởng gì). Các lệnh `source` và
`ros2 launch` gõ tay vẫn dùng như trước.

## 7. Test offline

`robot/scripts/tests/test_robot_launcher.py`, chạy trong `robot/scripts/verify` tier 1.7.
- Dùng robot root giả với `.env` ở **domain 77**, install và overlay giả, và `/proc` giả
  (`SCT_PROC_ROOT`).
- Shell người gọi trong test cố tình mang `ROS_DOMAIN_ID=30`, `ROS_SUPER_CLIENT` và một
  `smoothws` giả, để chứng minh các biến này không lọt vào.
- Thay cho `exec` thật, test dùng một chương trình giả qua `SCT_ROBOT_TEST_EXEC` (biến chỉ
  dành cho test). Không có test nào khởi động ROS.
