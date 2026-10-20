# Trạng thái robot ngày 20/10/2026: firmware PR #63 đã nạp, khảo sát POI, Localization V2

Báo cáo theo ngày: số liệu đúng cho ngày và commit ghi trong bài. Trước khi làm
gì phải kiểm lại trên máy thật. Lệnh trong tài liệu này **không** phải là cho
phép vận hành robot. Bằng chứng gốc (bag, log, script) nằm ngoài Git, trên
MiniPC, trong `$HOME/amr_logs/` (danh sách ở cuối). Bài này nối tiếp
[robot-status-2026-10-19.md](robot-status-2026-10-19.md).

## Tóm tắt cho người hoặc AI tiếp quản

| Hạng mục | Trạng thái 20/10 |
|---|---|
| Nav2 Baseline V1 | Không đổi (overlay `smoothws`, `sct-nav-smooth` `73b8630`, 0.20 m/s) |
| DDS S3 / R3 | Không đổi. **S3 DEPLOYED, ISOLATED**. Laptop dùng `amr-rviz --r3` |
| Firmware STM32 | **PR #63 đã nạp** (người dùng flash từ `main` `e3c1545`). FB có 19 trường (`imu_rearm`, `imu_reset_seen`). Ngay sau khi nạp: `imu_rearm=10`, `reset_seen=6`, sau đó ổn định. Chưa nghiệm thu ngắt nguồn BNO |
| Bridge chạy trên robot | **Vẫn là bản cũ** (`~/smart-campus-tour` install). Chưa triển khai bridge mới có `ImuHealth` / `/diagnostics` |
| Khảo sát POI tuyến dài (19/10) | START→POI_02 (32 m) và POI_02→POI_03 (24 m): SUCCEEDED, 0 recovery. AMCL trôi tới 1.2 m ở hành lang dài |
| **Định vị tuyến dài** | **Đã tìm ra nguyên nhân (offline):** odometry đo thiếu quãng đường khoảng 4.5 %; góc quay đúng. Chi tiết: [localization-v2.md](localization-v2.md) |
| **Localization V2** | Ở branch `feature/claude/localization-v2` (worktree `~/sct-loc-v2`), **ĐÃ PUSH, CHỜ PR REVIEW; CHƯA DEPLOY**. Đã kiểm offline. Bước tiếp: đo 10 m bằng thước (cần người vận hành, có quy trình an toàn) |
| Nguồn | Robot hết pin chiều 19/10 (bag khảo sát không đóng). MiniPC mất điện 2 lần ngày 20/10. Robot không có telemetry pin |
| E-stop phần cứng | **Không hoạt động.** Thời gian dừng của các cơ chế phần mềm đã đo offline (phím `k` 55 ms, Ctrl+C launch 11 ms, nhả phím 0.5 s); chưa đo trên robot. Điều kiện chạy: [localization-v2.md mục 5](localization-v2.md) |

## 1. Khảo sát POI tuyến dài (19/10, `runs/20261019_174058_poi_survey/`)

- Hai chặng đều SUCCEEDED, 0 recovery. FB, EKF và IMU khoẻ; Quest tắt.
- AMCL nhảy tới 1.2 m, scan khớp map tụt còn 0.24. Map đúng: dời pose
  0.25–0.7 m là khớp lại.
- POI trong `~/amr_logs/poi/` (định dạng repo):
  - `poi_02.yaml` (30.211, −5.690): **TẠM**, lệch khoảng 0.5 m. Cần ghi lại
    bằng `record_poi.py --replace POI_02`.
  - `poi_03.yaml` (42.460, −23.038): tốt, scan khớp 0.76.
- Công cụ trong `~/amr_logs/tools_r3s5/`, ngoài repo:
  - `rviz_goal_poi.py`: bấm 2D Goal Pose trên RViz R3, công cụ chuyển thành goal
    Nav2 sau khi xác nhận, hoặc tự gửi với `--auto`. R3 vẫn chỉ đọc.
  - `record_poi.py [name] [--replace POI_NN] [--force]`: từ chối ghi nếu sigma
    AMCL > 0.6 m hoặc 20°, hoặc scan khớp map < 0.60.
  - `poi_names.py`.

## 2. Định vị tuyến dài: nguyên nhân (offline, chỉ đọc bag)

Đối chiếu với một quỹ đạo tham chiếu khớp scan với map, độc lập với AMCL:

- Sai số AMCL gần như chỉ **theo chiều dọc hành lang, luôn chậm phía sau**.
- Odom so với tham chiếu: 15/15 cửa sổ 4 m (3 phiên) có tỉ lệ ≥ 1.00. Quét hệ
  số trong replay cho độ chậm dọc về 0 ở **×1.045**.
- Map đúng tỉ lệ (hành lang 2.91 m). Quay đúng: tỉ lệ yaw bánh/thật trung vị
  1.000 qua 14 lần rẽ.
- Bridge gửi lệnh mm/s; firmware tự đổi ra bước theo 194.5 mm. Vì vậy robot
  thực chạy nhanh hơn lệnh khoảng 4.5 %. Hiệu chỉnh phía ROS không đổi lệnh.
- Báo cáo offline đầy đủ:
  `runs/20261019_174058_poi_survey/analysis/loc/REPORT.md` (77 lượt replay,
  9 cấu hình).

## 3. Localization V2 (branch đã push, chờ review)

**Nội dung:**
- Tham số bridge `odom_linear_scale` (mặc định 1.0, chỉ nhân quãng đường tịnh
  tiến);
- `localization_params_v2.yaml` (AMCL `update_min_d/a` 0.10);
- `navigation.launch.py` khai báo và chuyển tiếp tường minh `wheel_base`,
  `wheel_radius`, `odom_linear_scale`;
- công cụ đo `robot/tools/odom_calibration/`.

Mặc định vẫn là V1 y hệt.

**Benchmark trên bản đóng gói** (2 seed). V2 = file V2 + ×1.045; V1 = file V1
+ ×1.0. Số liệu: sai số trung vị / p95 (m), % thời gian lệch > 0.5 m.

| Tuyến | V1 | V2 |
|---|---|---|
| Tuyến dài lượt 1 | 0.36 / 1.32, 40.6 % | **0.10 / 0.38, 2.5 %** |
| Tuyến dài lượt 2 | 0.29 / 0.47, 1.6 % | 0.12 / 0.45, 3.7 % (vượt nhẹ +0.11 m: điểm cần xem) |
| B2c đi / về | 0.14 / 0.27 và 0.11 / 0.34 | **0.06 / 0.13** và **0.06 / 0.12** |

**Kiểm thử offline:**
- `stm32_bridge` 51 PASS;
- `test_odometry_args` 5 PASS;
- `odom_calib` 6 PASS, cộng một lượt end-to-end với bridge V2 thật và STM32 giả;
- `robot_control` 83 PASS, 1 FAIL có sẵn từ trước;
- `scripts/verify robot` đầy đủ (ROS đã source, domain riêng), chạy trên cả V2 và
  `origin/main` `e3c1545`:

  | | `main` | V2 |
  |---|---|---|
  | colcon test | 288 test, 7 fail | 298 test (thêm 10), **cùng 7 fail** |
  | Check tier 1.4 xacro | FAIL | FAIL, giống hệt |
  | Kết luận | 2 check fail | 2 check fail |

  Chi tiết các lỗi:
  - **7 fail của colcon test:**
    - 1 test `test_nav2_baseline_contract`: `KeyError: '/**/scan_filter_chain'`;
    - 6 fail trong `robot_description`, cùng một lỗi thiếu copyright trong 5 file
      (1 ctest + 5 xunit).
  - **Lỗi xacro không nằm trong 7 lỗi đó.** Nó là một check riêng ở tier 1.4:
    - `sensors.xacro` dùng macro `cad_to_ros_rpy` khai báo ở file cha;
    - `robot.urdf.xacro` cần package `robot_description` trong ament index, mà
      tier 1 chạy trước khi build.
  - V2 không sửa file nào liên quan tới các lỗi này.

Đầy đủ: [localization-v2.md](localization-v2.md).

**Phân biệt rõ:** ×1.045 là **ước lượng offline**. Chưa có phép đo vật lý nào.

## 4. Việc tiếp theo (theo thứ tự)

1. Review và merge PR Localization V2 (người dùng tự merge).
2. Đo 10 m theo [localization-v2.md mục 5](localization-v2.md). Trước đó phải đạt
   đủ 6 điều kiện an toàn: kiểm dừng khi bánh nhấc, mạng, lượt thử 2 m, khu vực,
   cấu hình, quy tắc dừng.
3. Nếu giá trị đo khác 1.045 quá 1 %: chạy lại replay với giá trị đo. Sau đó thử
   V2 trên robot (B2c rồi tuyến dài), có recorder; cần người dùng cho phép.
4. Ghi lại POI_02.
5. Triển khai bridge mới (`ImuHealth`), nghiệm thu IMU (ngắt nguồn riêng BNO).
6. Đối chứng CPU khi Quest chạy (cần chủ Quest đồng ý). Sửa lỗi stamp của guard
   (NO_ANSWER giả). Tầng an toàn né người (collision_monitor).
7. Telemetry pin (hai lần mất nguồn chưa có cảnh báo trước).

## Bằng chứng (MiniPC, ngoài Git)

- `~/amr_logs/AMR_MASTER_CONTEXT.md`: bối cảnh tổng cho AI tiếp quản.
- `~/amr_logs/runs/20261019_174058_poi_survey/`:
  - bag (không đóng do hết pin);
  - `analysis/REPORT.md`;
  - `analysis/loc/`: `REPORT.md`, `refpose.py`, `replay_bag.py`,
    `run_variant.sh`, `final.sh`, `summarize.py`, `results/`.
- `~/amr_logs/firmware/main_e3c1545/`: bản build đã nạp (sha256 bin `a9555267…`).
- `~/amr_logs/poi/`, `~/amr_logs/tools_r3s5/`.
