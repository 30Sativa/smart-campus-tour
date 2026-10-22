# Nav2 Baseline V2 (development baseline, chốt 2026-10-22)

**Mức:** **development baseline**, nền cho các lần tối ưu tiếp theo (V3, V4…).
- **Chưa HARDWARE VALIDATED hoàn toàn.** Hướng cải thiện độ mượt đã đo trên robot thật,
  nhưng chưa có rosbag cho bám đường, độ chính xác đích và khoảng hở (§5).
- **Không phải production default.** Launch mặc định vẫn là `nav2_params.yaml`. V2 là
  opt-in qua `nav2_params_file`.
- **V1 giữ nguyên, đóng băng** ([nav2-baseline-v1.md](nav2-baseline-v1.md)) để đối chứng
  và rollback.

## 1. Định nghĩa

| Thành phần | V1 | **V2** |
|---|---|---|
| File | `robot_control/config/nav2_params_smooth.yaml` | `robot_control/config/nav2_params_v2.yaml` |
| `controller_server.FollowPath.lookahead_dist` (RPP) | 0.60 | **0.80** |
| `velocity_smoother.max_decel` [x, y, yaw] | [−0.50, 0, −2.50] | **[−0.50, 0, −1.20]** |
| Mọi tham số khác | — | **giống hệt V1** |

Phần giống hệt V1 gồm: Smac2D, costmap, collision detection, LatchedGoalChecker, BT không
BackUp, tốc độ 0.20 m/s, phanh tuyến tính −0.50.

**Lý do hai thay đổi:**
- **Lookahead 0.80:** RPP nhắm điểm xa hơn, nên bớt phản ứng với các bước hiệu chỉnh của
  AMCL và nhiễu cục bộ của path. Kết quả: bớt lắc và bớt đổi chiều quay khi bám đường.
- **Giảm tốc góc −1.20:** RPP Humble không giảm tốc trước khi tới hướng đích, nên mọi lần
  quay tại chỗ kết thúc bằng một cú phanh góc khoảng 1.8 rad/s². Cú phanh này **đã đo được
  trên robot thật ở mọi phiên 16–22/10**.
  - Đánh đổi: khi controller ra lệnh dừng giữa lúc đang quay 0.45 rad/s, robot quay thêm
    khoảng 2.5° (góc xe quét thêm khoảng 2 cm).
  - E-stop, mode_manager, bridge timeout và watchdog STM32 nằm **sau** velocity_smoother,
    nên không bị ảnh hưởng.

**Không thuộc V2: hiệu chỉnh LiDAR.**
- Launch mặc định vẫn là `lidar_yaw` −0.2225 (V1).
- LiDAR thật bị dời giá ngày 20–21/10; yaw hiện đo được khoảng −4.8°.
- Các lượt chạy V2 dùng `lidar_yaw:=-0.0833` (xem
  [robot-status-2026-10-22.md](robot-status-2026-10-22.md)).
- Luôn dùng **cùng** giá trị `lidar_yaw` khi so V1 với V2.

**Khoá cấu hình:** `robot_control/test/test_nav2_baseline_v2_contract.py`.
- Ghim sha256 của YAML đã chuẩn hoá: `57a60cae616f312f749029f52faf585ca6d850f679f75462eea4f2a5d56d85c3`.
- Kiểm V2 chỉ khác V1 đúng 2 khoá trên.
- Kiểm collision detection, tốc độ và phanh tuyến tính không đổi.
- Kiểm V2 không phải default.
- V1 vẫn được khoá bởi `test_nav2_baseline_v1_contract.py`.
- Muốn đổi giá trị: làm **V3** (file, doc, hash mới), không sửa V2.
- `scripts/verify robot` ngày 22/10 (ROS đã source): 292 test, 7 fail **đều có sẵn trên
  `main`** (copyright của `robot_description`; `test_nav2_baseline_contract`
  `scan_filter_chain`), cộng lỗi xacro tier 1.4 cũng có sẵn.
  - 4 test V2 và 5 test `tools/nav2_bench` đều pass.
  - Test V1 vẫn pass.

**Tag:** `nav2-baseline-v2` gắn **sau khi PR merge**, trên commit `main` chứa doc này (cùng
chính sách với V1).

## 2. Chạy V2 và rollback V1

Chỉ khác V1 ở `nav2_params_file`. Không cần build nếu trỏ thẳng vào file trong checkout.

```bash
# V2: file trong worktree, hoặc share của robot_control sau khi build overlay chứa commit này
ros2 launch robot_navigation navigation.launch.py robot_id:=robot_01 \
  map:="$HOME/smart-campus-tour/robot/robot_maps/map2.yaml" enable_camera:=false rviz:=false \
  nav2_params_file:=<repo>/robot/ros2_ws/src/robot_control/config/nav2_params_v2.yaml \
  lidar_yaw:=<giá trị LiDAR hiện hành>
```

- **Rollback V1:** cùng lệnh với
  `nav2_params_file:=$(ros2 pkg prefix robot_control)/share/robot_control/config/nav2_params_smooth.yaml`
  (trên MiniPC hiện là overlay `~/.cache/armtc/smoothws`).
- Không có code nào thay đổi, nên rollback chỉ là tham số launch.
- **Kiểm sau khi launch** (bắt buộc trước khi gửi goal):
  `robot/tools/nav2_bench/verify_params.sh V2 <lidar_yaw>` phải ra `ALL PASS`.
- Đã kiểm 22/10 bằng `probe_launch.py` qua `navigation.launch.py` thật: V2 cho
  `lookahead_dist` 0.8 và `max_decel` [−0.5, 0, −1.2]; mọi thứ khác giống V1.

## 3. Bằng chứng offline (Nav2 thật và robot giả lập; `robot/tools/nav2_bench/`)

Benchmark 22/10 ở `~/amr_logs/motion_bench/REPORT.md` (MiniPC, ngoài Git). Trong quá trình
đó đã thử và **loại**:
- SmoothPath / Simple Smoother trong BT: path đẹp hơn nhưng chuyển động không đổi;
- quay chậm 0.35: kém hiệu quả hơn giảm tốc góc;
- tăng gia tốc chậm hơn;
- timeout BT 200 ms: không có bằng chứng.

| Sim (trung vị) | V1 | V2 |
|---|---|---|
| R1 START↔POI_01 (6 chặng): jerk góc thực thi p95 | 0.65 | **0.45** |
| R1: lắc ngang RMS / đổi chiều quay mỗi m | 0.0094 / 0.63 | **0.0065 / 0.28** |
| R1: phanh cuối lần quay (rad/s²) | 1.80 | **1.20** |
| R1: sai số ngang p95 / khoảng hở min / sai số đích thật | 0.039 / 0.62 / 0.149 m | 0.044 / 0.625 / 0.150 m |
| R1 có vật cản ở sảnh (replan) | 2/2, 0 recovery | 2/2, 0 recovery |
| R2 START↔POI_03 (2 chặng): jerk / đổi chiều quay / sai số ngang p95 | 0.73 / 0.79 / 0.042 | **0.46 / 0.32** / 0.047 |
| R2: recovery | 1 spin | 0 |
| CPU controller | 8.5 % | 8.3 % |

## 4. Bằng chứng trên robot thật (22/10, `~/amr_logs/runs/20261022_1607_AB12_nobag/`)

- V1: 1 vòng (2 chặng). V2: 2 vòng (4 chặng). START↔POI_01, `lidar_yaw:=-0.0833`.
  **Tất cả SUCCEEDED, 0 recovery.**
- **Không có rosbag:** bộ ghi chưa được khởi động.
- Chỉ số dựng lại từ lệnh bánh 20 Hz trong log `stm32_bridge` (`tx_metrics.py`):

| Mỗi chặng | V1 (2 chặng hôm đó; 6 chặng V1 ngày 21/10) | V2 (4 chặng) |
|---|---|---|
| Jerk góc p95 | 1.11–1.18 (1.13–1.32) | **0.57–1.04** |
| Gia tốc góc p95 | 0.25–0.29 (0.26–0.42) | **0.14–0.21** |
| Lắc ngang RMS | 0.0176–0.0179 (0.018–0.022) | **0.009–0.015** |
| Đổi chiều quay / m | 0.77–1.06 (0.74–1.05) | **0.28–0.74** |
| Phanh cuối lần quay (max) | 1.80 (1.70–1.80) | **1.20–1.32** |

- Mọi chặng V2 tốt hơn mọi chặng V1 về jerk, gia tốc góc, độ lắc và phanh cuối lần quay.
- **Yếu tố nhiễu:** Quest stream chạy suốt phần V2 (và V1 chặng 2), làm BT trễ tick. Điều
  này bất lợi cho V2, nên mức cải thiện trên là ước lượng bảo thủ.

## 5. Giới hạn còn tồn tại

- **Chưa đo trên robot:** sai số bám đường, độ chính xác tới đích (vị trí và hướng), khoảng
  hở tới tường, chất lượng AMCL. Đây là các tiêu chí an toàn và độ chính xác. Lookahead dài
  hơn có thể cắt cua nhiều hơn (sim chỉ +5 mm).
- **Mẫu nhỏ:** robot thật 2 chặng V1 so với 4 chặng V2, so sánh không cân bằng (Quest).
  Sim chỉ 1–3 seed.
- Tuyến dài POI_03 với V2 **chưa chạy trên robot** (chỉ có sim).
- Hướng ở đích trong sim tăng nhẹ (13.8 → 15.5°, vẫn trong tol 17°).

## 6. Công nhận V2 là HARDWARE VALIDATED

**Điều kiện buổi test:**
- LiDAR đã chốt (`tools_lidarcal/marker_bearing.py` OK);
- **Quest rút ra** (`pgrep -x "ffmpeg|scrcpy"` rỗng); pin đầy;
- sảnh (7, 2.7) trống; người giám sát đi cạnh hoặc sau robot.

**Trình tự:** ABBA trong cùng buổi: V1, V2, V2, V1, mỗi vòng START→POI_01→START.
- Mỗi vòng: launch, `verify_params.sh`,
  `session_meta.sh CFG ~/amr_logs/runs/<date>_AB<n>_<CFG>`, `rec_start.sh`, rồi gửi goal
  **chỉ bằng** `go.sh POI_01` / `go.sh START`. `go.sh` từ chối nếu không đang ghi bag.
- Lệnh từng bước: [`../tools/nav2_bench/README.md`](../tools/nav2_bench/README.md) và
  `~/amr_logs/nav2_ab/RUNBOOK.md` trên MiniPC (runbook này gọi V2 là "C1").

**Chấm điểm:** `robot/tools/nav2_bench/analyze_ab.py --ref V1 --cand V2 <4 thư mục>`.

| # | Tiêu chí (V2 so với V1 cùng buổi) | Ngưỡng |
|---|---|---|
| 1 | Mọi chặng V2 SUCCEEDED | 4/4 |
| 2 | Jerk góc thực thi p95 | ≤ 0.8 × V1 **và** mức giảm > dao động giữa hai vòng V1 |
| 3 | Đổi chiều quay / m | như dòng 2 |
| 4 | Phanh cuối lần quay (max mỗi chặng, median) | ≤ 1.3 rad/s² |
| 5 | Sai số ngang p95 | ≤ V1 + max(1.5 cm, dao động V1) |
| 6 | Khoảng cách AMCL tin lúc dừng | mỗi chặng ≤ 0.15 m |
| 7 | Sai số hướng ở đích | mỗi chặng ≤ 17° |
| 8 | Khoảng hở min (pose AMCL so với map) | ≥ V1 − 5 cm |
| 9 | (thủ công) Recovery / collision-ahead không do người | không nhiều hơn V1 |

**Kết luận:**
- Đạt 1–9: V2 = **HARDWARE VALIDATED cho START↔POI_01**. Tiếp theo chạy 1 vòng V2
  START↔POI_03 có bag.
- Trượt tiêu chí an toàn hoặc độ chính xác (1, 5–9): **rollback V1** và xem lại V2.
- Chỉ trượt tiêu chí 2–4: V2 không có lợi, giữ V1.
- Dao động V1 lớn hơn mức giảm: **chưa kết luận**, chạy thêm một cặp.

## 7. So sánh các phiên bản sau (V3, V4…) với V2

1. File mới `nav2_params_v3.yaml` = V2 cộng các thay đổi.
2. Test khoá mới. Doc mới `nav2-baseline-v3.md`.
3. Đo **bằng cùng công cụ** (`robot/tools/nav2_bench`, sim R1/R2 cùng seed).
4. A/B trên robot bằng `analyze_ab.py --ref V2 --cand V3`.
5. Thêm case `V3` vào `verify_params.sh` và `sim/run.sh`.
