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

**`--dry-run` ở bất kỳ vị trí nào** (trước lệnh con, sau lệnh con, sau `--`, lặp lại) đều biến
**mọi** lệnh thành chạy thử. Chạy thử chỉ in argv và env; không khởi động tiến trình, không tạo
thư mục hay lock, không ghi profile, không xoá log, không gọi ROS. Riêng:
- `calibration accept --yes` và `logs prune --yes` kèm `--dry-run` vẫn chỉ liệt kê;
- `shell --dry-run` chỉ in env.

Test chạy đủ 13 lệnh × 3 vị trí, rồi kiểm cây file không đổi và chương trình exec giả không chạy.

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

**`fleet_bridge`.** Launcher đọc `commands_enabled` từ chính các `--params-file` của tiến trình đang
chạy (qua `/proc`, không gọi ROS); file sau ghi đè file trước, giống ROS.
- `robot nav` **từ chối** khi giá trị là `true`: sẽ có hai nơi gửi goal, và ADR-0049 khi đó còn
  đòi `require_motion_permit`.
- `robot nav` cũng **từ chối** khi không xác định được giá trị, ví dụ một file tham số đã bị xoá.
- Khi giá trị là `false` (telemetry), `robot nav` chạy kèm một dòng ghi chú.
- `robot status` in `commands_enabled` của từng `fleet_bridge` đang chạy.

Kiểm tra ngày 11/11 trên MiniPC: `fleet_bridge` (khởi động 17:10) chạy với `fleet_bridge.yaml` đã
cài (`commands_enabled: false`) cộng file tham số do launch tạo (URL, `robot_code`, `map_key`,
`frame_id`). Như vậy nó chỉ gửi telemetry.

**Lock và nhận diện tiến trình:**
- Lock là `flock`, nên được nhả khi tiến trình chết. File lock còn sót lại đọc ra là "trống"
  (`status` thăm dò bằng shared lock trên fd chỉ đọc, không ghi gì).
- Phiên được coi là còn sống khi **cả** pid **lẫn** start time trong `/proc/<pid>/stat` đều khớp,
  nên pid bị tái sử dụng không giữ phiên cũ "sống", và log của nó có thể được dọn.
- Tiến trình khởi động tay ngoài launcher được phát hiện qua `/proc`, nhưng chỉ các tiến trình
  của cùng user; tiến trình chạy bằng root không thấy được.

**Stop key** báo `SOFTWARE STOP NOT AVAILABLE … PRESS THE HARDWARE E-STOP` nếu sau 5 s không
với tới được `mode_manager`.

Launcher **không bao giờ** đặt `require_motion_permit`, không gửi `cmd_vel` hay goal, và không
khởi động motor ngoài lệnh launch mà người vận hành gõ.

## 4. Calibration LiDAR

Đã từng chạy **không có nghĩa** là đã kiểm chứng. Launcher phân biệt ba trạng thái. Từ 12/11 (demo đồ án) trạng thái chỉ được **cảnh báo**, không chặn workflow nào; bảng dưới là thiết kế ban đầu:

| Trạng thái | Khi nào | manual | map | nav |
|---|---|---|---|---|
| `validated` | `LIDAR_YAW_EVIDENCE` = thư mục kiểm tường có `verdict=PASS`, `tf_ok=True`, `candidate_rad` = giá trị này (so modulo 2π) | được | được | được |
| `legacy_baseline` | Giá trị của một baseline đã từng chạy (`robot-baseline-20261102`: −3.0695), chưa ai kiểm | được (MANUAL không dùng LiDAR) | **từ chối** | **từ chối** |
| `unverified` | Mọi trường hợp khác, kể cả sửa tay `LIDAR_YAW=3.1241` | từ chối | từ chối | từ chối |

- Không có cờ nào bỏ qua được bảng trên.
- **Tái hiện baseline 02/11 vẫn làm được**, bằng lệnh launch gõ tay trong
  `robot-baseline-2026-11-02.md` §2 (tag `robot-baseline-20261102`). Launcher không tự cho phép
  map/nav với giá trị chưa kiểm chứng.

**Đường đi của candidate:**
1. `robot lidar-check …` (drive power off). Bước này luôn dùng `LIDAR_YAW_CANDIDATE`; `--lidar-yaw`
   truyền tay bị từ chối.
2. Nếu PASS: `robot calibration accept <thư mục kiểm>`. Lệnh này chỉ in ra thay đổi sẽ làm.
3. `robot calibration accept <thư mục kiểm> --yes`: ghi `LIDAR_YAW`, `LIDAR_YAW_EVIDENCE` và
   `LIDAR_YAW_PREVIOUS`, sao lưu `runtime.env.bak-<giờ>`.

**Rollback:** `cp runtime.env.bak-<giờ> ~/.config/sct-robot/runtime.env`.

Thêm một giá trị vào `LEGACY_BASELINE_LIDAR_YAWS` là thay đổi code, phải qua review.

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
2. Tạo một **release chỉ chứa tool** từ commit đã review (bất biến, chỉ đọc, không build ROS),
   rồi đưa wrapper vào `PATH`:
   ```bash
   robot/scripts/stage-runtime <tag-hoặc-sha> --tools-only        # -> ~/.cache/sct-runtime/tools-<sha>/
   ln -s ~/.cache/sct-runtime/tools-<sha>/robot/scripts/robot ~/.local/bin/robot
   ```
   `robot status` in dòng `launcher release … (commit: …)`. Nếu dòng này là `CHECKOUT … (follows
   edits …)` thì launcher đang chạy từ một worktree có thể thay đổi.
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

## 8. Tour từ web: `robot nav --fleet`, `robot fleet`, `robot reset-latch`

Dành cho demo đồ án: bấm "Bắt đầu Tour" trên web, backend tạo lệnh, `fleet_bridge` nhận lệnh, Nav2 chạy.

| Lệnh | Việc làm |
|---|---|
| `robot fleet` | Chạy `fleet_bridge` chỉ gửi telemetry (web hết báo "chưa gửi telemetry"). Cấu hình đọc từ `FLEET_ENV_FILE` (mặc định `~/.config/campustour/fleet-sync.env`); `--dry-run` không in giá trị |
| `robot nav --fleet` | NAV2 kèm cổng `motion_permit` (ADR-0049): mất liên lạc với backend thì robot tự dừng. Cần runtime có cổng này (overlay build từ `main`); `smoothws` không có nên bị từ chối |
| `robot fleet --commands` | `fleet_bridge` nhận Tour từ web (`commands_enabled`, `report_period_sec` 0.5). Cần một phiên `robot nav` đang chạy. Nếu phiên đó không có `--fleet`, launcher nhắc rằng khi mất mạng giữa chặng thì robot vẫn đi tiếp tới đích |
| `robot reset-latch` | Mở cổng `motion_permit` sau khi người đứng tại robot thấy an toàn (chỉ có tác dụng với `nav --fleet`) |

Vì đây là demo, các kiểm tra chỉ mang tính thủ tục đã thành cảnh báo:
- `lidar_yaw` chưa kiểm chứng: `map` và `nav` vẫn chạy, kèm cảnh báo;
- `fleet_bridge` đang bật lệnh khi khởi động `nav`: chỉ cảnh báo.

Vẫn bị chặn: hai workflow cùng lúc, hai `fleet_bridge` cùng lúc, `fleet --commands` khi chưa có `nav`.

Hai công tắc phía backend vẫn cần bật cho buổi test:
- `FleetCommands__Enabled=true`: biến môi trường của backend, rồi restart;
- "Cho phép điều phối" trong trang Robot của Technical Staff (`IsDispatchEnabled`).
