# Sẵn sàng test thực tế: MANUAL, BUILD MAP, NAV2 (10/11/2026)

Branch `feature/claude/robot-test-ready` (từ `origin/main` 5405c879). **Chưa deploy, chưa merge,
chưa chạy trên robot.**
- Lệnh trong file này là quy trình, **không** phải sự cho phép vận hành (`robot/AGENTS.md`).
- Baseline giữ nguyên: Nav2 V2 (`nav2-baseline-v2`), AMCL `localization_params.yaml`,
  `ekf.yaml`, wheel odometry, và mặc định launch `lidar_yaw` −0.2225.
- Candidate `lidar_yaw:=3.1241` là OFFLINE VALIDATED, **chưa** HARDWARE VALIDATED.

## 1. Kết luận

| Workflow | Trạng thái | Còn thiếu cho bước tiếp |
|---|---|---|
| MANUAL | **READY FOR CONTROLLED MOTION TEST, chỉ khi bánh kê khỏi sàn.** Trên sàn: **BLOCKED** | A10 (§4.1) |
| BUILD MAP (lái tay) | **READY FOR STATIC HARDWARE TEST.** Chạy trên sàn: **BLOCKED** | A10; kiểm tường tĩnh PASS (§3); MANUAL trên sàn PASS |
| BUILD MAP tự hành (`auto_explore`) | **BLOCKED** | collision_monitor, motion permit, tham số Nav2 V2. Ngoài phạm vi đợt này |
| NAV2 | **READY FOR STATIC HARDWARE TEST.** Chạy: **BLOCKED** | A10; kiểm tường tĩnh PASS; MANUAL trên sàn PASS; quyết định link-safety (§4.2) |

Cả ba đều đã qua mức **READY FOR OFFLINE TEST**: test contract, preflight và kiểm tường tĩnh
đều PASS trên dữ liệu giả và trên replay bag (§6).

**Test được với runtime hiện tại, không cần deploy branch này.** Đã resolve các launch trong
overlay `smoothws` đang chạy: truyền `lidar_yaw:=3.1241` thì giá trị tới URDF ở cả
`manual_mode`, `manual_mapping` và `navigation`.

Nhưng runtime hiện tại **không cảnh báo** khi quên tham số này: nó âm thầm dùng −0.2225. Vì vậy:
- **luôn** truyền `lidar_yaw:=3.1241`;
- **luôn** chạy preflight, vì preflight FAIL khi TF sai.

## 2. Thay đổi trong branch

| Commit | Nội dung |
|---|---|
| `b0c65f3f` | Ba launch mapping/explore khai báo và chuyển tiếp `lidar_yaw`, `wheel_base`, `wheel_radius`, `odom_linear_scale`, cùng tên và mặc định như `manual_mode`/`navigation`. Mỗi launch phần cứng in **một cảnh báo** khi không truyền `lidar_yaw`; mặc định không đổi. Khôi phục `odom_linear_scale` trong `stm32_bridge.launch.py`, bị mất khi file được thay ở commit pan-tilt (cùng hunk với link-safety). Thêm test `test_workflow_launch_contract.py` |
| `4bb15883` | `tools/preflight/preflight.py` (chỉ đọc) và `tools/lidar_calibration/` (kiểm tường tĩnh), có test |

Đính chính báo cáo trước:
- Trước sửa, `lidar_yaw:=` truyền trên dòng lệnh **vẫn** tới được `manual_mode`, vì các include
  dùng chung launch context. Lỗi thật là: tham số không được khai báo, không hiện trong
  `--show-args`, và không có cảnh báo khi bị bỏ quên.
- Link-safety `c4a9b4bf` merge vào branch này **không xung đột**; 51 test launch/contract
  pass trên cây đã merge.

**Contract đã kiểm** (resolve launch thật, không chạy process):
- `lidar_yaw` tới URDF;
- wheel_base, wheel_radius, odom scale tới bridge;
- `publish_tf` của bridge là false: EKF là nơi duy nhất phát `odom→base_footprint`;
- `map→odom` có đúng một nguồn: mapping là slam_toolbox, NAV2 là AMCL, MANUAL không có;
- có một mode_manager duy nhất, Nav2 chỉ ra `cmd_vel_nav`;
- mode khởi động: `manual` cho MANUAL và mapping, `explore` cho NAV2 và explore.

**Quyền điều khiển:** chỉ mode_manager phát `cmd_vel`. Nó nhận `cmd_vel_manual` (teleop) và
`cmd_vel_nav` (Nav2).
- Ở `explore`, lệnh tay được ưu tiên và huỷ goal Nav2 (`cancel_nav2_on_manual`).
- Timeout 0.5 s cho mỗi nguồn; firmware tự dừng sau 300 ms không nhận lệnh.
- `emergency_stop` (service) ép `cmd_vel = 0` mỗi chu kỳ.

**Ghi chú nhỏ:** `navigation.launch.py` truyền `enable_teleop` sang `manual_mode`, nhưng
`manual_mode` không khai báo tham số này, nên nó không có tác dụng. Teleop luôn chạy riêng ở
terminal khác.

## 3. Kiểm tĩnh góc LiDAR 3.1241 (không chạy motor)

1. Tắt **toàn bộ** stack robot. Script từ chối chạy nếu thấy bridge, mode_manager, rplidar,
   SLAM hoặc Nav2 đang chạy.
2. **Cắt nguồn động lực**: bấm E-stop hoặc ngắt nguồn driver HBS57H. Đẩy tay robot song song
   một bức tường thẳng dài ≥ 2 m, cách 0.8–1.5 m.
3. Đo bằng thước, chính xác ±2 mm, từ tường tới **tâm trục bánh trước và bánh sau** cùng phía
   tường, và đo khoảng cách giữa hai điểm đo. Hai điểm càng xa nhau càng tốt: 1 cm sai số thước
   trên 0.6 m tương ứng khoảng 1°.
4. Chạy lệnh dưới đây. Script chỉ bật rplidar_node và robot_state_publisher ở domain 97,
   localhost-only, không ảnh hưởng hệ thống khác. Kết quả lưu ở
   `~/amr_logs/runs/<giờ>_static_lidar_check/`.

```bash
bash $R/robot/tools/lidar_calibration/static_lidar_check.sh --motor-power-off-confirmed \
  --side right --front-cm <F> --rear-cm <R> --baseline-m <L> --lidar-yaw 3.1241
```

| Kết quả | Ý nghĩa | Việc tiếp |
|---|---|---|
| `== PASS` (lệch ≤ 1.5°, TF đúng) | Xác nhận candidate | Sang §5 |
| `INCONCLUSIVE` (1.5–3°) | Chưa kết luận được | Đo lại thước, hoặc đổi bức tường |
| `FAIL` (> 3°) | Giá LiDAR đã xoay | Dừng; không chạy mapping/NAV2 với 3.1241 |
| Gần −175.9° | Giá LiDAR đã đổi sau 02/11 | Dừng, xem lại |

## 4. An toàn

### 4.1 E-stop A10 (ADR-0049): **CHƯA ĐO, chặn mọi chạy trên sàn**

**Hiện trạng** (ADR-0049 §10):
- E-stop cắt nguồn qua PA10 / `J_3V3_AUX`. Owner báo hoạt động từ 08/11, chưa có số đo.
- Firmware **vẫn phát xung STEP** khi E-stop đang bấm. Phần mềm không biết E-stop đang bấm.
- Nhả E-stop thì nguồn có lại **ngay lập tức**.
- STM32 reset thì PA10 tự bật lại.

**Cách giải quyết tối thiểu: đo tĩnh, bánh kê khỏi sàn, không lệnh chuyển động.**
1. Stack tắt (server off). Đo điện áp nguồn driver HBS57H khi bấm và khi nhả E-stop.
2. Lặp lại khi bridge chạy với `cmd_vel = 0`. Thử quay bánh bằng tay khi đang bấm.
3. **PASS:** nguồn driver về 0 V khi bấm, ở cả hai trường hợp. Ghi số đo vào
   `~/amr_logs/runs/<giờ>_A10/`.

**Quy tắc nhả E-stop** cho tới khi làm bước 3.4:
1. Gọi `stopkey.py`: `emergency_stop = true` và huỷ mọi goal.
2. Kiểm tra action status không còn goal nào.
3. Nhả E-stop phần cứng.
4. Cuối cùng mới nhả `emergency_stop`.

Không bao giờ nhả E-stop khi còn lệnh khác 0.

### 4.2 Link-safety: **chưa deploy**

- Runtime đang dùng bridge cũ: mất FB thì dừng một lần, có lại link là có thể chạy tiếp.
  Firmware tự dừng sau 300 ms không nhận lệnh.
- Bản sửa `c4a9b4bf` giữ trạng thái dừng cho tới khi dừng lệnh. Bản này đã test offline, merge
  sạch với branch này, nhưng **chưa review, chưa deploy**.

**Cách giải quyết tối thiểu**, chọn một trong hai:
- (a) Anh review và cho deploy `c4a9b4bf`, rồi chạy test bánh kê (rút cáp USB STM32 khi đang
  teleop, robot phải đứng yên và không tự chạy lại khi cắm lại).
- (b) Ghi rõ chấp nhận hành vi cũ cho test có người đi kèm, ở 0.1–0.2 m/s, trong khu vực trống.

Preflight in WARN khi topic `stm32_link_ok` không có.

### 4.3 collision_monitor: **chưa có**

- 02/11 robot cán chân người. LiDAR quét ở 26.7 cm, không thấy bàn chân. Camera depth tắt.
- **Hệ quả:** mọi test có chuyển động phải ở khu vực **không có người**; vật cản chỉ dùng
  **vật giả** (ADR-0049); người đi kèm cầm E-stop, với tới được trong ≤ 2 s.
- NAV2 có người qua lại vẫn **BLOCKED** cho tới khi có collision_monitor (V3, tài liệu riêng).

### 4.4 Điều kiện chung trước **mỗi** lần có chuyển động

- A10 PASS.
- Có người đi kèm cầm E-stop, khu vực trống.
- Quest rút (preflight kiểm CPU < 70 %).
- **Luôn ghi bag** (preflight FAIL nếu không có recorder, trừ khi dùng `--static`).
- Preflight `== PASS`.
- `stopkey.py` đã mở sẵn ở một terminal.
- Mỗi lúc chỉ chạy một workflow.

## 5. Quy trình theo workflow

**Môi trường terminal:** như `robot-baseline-2026-11-02.md` §2. Mỗi terminal là terminal mới:

```bash
export ROBOT_RUNTIME_ROOT="$HOME/smart-campus-tour/robot"; source "$HOME/sct-r3-deploy/robot/scripts/source-minipc"; source "$HOME/.cache/armtc/smoothws/install/setup.bash"; unset ROS_SUPER_CLIENT
```

**Lệnh dùng chung:**

```bash
R=<checkout chứa robot/tools>   # branch này; ~/sct-test-ready cho đến khi merge
PF="python3 $R/robot/tools/preflight/preflight.py"                      # preflight, chỉ đọc
python3 $R/robot/tools/ops/stopkey.py /robot_01                         # dừng khẩn, mở sẵn
bash $R/robot/tools/ops/record_session.sh start <thư mục phiên>         # ghi bag; stop khi xong
```

### 5.1 MANUAL

**Launch:**

```bash
ros2 launch robot_control manual_mode.launch.py robot_id:=robot_01 lidar_yaw:=3.1241
```

**Teleop:**

```bash
ros2 run teleop_twist_keyboard teleop_twist_keyboard --ros-args -r cmd_vel:=/robot_01/cmd_vel_manual -p speed:=0.1 -p turn:=0.3
```

| Bước | Lệnh / thao tác | PASS | FAIL thì |
|---|---|---|---|
| Tĩnh | `$PF manual --lidar-yaw 3.1241 --static` | `== PASS` (WARN `stm32_link_ok` chấp nhận được) | Đọc dòng FAIL; không chạy tiếp |
| Bánh kê | teleop `i` 2 s, nhả phím | Bánh quay đúng chiều; dừng ≤ 0.6 s sau khi nhả | Ctrl+C launch; kiểm `invert_*` |
| Bánh kê | `stopkey` Enter khi đang giữ phím | Bánh dừng ≤ 1 s, giữ đứng yên | Dừng phiên |
| Bánh kê | Bấm E-stop khi đang giữ phím | Bánh dừng ngay. Nhả E-stop theo quy tắc §4.1 | Dừng phiên, xem lại A10 |
| Sàn (sau A10) | Ghi bag; đi thẳng 5 m ở 0.1 m/s, quay về | Chạy êm, không giật khi dừng | Dừng phiên |

**Kiểm chứng góc LiDAR từ bag sàn** (sau khi recorder đóng):

```bash
python3 ~/amr_logs/lidar_yaw_cal_20261110/tools/mount_yaw.py <bag_0.db3> <out.json> ~/smart-campus-tour/robot/robot_maps/map2.yaml
```

Đạt khi phương pháp A cho sai lệch so với TF trong ±1°. Đây là bằng chứng **HARDWARE
VALIDATED** đầu tiên cho 3.1241.

### 5.2 BUILD MAP (lái tay)

**Launch** (lần đầu nên giới hạn 250 mm/s; mặc định của launch là 350):

```bash
ros2 launch robot_control manual_mapping.launch.py robot_id:=robot_01 lidar_yaw:=3.1241 max_wheel_speed_mm_s:=250.0
```

| Bước | Lệnh / thao tác | PASS | FAIL thì |
|---|---|---|---|
| Tĩnh | `$PF mapping --lidar-yaw 3.1241 --static` | `== PASS`: một SLAM, không AMCL, `/scan` ≥ 8.5 Hz, `map→odom` có | Đọc dòng FAIL |
| Tĩnh | RViz trên laptop: xoay tay robot (nguồn động lực tắt) 90° | Map không nhân đôi tường | Sai `lidar_yaw` |
| Sàn (sau §5.1) | Ghi bag; lái tay một vòng đã biết, quay về điểm đầu | Tường thẳng, khép vòng lệch < 0.2 m | Dừng; không lưu map |
| Lưu map | Lưu vào **file mới** trong thư mục phiên | Có `.yaml`/`.pgm` mới | — |

**Lưu map:**

```bash
ros2 run nav2_map_server map_saver_cli -f ~/amr_logs/runs/<phiên>/map_test --ros-args -r map:=/robot_01/map
```

**Không** ghi vào `robot/robot_maps/`, và **không** ghi đè `map2.yaml` hay `map_fix.pgm`
(baseline và POI dùng hai file này).

### 5.3 NAV2

**Launch:** lệnh baseline `robot-baseline-2026-11-02.md` §2, **chỉ đổi** `lidar_yaw:=3.1241`.

| Bước | Lệnh / thao tác | PASS | FAIL thì |
|---|---|---|---|
| Tĩnh | Robot ở START; 2D Pose Estimate trên RViz | Scan trùng tường map2 | Sai yaw/pose; đặt lại |
| Tĩnh | `$PF navigation --lidar-yaw 3.1241 --static` | `== PASS`: lifecycle active, AMCL σxy < 0.3 m, σyaw < 10°, verify_params PASS | Đọc dòng FAIL |
| Sàn (sau §5.1, §4.2) | Ghi bag; START→POI_01→START bằng `route_test.py` | Hai chặng SUCCEEDED; 0 lần người dùng phải can thiệp | `stopkey`; dừng phiên |

**Tiêu chí sau chạy** (đo offline trên bag):

| Chỉ số | Ngưỡng |
|---|---|
| Phương pháp A, sai lệch so với TF | ±1° |
| AMCL đẩy ngang | \|·\| < 1.5 cm/m (02/11 là +5.7) |
| Hiệu chỉnh AMCL p90 | ≤ 4.9 cm |

## 6. Bằng chứng offline

| Mục | Kết quả |
|---|---|
| `test_workflow_launch_contract.py` + các test calibration/odometry cũ | 40 passed, 1 skipped. 2 đột biến (bỏ chuyển tiếp, bỏ cảnh báo) đều bị bắt |
| Cây đã merge link-safety | 51 passed, 1 skipped |
| `tools/preflight` | 16 passed, gồm end-to-end với publisher giả ở domain riêng |
| `tools/lidar_calibration` | 5 passed, gồm thu → fit với LiDAR giả |
| Replay bag 02/11 qua preflight | Tên topic và QoS đúng; tần số scan 12.1, wheel/odom 41.7, odom 21.8, cmd_vel 21.1 Hz |
| Runtime overlay (resolve launch) | `lidar_yaw:=3.1241` tới URDF ở `manual_mode`, `manual_mapping` và `navigation` |
| `robot/scripts/verify` | **FAIL, nhưng cả 7 lỗi đều có sẵn trên `origin/main`** (5405c879, đã chạy lại từng lỗi). Gồm: tier 1.4 xacro (`cad_to_ros_rpy`, `robot_description` chưa cài); `ament_copyright` của `robot_description` (5 file); `test_nav2_baseline_contract::test_lidar_clears_...` đọc key cũ `/**/scan_filter_chain`, trong khi config và test khác dùng `/**/scan_range_filter`, đúng tên node. Branch này không đụng các file đó. Còn lại: colcon 584 test, 227 tool test, fleet_bridge unittest đều pass. ruff không cài nên bị bỏ qua |

## 7. Rollback

| Muốn quay lại | Cách |
|---|---|
| Góc LiDAR | Launch lại với `lidar_yaw:=-3.0695` (baseline 02/11), rồi `verify_params.sh V2 -3.0695` |
| Branch | Không deploy nên runtime không đổi. Bỏ branch, hoặc `git revert` từng commit |
| Phiên test | Ctrl+C theo thứ tự route_test → recorder (`record_session.sh stop <phiên>`) → launch, luôn bằng SIGINT. Chỉ đọc bag sau khi recorder đóng |
