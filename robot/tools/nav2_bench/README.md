# nav2_bench: đo chất lượng chuyển động Nav2 (offline và trên robot)

Đây là bộ đo dùng để chọn Nav2 Baseline V2
([nav2-baseline-v2.md](../../docs/nav2-baseline-v2.md)). Các phiên bản V3, V4… **phải** đo
bằng đúng bộ này để so được với V2.

Tất cả công cụ chỉ đọc. Trên robot, chúng **không gửi lệnh chuyển động**, trừ `go.sh`: script
này gửi goal, và chỉ gửi khi đang ghi bag.

## Chỉ số (`metrics.py`)

Chỉ số chia theo ba tầng, tách riêng:

1. **Hình học path** (`/plan`): độ cong, tốc độ đổi độ cong, kink, độ dịch khi replan.
2. **Bám đường:** khoảng cách từ pose (AMCL; trong sim có thêm pose thật) tới path đang
   bám.
3. **Profile vận tốc:**
   - `cmd_vel_nav` (sau velocity_smoother), `cmd_vel_ctrl` (đầu ra RPP), chuyển động thực
     thi (`wheel/odom`);
   - gia tốc / jerk, lắc ngang (`ang_jitter_rms`), đổi chiều quay / m;
   - quay tại chỗ, **phanh cuối lần quay** (`rot_end_wdot_*`);
   - trong sim thêm: khoảng hở footprint và tỉ lệ bánh chạm trần.

```bash
python3 metrics.py bag <bag_0.db3>          # robot thật, JSON từng chặng
```

## Mô phỏng offline (`sim/`)

Nav2 **thật** (cùng params, BT, namespace, map2) và một robot giả lập động học
(`fakebot2.py`):
- bridge có trần 250 mm/s mỗi bánh, trễ 90 ms, timeout 0.5 s;
- scan ray-cast trên map với `range_max` 25 m như RPLIDAR thật;
- sai số định vị kiểu AMCL; vật cản tuỳ chọn không có trên map.

Mỗi lượt chạy trong domain 86, localhost; không đụng tới graph của robot.

```bash
export NAV2_BENCH_OUT=~/amr_logs/nav2_bench       # kết quả (ngoài repo)
sim/run.sh V2 R1 1                                # START->POI_01->START, seed 1
sim/run.sh V2 R1 1 7.0,2.7,0.25                   # + vật cản ở sảnh (kiểm replan)
sim/run.sh V2 R2 1                                # START->POI_03->START (tuyến dài)
sim/run.sh path/to/candidate.yaml R1 1            # ứng viên bất kỳ
python3 metrics.py sim $NAV2_BENCH_OUT/runs/<tag>
python3 aggregate.py V1 V2 <candidate>            # bảng trung vị theo kịch bản, CPU, sự kiện
```

**Quy tắc công bằng** (rút ra từ các lỗi đã gặp ngày 22/10):
- **Không chạy song song.** Máy J5005 chỉ có 4 nhân.
- **Không sửa `run.sh` khi đang có batch chạy.** Bash đọc script dần dần, nên một lượt đã
  bị treo vì việc này.
- `run.sh` **tự chờ** khi có ffmpeg, scrcpy hoặc build đang chạy. Quest stream từng làm
  hỏng một loạt kết quả.
- Lượt có tải ngoài bị `aggregate.py` loại.
- `range_max` của scan giả **phải lớn hơn** `obstacle_max_range` (12 m). Nếu bằng nhau,
  Nav2 dựng "tường ma" cách robot 12 m: đó là nguyên nhân lỗi tuyến dài R2 cũ.

**Độ trung thực:** đã đối chiếu V1 trong sim với robot thật (thời gian chặng, gia tốc góc,
góc quay ở đích, phanh cuối lần quay). Sim "sạch" hơn thật: không trượt bánh, không người,
không lỗi AMCL thật. **Chỉ dùng để so sánh tương đối.**

## A/B trên robot (`analyze_ab.py`, `verify_params.sh`, `session_meta.sh`, `go.sh`, `tx_metrics.py`)

Quy trình đầy đủ: [nav2-baseline-v2.md §6](../../docs/nav2-baseline-v2.md).

| Script | Việc |
|---|---|
| `verify_params.sh V1\|V2 [lidar_yaw]` | Sau khi launch: đọc tham số **đang chạy** (`--no-daemon`), báo PASS/FAIL |
| `session_meta.sh CFG DIR` | Ghi lệnh launch, sha256 file params, tải ngoài, kết quả verify vào `DIR/session_meta.txt` |
| `go.sh POI_01\|START\|POI_03` | Gửi goal **chỉ khi** đang ghi bag (bag lớn lên) và Quest không stream |
| `analyze_ab.py --ref V1 --cand V2 DIR...` | Chấm PASS/FAIL theo 8 tiêu chí, có tính dao động nội tại của cấu hình tham chiếu (ABBA) |
| `tx_metrics.py BRIDGE_LOG BT_LOG` | Khi **không có bag**: dựng lại lệnh bánh 20 Hz từ log `stm32_bridge` (`TX: CMD,seq,l,r`) và đo jerk, lắc, phanh cuối lần quay. Không đo được bám đường, đích hay khoảng hở |
| `probe_launch.py PARAMS [arg:=v]` | Phân giải `navigation.launch.py` thật (không khởi động node) và in tham số tới từng node |

Test (không cần ROS): `python3 -m pytest tools/nav2_bench` (chạy trong `scripts/verify`,
tier 1.7).
