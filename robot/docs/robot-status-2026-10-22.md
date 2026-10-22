# Trạng thái robot 20–22/10/2026: LiDAR dời giá, tuyến POI_03, Nav2 Baseline V2

Báo cáo theo ngày; số liệu chỉ đúng cho thời điểm đã nêu.
- Trước khi làm gì phải kiểm lại máy thật. Lệnh trong tài liệu **không** phải lời cho phép
  vận hành robot.
- Bằng chứng gốc (bag, log, script) nằm ngoài Git, trên MiniPC, ở `~/amr_logs/` (danh sách
  ở cuối).
- Bài này nối tiếp [robot-status-2026-10-19.md](robot-status-2026-10-19.md).

## Tóm tắt cho người hoặc AI tiếp quản

| Hạng mục | Trạng thái 22/10 |
|---|---|
| Nav2 | **Baseline V2 = development baseline** ([nav2-baseline-v2.md](nav2-baseline-v2.md)): V1 + lookahead 0.8 + giảm tốc góc −1.2. Opt-in, **chưa hardware validated hoàn toàn**. V1 giữ nguyên để rollback |
| LiDAR | **Bị dời giá ngày 20–21/10: yaw thật khoảng −4.8°** (V1 TF −12.75°). Đang chạy bằng launch arg `lidar_yaw:=-0.0833`; mặc định trong repo chưa đổi. Vị trí x/y không đổi |
| Firmware STM32 | PR #63 đã nạp ngày 20/10 (FB 19 trường). Bridge chạy trên robot vẫn là bản cũ (chưa có `ImuHealth`) |
| Localization V2 (odom scale) | Branch `feature/claude/localization-v2`, **PR chưa merge**, chưa deploy; chờ đo 10 m |
| DDS S3 / R3 | Không đổi, đã xác minh 21/10: loopback, SHM, 0 drop UDP ở stack đang chạy |
| Link STM32 | Tốt: TX 20 Hz liên tục, 0 lỗi khi chạy. Có 1 `ERR,bad_command` lúc mở cổng ở mọi lần khởi động: artefact bắt tay, vô hại |
| Tuyến dài | **START → POI_03 → START thành công** ngày 21/10 17:26 (2/2, 301 s và 291 s, có `lidar_yaw`); không có bag |
| Rủi ro mở | Không có bag ở 3 phiên gần nhất; Quest stream chiếm khoảng 160 % CPU; E-stop phần cứng chưa có (chỉ có nút ngắt nguồn tạm); không có telemetry pin; Wi-Fi mất tới 15 s trên tuyến dài (robot không bị ảnh hưởng, nhưng mất lệnh dừng từ xa) |

## 1. LiDAR bị dời giá (21/10)

**Phát hiện:**
- Sau khi người dùng chỉnh phần cứng (cắm lại IMU), định vị kém đi.
- Đo yaw LiDAR thật bằng khớp scan với scan, không dùng map
  (`~/amr_logs/tools_lidarcal/lidar_mount_est.py`):
  - bag 16/10 và 19/10: −12.85…−13.13° (khớp TF −12.75°);
  - bag 21/10: **−4.77° ± 0.1°**;
  - phương pháp dựa trên map ra −4.94°.
- Vị trí x/y không đổi (±1 cm).
- Replay AMCL với TF −4.77°: sai số p95 giảm từ 0.49–0.57 m xuống 0.11–0.23 m (3/4 chặng).

**Mốc tĩnh:** một vật cố định trên thân xe (đầu nhô lên của **nút ngắt nguồn tạm**), ở
0.225 m bên trái LiDAR.
- `marker_bearing.py` đo yaw tĩnh từ vật này trong khoảng 10 s (góc trong khung thân xe
  84.53°).
- Vật này không gây collision-ahead: footprint clearing đã xoá nó. Nó che một góc khoảng 9°
  phía sau.

**Sự kiện USB LiDAR lúc 16:40:40 ngày 21/10:** người dùng chủ động rút ra cắm lại.

Chi tiết: `~/amr_logs/runs/20261021_1524_poi1_return/analysis/LIDAR_CALIBRATION.md`.

## 2. Các phiên 21–22/10

| Phiên | Cấu hình | Kết quả | Bag | Báo cáo (`~/amr_logs/runs/…`) |
|---|---|---|---|---|
| 21/10 15:24 START↔POI_01 ×2 | V1, TF −12.75 (LiDAR lệch 8°) | 3/4 thành công; 1 lần thất bại do người đứng chắn ở sảnh (7, 2.7) | **có** | `20261021_1524_poi1_return/analysis/` |
| 21/10 16:41 START↔POI_01 | V1, TF −12.75 | 2/2, bị chặn ở sảnh | không | `20261021_1641_AB_nobag/REPORT.md` |
| 21/10 17:26 START↔POI_03 | V1, `lidar_yaw:=-0.0833` (theo lịch sử shell) | **2/2**; bị chặn 33 s ở START (khả năng do initial pose đặt sai hướng) | không | `20261021_1726_poi03_nobag/REPORT.md` |
| 22/10 16:07 A/B | V1 (2 chặng) và V2 (4 chặng), `lidar_yaw:=-0.0833` | 6/6, 0 recovery | **không** (bộ ghi chưa chạy) | `20261022_1607_AB12_nobag/REPORT.md` |

**Đính chính đã ghi trong các báo cáo:**
- Lệch hướng 20° lúc dừng là **theo thiết kế** (`yaw_goal_tolerance` 0.30), không phải lỗi.
- Vật 22 cm **không** gây collision.

## 3. Nav2 V2 (22/10)

Xem [nav2-baseline-v2.md](nav2-baseline-v2.md):
- định nghĩa, bằng chứng sim (R1, R1 có vật cản, R2) và bằng chứng trên robot (lệnh bánh 20 Hz);
- giới hạn;
- tiêu chí để công nhận hardware validated (A/B theo trình tự ABBA, có bag).

Công cụ đo nằm trong repo: [robot/tools/nav2_bench](../tools/nav2_bench/README.md).

**Lỗi mô phỏng đã sửa:** scan giả có `range_max` = `obstacle_max_range` = 12 m, khiến Nav2
dựng "tường ma" cách robot 12 m và tuyến dài thất bại trong sim. Robot thật không bị
(`range_max` 25).

## 4. Bài học quy trình (áp dụng từ nay)

1. **Luôn ghi bag.**
   - Gửi goal bằng `robot/tools/nav2_bench/go.sh`: script từ chối nếu không đang ghi bag.
   - 3 phiên liên tiếp (21/10 16:41, 17:26; 22/10 A/B) đã mất bag.
2. **Rút Quest khi test Nav2.**
   - Quest stream (FFmpeg + scrcpy) chiếm khoảng 160 % CPU, làm BT trễ tick và các service
     call bị timeout.
   - Nó cũng làm hỏng một loạt benchmark offline.
3. Chỉ gửi goal khi scan khớp tường và guard báo ACCEPTED.
4. Người giám sát đi cạnh hoặc sau robot; không đứng chắn ở sảnh gần POI_01.
5. Tắt máy bằng `sudo poweroff` trước khi ngắt điện.

## 5. Việc tiếp theo (theo ưu tiên)

1. **A/B V1 so với V2 trên robot, có bag** (ABBA, START↔POI_01): chấm bằng `analyze_ab.py`.
   Đạt thì chạy 1 vòng V2 START↔POI_03 có bag.
2. **Chốt LiDAR:**
   - hoặc xoay về −12.75° (kiểm bằng `marker_bearing.py`);
   - hoặc đổi mặc định `lidar_yaw` thành một baseline mới có đo đạc. Hiện đang dùng arg
     −0.0833.
3. Localization V2: đo odom 10 m, rồi merge PR.
4. Bridge mới (`ImuHealth`); E-stop phần cứng; telemetry pin.

## Bằng chứng (MiniPC, ngoài Git)

- `~/amr_logs/AMR_MASTER_CONTEXT.md`: bối cảnh tổng cho AI tiếp quản.
- `~/amr_logs/tools_lidarcal/`: công cụ hiệu chuẩn LiDAR và README.
- `~/amr_logs/motion_bench/`: benchmark Nav2 offline (`REPORT.md`, `runs/`, `agg_*.txt`).
- `~/amr_logs/nav2_ab/`: bộ A/B bản đầu (RUNBOOK, `params/C1.yaml` = V2 về giá trị).
- `~/amr_logs/runs/2026102[12]_*`: các phiên ở bảng §2.
