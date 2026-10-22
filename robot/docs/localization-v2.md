# Localization V2 (candidate): hiệu chỉnh quãng đường odometry và AMCL cập nhật dày hơn

**Trạng thái: READY FOR HARDWARE CALIBRATION**, với các điều kiện an toàn ở mục 5 (E-stop phần cứng không hoạt động). **Chưa deploy.** V2 không phải mặc định: launch
mặc định vẫn là V1 y hệt cũ. Nav2 Baseline V1 (planner, controller, costmap,
LiDAR yaw), firmware STM32, DDS S3 và R3 đều không đổi.

## 1. Vấn đề và nguyên nhân (offline, ngày 20/10/2026)

Trên tuyến dài START → POI_02 → POI_03 (19/10), AMCL có lúc lệch 0.8–1.2 m, và
`map→odom` nhảy tới 1.2 m. Phân tích bag thật (đọc chỉ đọc), so với một **quỹ đạo
tham chiếu khớp scan với map, độc lập với AMCL**:

| Kiểm tra | Kết quả | Mức chắc chắn |
|---|---|---|
| Hướng sai số AMCL | Gần như chỉ theo chiều dọc hành lang, **luôn chậm phía sau** (trung vị −0.3 m, tới −1.1 m ở đoạn ít đặc trưng). Ngang p95 ≤ 0.18 m | cao |
| Odom so với tham chiếu (cửa sổ 4 m, 3 phiên B2c/S4/S5a) | 15/15 cửa sổ có tỉ lệ ≥ 1.00, trung vị 1.03–1.05: **odom đo thiếu quãng đường** | cao |
| Quét hệ số trong replay AMCL (B2c) | Độ chậm dọc về 0 ở khoảng **×1.045** | cao (gián tiếp) |
| Map | Bề rộng hành lang trên map2 2.91 m, LiDAR đo 2.91–2.92 m: đúng tỉ lệ | cao |
| Quay (yaw) | Góc quay tính từ bánh khớp góc quay thật: 14 lần rẽ, tỉ lệ trung vị **1.000**. IMU/EKF không trôi đáng kể | cao |

**Kết luận:** với tham số hiện tại, **quãng đường tịnh tiến** từ STEP bị đo thiếu
khoảng 4.5 %, còn **góc quay thì đúng**. Hành lang có đặc trưng thì AMCL tự bù; hành
lang dài ít đặc trưng thì AMCL phải tin odom nên tụt lại.

Nguyên nhân vật lý **chưa xác định**: có thể là đường kính lăn hiệu dụng thật lớn
hơn 194.5 mm, hoặc mô hình STEP → quãng đường lệch. Vì `wheel_base` 0.4714 m đã
được hiệu chuẩn hiệu dụng trước đây cùng với bán kính 0.09725, **không** đổi
`wheel_radius`. Đổi nó sẽ làm sai phần quay đang đúng.

## 2. Nội dung V2

| Thành phần | V1 | V2 | Ở đâu |
|---|---|---|---|
| `odom_linear_scale` (tham số mới của bridge) | 1.0 | **giá trị đo vật lý** (offline ước khoảng 1.045; *chưa phải hiệu chuẩn chính thức*) | `stm32_bridge`; launch arg ở `navigation.launch.py` → `manual_mode.launch.py` → `stm32_bridge.launch.py` |
| AMCL `update_min_d` / `update_min_a` | 0.25 m / 0.20 rad | **0.10 m / 0.10 rad** | `robot_navigation/config/localization_params_v2.yaml`, giống V1 trừ hai khoá này |

`odom_linear_scale` chỉ nhân **quãng đường tịnh tiến** tích phân từ STEP (pose và
`twist.linear.x` của `wheel/odom`). Không đổi: `delta_theta` (phần quay), lệnh gửi
STM32 (mm/s, firmware tự đổi ra bước), `joint_states`, `wheel_radius`, `wheel_base`.
Giá trị ngoài [0.8, 1.2] quay về 1.0 và có cảnh báo.

Đi kèm: `navigation.launch.py` giờ **khai báo và chuyển tiếp tường minh**
`wheel_base`, `wheel_radius`, `odom_linear_scale`, với mặc định giống
`manual_mode.launch.py`. Trước đây hai tham số đầu chỉ tới được bridge nhờ cơ chế
kế thừa launch configuration ngầm: chạy được, nhưng không hiện trong
`--show-args` và sẽ mất nếu include bị bọc scope. Không có lỗi chức năng nào trước
đây.

## 3. Kết quả offline (replay AMCL thật trên bag thật)

Phương pháp: phát lại scan và odom của bag (sim time, domain riêng), AMCL thật với
từng cấu hình. Odom được nhân hệ số tương đương `odom_linear_scale`. So pose AMCL
tin với quỹ đạo tham chiếu.

Benchmark bản đóng gói (`final.sh`, 2 seed mỗi cấu hình, 16 lượt, 0 lỗi).
**V2** = `localization_params_v2.yaml` + odom ×1.045; **V1** = file V1 + ×1.0.
Sai số tính bằng m:

| Tuyến | Cấu hình | Sai số trung vị / p95 | Dọc (trung vị) | Lệch > 0.5 m | Sai số ở đích | Yaw p95 |
|---|---|---|---|---|---|---|
| Tuyến dài lượt 1 (hành lang ít đặc trưng) | V1 | 0.36 / 1.32 | −0.35 | 40.6 % | 1.35 | 3.6° |
| | **V2** | **0.10 / 0.38** | −0.07 | **2.5 %** | **0.08** | 2.5° |
| Tuyến dài lượt 2 | V1 | 0.29 / 0.47 | −0.27 | 1.6 % | 0.06 | 6.2° |
| | V2 | 0.12 / 0.45 | **+0.11** | 3.7 % | 0.21 | 2.4° |
| B2c đi | V1 | 0.14 / 0.27 | −0.11 | 0 % | 0.09 | 3.4° |
| | **V2** | **0.06 / 0.13** | −0.00 | 0 % | 0.09 | 2.2° |
| B2c về | V1 | 0.11 / 0.34 | −0.09 | 0 % | 0.04 | 2.4° |
| | **V2** | **0.06 / 0.12** | +0.01 | 0 % | 0.05 | 2.0° |

**Hồi quy cần lưu ý:** ở tuyến dài lượt 2, V2 vượt nhẹ theo chiều dọc (+0.11 m).
Sai số ở đích là 0.21 m (V1: 0.06 m) và % lệch > 0.5 m là 3.7 % (V1: 1.6 %),
dù p95 vẫn tốt hơn (0.45 so với 0.47). Có thể hệ số đúng thay đổi theo đoạn
đường, hoặc 1.045 hơi cao cho đoạn này. Phép đo 10 m sẽ quyết định giá trị.

AMCL CPU tổng cộng: V2 38 s, V1 40 s, không tăng.

Kiểm tra cấu hình thực sự được nạp: trong mỗi lượt replay, đọc `update_min_d/a` từ
node AMCL đang chạy, khớp với file được chọn.

## 4. Ảnh hưởng tới các thành phần khác

| Thành phần | Ảnh hưởng của V2 |
|---|---|
| Lệnh vận tốc, Nav2 controller | **Không**: bridge không dùng `odom_linear_scale` khi đổi `cmd_vel` → mm/s |
| Vận tốc thực tế | Không đổi so với V1. Robot vốn chạy nhanh hơn lệnh khoảng 4.5 % (0.20 → khoảng 0.209 m/s) vì cùng nguyên nhân; V2 chỉ làm odom phản ánh đúng điều này, nên `vx` trong odom sẽ khoảng 0.209 |
| `wheel_base`, phần quay | Không đổi (giữ 0.4714 đã hiệu chuẩn; dữ liệu cho thấy quay đúng) |
| Firmware STM32 (194.5 mm) | Không đổi, không cần nạp. Đồng bộ firmware (để tốc độ thực khớp lệnh) là việc riêng, sau |
| URDF / `joint_states` | Không đổi (chỉ để hiển thị bánh) |
| Giả định STEP feedback | Odom vẫn đếm xung STEP đã phát (servo tự đóng vòng). Mất bước sẽ làm odom đo *thừa* chứ không thiếu, nên không giải thích được hiện tượng này |
| EKF | Nhận `vx` lớn hơn khoảng 4.5 %, `vyaw` không đổi, IMU không đổi |
| AMCL CPU | Không đo được khác biệt (khoảng 3–7 s CPU mỗi lượt 80–160 s, khoảng 3–6 % một nhân) |
| DDS S3 / R3 | Không liên quan |

## 4b. Giới hạn

- Hệ số 1.045 là **ước lượng gián tiếp** (scan và map), chưa phải hiệu chuẩn chính
  thức. Phải đo 10 m (mục 5).
- Replay: 4 lượt (2 tuyến dài, 2 B2c), 1–2 lần chạy, tốc độ 2×. Odom được nhân ở
  mức TF của EKF, không chạy lại EKF với `vx` mới. Mức cải thiện có thể khác ±.
- Quỹ đạo tham chiếu dùng chung map2. Ở đoạn hành lang suy biến, chính nó cũng kém
  chắc hơn.
- Chưa kiểm: tuyến khác, sàn khác, tải khác, quay nhiều; chạy thật.

## 5. Đo hiệu chuẩn 10 m (do người vận hành làm, có giám sát)

**An toàn.** E-stop phần cứng **không hoạt động**. Người đi theo là **người giám
sát**: dọn đường, giữ người khác tránh xa, hô dừng. **Không** dùng tay giữ robot
đang chạy làm phương án dừng. Dừng bằng các cơ chế phần mềm có sẵn dưới đây; đã
kiểm thời gian, nhưng chỉ offline.

*Thời gian dừng đo offline* (20/10, domain riêng; bridge và mode_manager thật, STM32
giả qua pty, teleop giả lập theo đúng cách `teleop_twist_keyboard` publish). Tính
từ thao tác tới lúc dòng `STOP` đầu tiên ra cổng serial; **chưa cộng** độ trễ SSH.

| Cách dừng | Đường đi | Thời gian (offline) | Ghi chú |
|---|---|---|---|
| **Phím `k` trong teleop** (hoặc phím bất kỳ không phải phím chạy; Ctrl+C teleop cũng publish 0) | teleop → mode_manager → bridge `STOP` | **55 ms** | Cách dừng chính của người lái |
| **Ctrl+C terminal launch** (bridge nhận SIGINT) | bridge gửi `STOP` trước khi thoát | **11 ms** | Dự phòng: cắt toàn bộ lệnh. Phải launch lại mới chạy tiếp |
| Nhả phím chạy | không còn lệnh → mode_manager `manual_timeout` 0.5 s → `STOP` | 501 ms | Khoảng 5 cm ở 0.1 m/s; cộng thêm phím lặp còn đọng trong SSH |
| `ros2 service call /robot_01/emergency_stop std_srvs/srv/SetBool "{data: true}"` | mode_manager ép 0 | 827 ms | Phần lớn là thời gian khởi động CLI; trên J5005 có thể chậm hơn. Chỉ là dự phòng |
| mode_manager chết | bridge `cmd_timeout` 0.5 s → `STOP` | 510 ms | Tự động |
| Bridge chết cứng, rút USB, miniPC mất nguồn | watchdog firmware 300 ms (ngắt 500 ms) | 0.25–0.40 s *dự kiến* | Theo `MOTOR_ISR_BUDGET.md`, test offline `test_motor_core`; **chưa đo trên MCU** |

Điểm yếu chung của mọi cách dừng do người làm: lệnh đi qua **SSH trên Wi-Fi**. Khi
mạng trễ (RTT từng tới 2.1 s lúc chuyển AP ở S5a), phím `k` phải xếp hàng sau các
phím lặp còn đọng, nên robot có thể đi thêm một đoạn sau khi người lái đã bấm.
Nếu SSH đứt hẳn thì teleop không gửi lệnh nữa, và robot tự dừng sau khoảng 0.5 s.

**Điều kiện bắt buộc trước khi chạy 10 m** (thiếu điều nào thì không chạy):

1. **Kiểm trên bàn, bánh nhấc khỏi sàn** (cần bạn cho phép riêng):
   - với từng cách: phím `k`, nhả phím, Ctrl+C launch, gọi service e-stop;
   - bánh phải dừng hẳn, ghi thời gian;
   - đạt khi `k` và Ctrl+C dừng gần như ngay, nhả phím dừng trong khoảng 0.6 s.
2. **Mạng:** đo `ping` từ máy người lái tới miniPC ngay tại đoạn đường đo, trong
   60 s:
   - đạt khi không mất gói và tối đa < 150 ms;
   - đoạn đo không nằm ở chỗ robot hay chuyển AP. Mạng chập chờn thì hoãn.
3. **Lượt thử 2 m trên sàn:** bấm `k` giữa chừng, và một lần nhả phím. Đo quãng
   trượt sau thao tác: đạt khi ≤ 10 cm.
4. **Khu vực và người:**
   - hành lang trống, có **≥ 2 m trống sau vạch cuối**;
   - người giám sát chặn người qua lại;
   - người lái nhìn thấy robot và có **hai terminal SSH mở sẵn**: một chạy
     teleop, một là terminal launch để bấm Ctrl+C.
5. **Cấu hình:**
   - Nav2 V1 như thường (để có LiDAR), **không gửi goal**; `manual_mode` không
     có LiDAR;
   - teleop `speed:=0.1`, **không bấm** phím tăng tốc (`q`/`w`/`e`);
   - bridge V1 (không truyền `odom_linear_scale`);
   - pin đầy (20/10 miniPC đã mất nguồn 2 lần).
6. **Quy tắc khi chạy:** người giám sát hô dừng, hoặc có gì bất thường → bấm `k`.
   Nếu robot không dừng ngay → Ctrl+C terminal launch.

**Chuẩn bị:**
- hai vạch cách đúng **10.000 m** đo bằng thước, trên đoạn thẳng, phẳng;
- tốt nhất phía trước có một **bức tường vuông góc** trong vòng 25 m, để có tham
  chiếu LiDAR độc lập;
- căn **tâm trục bánh** (`base_footprint`) đúng vạch, mũi robot hướng dọc đường.

**Thao tác** (terminal miniPC đã source helper R3 và overlay; teleop ở terminal khác):

```bash
python3 ~/sct-loc-v2/robot/tools/odom_calibration/odom_calib.py start fwd1
# teleop thẳng ~0.1 m/s tới vạch cuối, dừng hẳn
python3 ~/sct-loc-v2/robot/tools/odom_calibration/odom_calib.py end fwd1 --tape 10.000
# lặp: fwd2, fwd3 (cùng chiều); rev1, rev2, rev3 (chiều ngược, chạy lùi hoặc quay đầu đặt lại)
python3 ~/sct-loc-v2/robot/tools/odom_calibration/odom_calib.py summary
```

Teleop qua mode manager (terminal SSH vào miniPC, đã source helper R3; `k` = dừng):

```bash
ros2 run teleop_twist_keyboard teleop_twist_keyboard --ros-args -r cmd_vel:=/robot_01/cmd_vel_manual -p speed:=0.1 -p turn:=0.3
```

**Tiêu chí chấp nhận** (do `summary` kiểm):
- ≥ 6 lượt sạch, cả hai chiều;
- mỗi lượt: hướng đổi ≤ 3°, trôi ngang ≤ 0.15 m;
- độ lệch chuẩn giữa các lượt ≤ 0.5 %; chênh hai chiều ≤ 1 %;
- nếu có tường: tỉ lệ theo LiDAR khớp tỉ lệ theo thước trong 1 %;
- giá trị trong khoảng 0.95–1.08 (ngoài khoảng này thì tìm nguyên nhân trước).
- Kết quả: `odom_linear_scale` = trung bình. Nếu khác 1.045 hơn khoảng 1 % thì
  chạy lại replay với giá trị đo được trước khi thử V2 trên robot.

## 6. Thử V2 trên robot (sau khi được cho phép)

Cần một overlay chứa `stm32_bridge`, `robot_control` và `robot_navigation` của
branch này, source **sau** `smoothws`. Ví dụ `~/.cache/armtc/locv2ws`, build từ
worktree `~/sct-loc-v2`. Terminal Nav2 (S3 helper → smoothws → locv2ws):

```bash
ros2 launch robot_navigation navigation.launch.py robot_id:=robot_01 \
  map:="$ROBOT_MAP_DIR/map2.yaml" enable_camera:=false rviz:=false \
  nav2_params_file:="$HOME/.cache/armtc/smoothws/install/robot_control/share/robot_control/config/nav2_params_smooth.yaml" \
  localization_params_file:="$(ros2 pkg prefix robot_navigation)/share/robot_navigation/config/localization_params_v2.yaml" \
  odom_linear_scale:=<GIÁ_TRỊ_ĐO>
```

**Kiểm sau khi launch:**
- log bridge in `odom_linear_scale=<giá trị>`;
- `ros2 param get /robot_01/amcl update_min_d` ra 0.1.

**Nghiệm thu:**
- A→B→A (B2c) rồi tuyến dài, có recorder;
- đánh giá bằng `analysis/loc` (`refpose.py` và replay): độ chậm dọc khoảng 0 trên
  B2c, tuyến dài lệch > 0.5 m dưới 10 % thời gian;
- không có recovery mới, độ mượt ngang V1.

## 7. Rollback

- Launch **không** truyền `localization_params_file` và `odom_linear_scale` (hoặc
  `odom_linear_scale:=1.0` và file V1).
- Hoặc bỏ overlay `locv2ws`, source lại như V1.

Không có thay đổi firmware hay dữ liệu, nên rollback chỉ là tham số launch.
