# Tự khởi tạo 2D Pose (`pose_bootstrap`)

Trạng thái: **READY FOR HARDWARE TEST**. Mặc định **tắt**; baseline robot không đổi. Bật bằng
`robot nav --auto-pose` hoặc `AUTO_INITIAL_POSE=true` trong profile máy.

## 1. Vấn đề và nguyên tắc

AMCL trên robot thật không tự đoán vị trí (`set_initial_pose: false`): mỗi lần bật Nav2, người
vận hành phải đặt **2D Pose Estimate** trên RViz. Seed AMCL ở một pose cố định không an toàn,
vì robot có thể đã bị đẩy khi tắt nguồn. Một pose sai nhưng được nạp với độ tin cao sẽ cho ra
`map -> odom` sai một cách tự tin.

Nguyên tắc của `pose_bootstrap`:

- **Nạp vị trí đã biết ≠ tự định vị.** Pose lưu lần trước và các điểm đỗ khai báo (START, dock)
  chỉ là *chỗ để tìm trước*. Không pose nào được gửi cho AMCL khi chưa khớp với scan LiDAR
  hiện tại.
- **Chỉ gửi khi khớp tốt và duy nhất.** Nếu không thì không gửi gì, trạng thái
  `NEEDS_MANUAL_POSE`, người vận hành đặt tay như trước.
- **Robot không cần di chuyển.** Kiểm tra lúc đứng yên; AMCL được tinh chỉnh bằng
  `request_nomotion_update` (dịch vụ có sẵn của Nav2 AMCL).
- **Đặt tay luôn thắng.** RViz → `initialpose_guard` → `initialpose` không đổi. Một pose đặt tay
  trong lúc `pose_bootstrap` đang chạy làm nó dừng (`ABORTED`). Nếu đã có pose đặt tay thì
  `pose_bootstrap` không ghi đè (`SKIPPED`).

## 2. Cách hoạt động

```
navigation.launch.py auto_initial_pose:=true
  map_server + AMCL (không seed)            pose_bootstrap (robot_navigation)
                                              1. chờ map, scan, AMCL; robot đứng yên ≥1 s, không goal nào chạy
                                              2. lấy 3 scan mới (sau khi xác nhận đứng yên)
                                              3. tìm pose khớp scan với map (likelihood field như AMCL):
                                                 a. quanh pose đã lưu và các home (±0.6 m, ±25°)
                                                 b. nếu không có cái nào đạt: tìm trong các vùng của map
                                              4. chấp nhận chỉ khi score ≥ min_score và không có pose khác
                                                 (≥1 m hoặc ≥30°, hoặc ≥0.3 m/8° trong cùng cửa sổ tìm)
                                                 khớp gần bằng (ambiguity_margin)
         <── initialpose ──────────────────  5. gửi pose (variance 0.04 m², 0.02 rad²)
         <── request_nomotion_update ×≤5 ──  6. AMCL cập nhật bằng laser, robot không chạy
         ── amcl_pose ─────────────────────> 7. LOCALIZED khi AMCL gần pose đã gửi (≤0.3 m, ≤10°)
                                                 và variance ≤ 0.09 / 0.05 (cùng ngưỡng "localized" của fleet_bridge)
```

Trong lúc chạy, khi AMCL đã localized, node lưu pose (mỗi 5 s nếu đã đi ≥0.2 m hoặc xoay ≥10°)
vào `~/.local/state/sct-robot/pose_bootstrap/last_pose_<hash>.json`. Hash tính trên nội dung
map YAML + ảnh, nên pose của map khác không bao giờ được dùng. Ghi bằng file tạm + rename.

**Trạng thái** (latched `std_msgs/String`) trên `/<robot>/pose_bootstrap/status`:

| Trạng thái | Nghĩa | Làm gì |
|---|---|---|
| `LOCALIZED: x .. y .. yaw .. from START; scan match 0.67 vs 0.49; AMCL cov ...` | Đã định vị, AMCL đồng ý | Nhìn RViz một lần cho chắc, rồi chạy |
| `NEEDS_MANUAL_POSE: AMBIGUOUS ...` | Có nơi khác khớp gần bằng (hành lang giống nhau) | Đặt 2D Pose trên RViz |
| `NEEDS_MANUAL_POSE: NO_MATCH ...` | Không chỗ nào khớp đủ (robot ngoài vùng, LiDAR bị che, map khác thực tế) | Đặt tay; kiểm LiDAR |
| `NEEDS_MANUAL_POSE: not attempted: robot is moving / a goal is active` | Robot không đứng yên | Dừng robot, `robot relocalize` |
| `NOT_CONVERGED` | Đã gửi pose nhưng AMCL không đồng ý trong 10 s | Kiểm RViz, đặt tay |
| `SKIPPED` | Đã có pose đặt tay, hoặc AMCL đã localized | Không cần làm gì; `robot relocalize` để làm lại |
| `ABORTED` | Có pose đặt tay trong lúc đang tìm | Pose đặt tay được giữ |
| `DISABLED` / `ERROR` | Thiếu file cấu hình map, map sai, không có TF/scan | Đọc chi tiết trong dòng trạng thái |

Làm lại khi robot đứng yên: `robot relocalize` (gọi `/<robot>/pose_bootstrap/relocalize`,
`std_srvs/srv/Trigger`; bỏ qua quy tắc `SKIPPED`).

## 3. Cấu hình theo map

File đặt cạnh map: `<map không đuôi>.pose_bootstrap.yaml`, ví dụ
`robot/robot_maps/map2.pose_bootstrap.yaml`. **Không sửa map YAML**: `fleet_bridge` so từng byte
của nó với gói map đã upload.

```yaml
map_yaml: map2.yaml          # phải đúng map đang nạp
frame_id: map
homes:                       # chỗ robot hay được bật lên; tìm ở đây trước
  - poi_file: poi_start.yaml # lấy pose từ file POI (POI phải cùng map)
  - name: DOCK               # hoặc pose viết thẳng
    pose: {x: 1.0, y: 2.0, yaw: 0.0}
saved_pose: true             # tìm cả quanh pose lưu lần trước
global_search:
  enabled: true
  regions: [[-3.0, -3.0, 12.0, 10.0]]   # xmin, ymin, xmax, ymax: chỉ tìm trong các hộp này
search:                      # tùy chọn: ghi đè SearchConfig (góc bằng độ)
  min_score: 0.55
  ambiguity_margin: 0.08
```

`global_search` **bắt buộc có `regions`**. Trên map2, tìm toàn tòa nhà cho ra một chỗ cách 70 m
khớp *cao hơn* START (0.71 so với 0.67). Bước kiểm tính duy nhất đã chặn nó (`AMBIGUOUS`),
nhưng thu hẹp vào khu robot thực sự được bật lên thì vừa nhanh hơn vừa trả lời được.

Tham số node (`robot_navigation/config/pose_bootstrap.yaml`): thời gian đứng yên, số scan,
số lần no-motion update, ngưỡng variance để báo `LOCALIZED`, nơi lưu pose.

## 4. Đánh giá offline (13/11/2026, map2, 2 bag `runs/20261112_173722_nav`)

Công cụ: `robot/tools/localization/pose_bootstrap_eval.py` (chỉ lõi tìm kiếm) và
`robot/tools/localization/run_bootstrap_replay.sh` (AMCL thật của Nav2 + node thật, phát lại
scan/odom/TF/map của bag ở domain ROS 89 riêng; bỏ `map -> odom` đã ghi). Mốc so sánh là AMCL
lúc chạy thật, không phải ground truth.

| Kịch bản | Kết quả |
|---|---|
| Đầu-cuối, robot đỗ ở START, không có pose lưu | `LOCALIZED` sau 1.4 s; lệch AMCL thật 0.06 m / 1.9° |
| Đầu-cuối, pose lưu sai 2 m (robot bị đẩy) | `LOCALIZED` sau 2.0 s; lệch 0.07 m / 2.0° |
| Lượt 1 (mốc là pose click tay vừa đặt) | Lệch 0.30 m; điểm khớp scan: pose tự khởi tạo 0.648, pose click tay 0.361, tức pose tự khởi tạo đúng hơn |
| Chỉ tìm quanh START, robot thật ở chỗ khác 2 m | `NO_MATCH` (đúng: không đoán) |
| Tìm trong vùng, robot thật ở START, gợi ý sai 2 m | `VERIFIED` lệch 0.10 m / 1.1° (lượt 2) |
| Tìm trong vùng, scan lúc robot đang chạy dọc tuyến (khó hơn lúc khởi động) | 9/19 và 15/18 lần `VERIFIED`, sai khác AMCL tối đa 0.63 m / 10.8° (AMCL cũng lệch 0.2–0.4 m ở hành lang y); phần còn lại `AMBIGUOUS`/`NO_MATCH`; không lần nào sai xa |
| Thời gian trên MiniPC | Kiểm home: 1.5 s; tìm trong vùng: 1.7–2.8 s; dựng likelihood field: 0.2 s |

Unit test (`robot_navigation/test/test_pose_bootstrap.py`, map giả lập + scan dò tia): pose đúng
được xác nhận và tinh chỉnh; ứng viên sai bị từ chối thay vì bị kéo về; robot bị đẩy được tìm
lại bằng vùng tìm; vùng tìm được tôn trọng; **hành lang trơn ra `AMBIGUOUS`** (lỗi này do test
bắt được: bản đầu xác nhận một pose trượt 0.75 m dọc hành lang); scan rỗng; lỗi cấu hình; pose
lưu không vượt map; launch mặc định tắt.

### Phép thử ảo "robot bị nhấc đi" (14/11/2026)

`robot/tools/localization/pose_bootstrap_kidnap_sim.py`: đặt robot ảo ở vị trí ngẫu nhiên trong vùng tìm của
map2 (biết vị trí thật), dò tia scan 360° có nhiễu 2 cm, 10 % tia mất và tới 5 người che; pose lưu đặt cách
chỗ thật 1.5–3 m. Bản đầu nhận **sai 4/100** (lệch 0.85–2.86 m): một chỗ trông giống cạnh pose lưu được xác
nhận trong khi vùng tìm không chạy nên vị trí thật không được so. Sửa: khi bật vùng tìm thì luôn tìm và mọi
kết quả cùng qua bước kiểm duy nhất (`test_a_saved_pose_next_to_a_look_alike_does_not_win_over_the_true_pose`,
hỏng trên bản cũ). Sau sửa: 150 vị trí, **0 sai**, 96 % đúng, 4 % `AMBIGUOUS`; 1.6 s/lần (1 scan). Đầu-cuối
với AMCL thật trên MiniPC: `LOCALIZED` sau 4.6 s (3 scan, gồm quét vùng). Bản đồ ở đây khớp hoàn hảo với
thế giới, nên đây là cận trên của độ đúng, nhưng chỉ ra được chỗ nào trên bản đồ có hình dạng giống nhau.

## 5. Cần xác nhận trên robot thật

Chạy theo `robot/docs/test-readiness-2026-11-10.md`, có người giữ E-stop. Robot **không cần chạy**
cho bước 1–4.

1. Robot ở START, `robot nav --auto-pose`. Kỳ vọng `LOCALIZED ... from START` trong khoảng 10 s
   sau khi Nav2 lên; scan khít tường trên RViz.
2. Đẩy robot (tắt nguồn motor) 1–2 m trong vùng, `robot relocalize`. Kỳ vọng `LOCALIZED ... from global`
   và scan khít; hoặc `NEEDS_MANUAL_POSE` (chấp nhận được), **không** được `LOCALIZED` sai chỗ.
3. Đưa robot ra ngoài vùng (hành lang xa), `robot relocalize`. Kỳ vọng `NEEDS_MANUAL_POSE`.
4. Che một nửa LiDAR bằng người đứng sát, `robot relocalize`. Kỳ vọng `NEEDS_MANUAL_POSE` hoặc
   `LOCALIZED` đúng chỗ, không sai chỗ.
5. Trong vài giây đầu khi `pose_bootstrap` đang tìm, đặt 2D Pose tay: kỳ vọng `ABORTED`, pose tay
   được giữ. Sau `LOCALIZED`, đặt 2D Pose tay vẫn được AMCL nhận như trước.
6. Chạy `run_route.sh` sau khi `LOCALIZED`; so với một lượt đặt tay.
7. Tắt Nav2 sau khi chạy, bật lại ở cùng chỗ: kỳ vọng `LOCALIZED ... from saved`.

Rủi ro cần để ý: một scan bị che nhiều hoặc khu vực đổi đồ đạc có thể cho `LOCALIZED` lệch vài
chục cm; vẫn nhìn RViz trước khi bấm chạy. Lỗi góc LiDAR (đang nghiên cứu, `LIDAR_YAW`) làm
heading lệch vài độ như với pose đặt tay.

## 6. Tệp

| Tệp | Vai trò |
|---|---|
| `robot/ros2_ws/src/robot_navigation/robot_navigation/pose_bootstrap_core.py` | Tìm kiếm khớp scan với map (numpy, không ROS) |
| `robot/ros2_ws/src/robot_navigation/robot_navigation/pose_bootstrap_config.py` | Cấu hình theo map, pose lưu |
| `robot/ros2_ws/src/robot_navigation/robot_navigation/pose_bootstrap.py` | Node ROS |
| `robot/ros2_ws/src/robot_navigation/config/pose_bootstrap.yaml` | Tham số node |
| `robot/robot_maps/map2.pose_bootstrap.yaml` | Cấu hình cho map2 |
| `robot/tools/localization/` | Đánh giá offline trên bag |
