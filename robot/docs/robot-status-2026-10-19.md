# Trạng thái robot ngày 19/10/2026: S3 đã triển khai, S4/S5a, IMU, CPU

Báo cáo theo ngày; số liệu đúng cho ngày và commit đã nêu. Trước khi làm gì,
phải kiểm lại máy thật. Lệnh trong tài liệu này **không** phải lời cho phép
vận hành robot. Bằng chứng gốc (bag, log, script) nằm ngoài Git, trên MiniPC,
ở `$HOME/amr_logs/runs/<phiên>/` (liệt kê ở cuối).

## Tóm tắt cho người hoặc AI tiếp quản

| Hạng mục | Trạng thái 19/10 |
|---|---|
| Nav2 Baseline V1 | Giữ nguyên (overlay `smoothws`, `sct-nav-smooth` `73b8630`). S4 lượt đi: 80.7 s, 0 recovery, mượt bằng hoặc hơn B2c |
| **DDS isolation** | **S3 DEPLOYED trên MiniPC, ISOLATED** (chi tiết bên dưới). `amr-rviz` legacy và CLI direct-DDS từ laptop không còn dùng được |
| R3 qua Wi-Fi khi robot chạy (S5a) | **Robot không bị ảnh hưởng** dù 2 lần roam và RTT 2.1 s. Hình trên laptop trễ vài giây lúc roam |
| CPU khi Quest stream chạy | **Bão hoà, khoảng 97 %**. 6 lần FollowPath ACK timeout dẫn tới 11 recovery. Chưa có đối chứng A/B |
| IMU BNO085 | Đã câm âm thầm trong S5a. Đã tìm ra cơ chế. **Sửa ở PR #63 (merged), CHƯA FLASH** |
| Né người | Né được, nhưng chạy 0.15–0.19 m/s khi mép xe cách người 2.5–10 cm. Chưa có tầng an toàn |
| Initial Pose qua guard | ACCEPTED trên robot thật. Có lỗi báo NO_ANSWER giả (stamp), chưa sửa |

## 1. DDS isolation S1→S2→S3

Code: `main` `ad71a6c` (PR #62), dùng từ worktree MiniPC `$HOME/sct-r3-deploy`.
Phiên: `runs/20261019_141001_r3_dds_preflight/` (backup `.env`, unit, ss, ps,
provenance trong `backup/`).

- **S1** (`discovery-server-stage s1`, sudo):
  - server chạy `--server-id 0 -l 127.0.0.1 -p 11811`; dữ liệu ngang mốc;
  - từ laptop thật, 5 kiểu probe (client/super client, DS qua LAN/Tailscale,
    multicast) đều nhận 0 message;
  - **đối chứng dương:** UDP đi được hai chiều cả LAN lẫn Tailscale, và qua một
    DS tạm (domain 77) laptop nhận 123 message. Phép thử vì vậy có giá trị.
- **S2** (`.env` `ROS_LOCALHOST_ONLY=1`):
  - **Lần khởi động đầu lỗi:** 5 node không đăng ký với DS (`rplidar_node`,
    `amcl`, `lifecycle_manager_localization`, `smoother_server`,
    `velocity_smoother`); không có `/scan`; khoảng 60 s sau lifecycle báo
    `map_server IS DOWN`. Đã rollback về S1 (`.env` khớp từng byte với backup)
    và S1 khoẻ lại.
  - **Nguyên nhân chưa xác định.**
    - Không tái hiện được offline: 25 node Python; đủ 20 node Nav2 thật; trình tự
      LO=0 rồi LO=1 trên cùng server.
    - 4/4 lần khởi động sạch sau đó đều đủ node.
    - SHM cũ (14 port không ai map) cũng có mặt ở các lần thành công, nên không
      đủ giải thích.
    - Giả thuyết còn lại: ngay trước lần lỗi có nhiều participant lạ (probe LAN,
      super client từ laptop) đăng ký vào chính server đó.
  - Mọi lần sau đều phải chạy health gate sau khởi động (bên dưới).
- **S3** (`discovery-server-stage s3 --env …`, sudo): **PASS**
  - server `-x /etc/fastdds/discovery_server_loopback.xml` (giống từng byte bản
    trong repo); socket chỉ trên `127.0.0.1`;
  - `check-dds-isolation`: **ISOLATED, 0 FAIL, exit 0**; không process DDS nào có
    socket UDP ngoài loopback;
  - dữ liệu: scan 11.3–11.4 Hz (gap ≤ 0.093 s), odom 19–21 Hz, wheel 44 Hz;
    map, tf_static và URDF đều nhận được; graph 22/22 node; 0 heartbeat failure;
    một lần khởi động sạch đạt;
  - từ laptop: 0/5 đường DDS nhận được; UDP vào 11811 bị ICMP unreachable;
    `amr-rviz --r3` LIVE.
- **Rollback S3 → S1:**
  `sudo $HOME/sct-r3-deploy/robot/scripts/discovery-server-stage s1 --env $HOME/smart-campus-tour/robot/.env`,
  rồi đưa `.env` về 0, rồi `original`, theo
  [r3-dds-readiness-2026-10-17.md](r3-dds-readiness-2026-10-17.md).

**Health gate trước khi giao goal**, đề xuất; hiện là script ngoài Git
`~/amr_logs/tools_r3s5/{graphsnap,dataprobe,preflight}.py`:
- graph có đủ `rplidar_node`, `amcl`, `map_server`, `controller_server`,
  `planner_server`, `bt_navigator`, `stm32_bridge_node`, `ekf_filter_node`, hai
  lifecycle manager, `velocity_smoother`, guard và bridge;
- `/scan` ≥ 10 Hz, gap < 0.3 s; odom ≥ 15 Hz; map latched;
- `check-dds-isolation` exit 0;
- sau khi flash PR #63: thêm `/diagnostics` `stm32_bridge_node: imu` phải là OK.

**Vận hành ở S3:**
- Mọi terminal ROS trên robot phải là terminal **mới**, source theo thứ tự:
  `ROBOT_RUNTIME_ROOT=$HOME/smart-campus-tour/robot`, rồi
  `$HOME/sct-r3-deploy/robot/scripts/source-minipc`, rồi overlay `smoothws`.
- Terminal mở từ trước S2 vẫn giữ `ROS_LOCALHOST_ONLY=0`, nên `send_goal` đứng
  ở "Waiting for an action server" mãi. Đây là hành vi đúng của cơ chế cô lập,
  không phải lỗi.

## 2. S4: A→B→A chưa cô lập (`runs/20261019_134512_S4_AB_4K8sH0/`)

- **Lượt đi:** 80.7 s (B2c 81.6), 0 recovery, `|dω/dt|` p95 0.26 (B2c 0.32), 0
  lần chạm giới hạn bánh, `/scan` 0 lần hở. Sai số AMCL ở đích 0.12 m.
- **Lượt về (người cố ý chắn):**
  - Nav2 phát hiện và đi vòng qua, nhưng robot **vẫn chạy 0.15–0.19 m/s khi mép
    footprint cách người 2.5–10 cm** (24 scan dưới 5 cm khi đang chạy);
  - spin recovery còn quay ngay cạnh người.
  - Nguyên nhân có khả năng nhất: kiểm va chạm của RPP chỉ chiếu theo quỹ đạo
    phía trước; V1 không có tầng an toàn độc lập theo khoảng cách
    (`collision_monitor`).
  - **Không thử né bằng người thật** cho tới khi có tầng an toàn.
- Initial Pose qua `initialpose_guard`:
  - lần 1 **ACCEPTED**;
  - lần 2 báo **NO_ANSWER giả**: AMCL đóng stamp `amcl_pose` cũ hơn stamp guard
    forward 0.081 s, trong khi `on_amcl` chỉ chấp nhận lệch 0.05 s
    (`initialpose_guard.py`). Pose vẫn được AMCL áp dụng.

## 3. S5a: RViz R3 mở suốt A→B→A ở S3 (`runs/20261019_162513_r3_S5a_AB_1f975a/`)

**Mục tiêu R3: đạt.**
- Robot roam 2 lần (A+22.9 s, B+76 s, lần sau mất liên kết khoảng 0.6 s). Từ
  laptop, ping mất 1.3 %, RTT tối đa 2.1 s.
- Trên robot: `/scan` 0 lần hở > 0.3 s; trễ DDS publish→receive trung vị 0.7 ms,
  p99 9 ms; FB STM32 0 lần hở và 0 ERR; bridge 0 lần mất client.
- Phần dồn ứ nằm trong hàng đợi TCP của SSH (Send-Q tới 660 kB), không chặn DDS
  như B2 (27 lần `/scan` hở).
- Hình trên laptop có thể trễ vài giây lúc roam: đủ để giám sát, không dùng để
  điều khiển.

**Vấn đề chiếm ưu thế: CPU.**

| | B2c | S4 | S5a |
|---|---|---|---|
| Thời gian lượt đi / về | 81.6 / 83.5 s | 80.7 s | 99.7 / 89.0 s |
| Recovery | 0 | 0 | 5 / 6 |
| FollowPath "Timed out … acknowledge goal" | 0 | 0 | **6** |
| BT tick rate exceeded | 0 | 1 | 597 |

- BT `default_server_timeout: 20` ms bị vượt khi máy bận **97 %**. Hậu quả:
  FollowPath abort, spin/wait recovery, một lần quay thừa +177° ở đích. Không
  có lần nào gắn với vật cản.
- Tải đo được (% của một nhân):
  - Quest stream: `ffmpeg` xoay 21° trên CPU, `scrcpy` giải mã H.264 bằng phần
    mềm; tổng khoảng 150 %, ở nice 0;
  - bag recorder khoảng 70 %; Nav2 + driver khoảng 75 %; R3 (bridge + guard +
    sshd) khoảng 20 %.
  - Encode của Quest đã dùng VAAPI. Nhiệt độ package 83–85 °C.
- **Chưa chứng minh nhân quả.** Cần chạy A/B: Quest `Nice=10` so với tắt hẳn
  (do chủ service quyết). Chỉ sau đó mới cân nhắc Baseline V2
  (`default_server_timeout` lớn hơn) hoặc giảm tải Quest.
- Ghi chú khác: một vật cản thật (không có trên map) ở (7.87, 3.80); robot né
  với khoảng hở 0.227 m.
- Logger độ trễ phía laptop đã mất dữ liệu, vì nó chỉ ghi khi thoát bình
  thường. Logger sau phải ghi theo dòng.

## 4. IMU BNO085 câm âm thầm (`runs/20261019_165741_imu_diag/`)

**Đã xác nhận:**
- FB `yaw_valid=0` 100 %.
- `DIAG` (phần đo trước khi reset chip): `ACK, SCAN=4A, EXTPU=11`, bus rảnh,
  `RV_NONE, PKT=0, REC=2, WARN=1`.
- `DIAG` bật lại report thì 1221/1221 mẫu hợp lệ.
- STM32 không re-enumerate USB từ 13:08. IMU mất ở khoảng giữa 13:57 và 16:36,
  nên **S5a chạy khi không có IMU** (yaw EKF trùng yaw tính từ odom bánh).
- Cơ chế: firmware chỉ bật report một lần lúc boot; bridge bỏ qua
  `yaw_valid=0` mà không cảnh báo.

**Chưa biết:** vì sao chip reset hay bus bị giữ. Nguồn, nhiễu, cắm/rút USB mới
là giả thuyết.

**Sửa (PR #63, đã merge vào `main` `f777225`, chưa flash):**
- firmware: quá 500 ms không có mẫu thì gửi lại Set Feature, tối đa 1 lần/2 s,
  khoảng 6.7 ms mỗi lần;
- FB thêm `imu_rearm`, `imu_reset_seen` (19 trường); DIAG thêm `REARM`, `RST`;
- bridge: WARN/INFO và `/diagnostics` `<node>: imu`.

Chi tiết: [PROTOCOL_FB.md](PROTOCOL_FB.md),
`firmware/stm32/motor_controller/docs/IMU_BNO085.md`.

**Nghiệm thu sau flash** (kê robot cho bánh không chạm đất):
1. Boot: FB có 19 trường, `imu_rearm=0`.
2. Gửi `DIAG`.
3. Ngắt **riêng** nguồn BNO085 khoảng 1 s bằng jumper có công tắc (lắp sẵn lúc
   tắt nguồn; không rút dây I2C khi đang chạy).
4. Để BNO mất nguồn khoảng 30 s trong khi gửi CMD tốc độ thấp.
5. Chạy A→B→A.

## 5. Việc tiếp theo (đề xuất, theo thứ tự)

1. Flash PR #63 và nghiệm thu IMU (mục 4).
2. Chạy A/B về CPU với Quest (cần chủ Quest đồng ý).
3. Chạy lại S5a khi IMU hoạt động, với logger laptop ghi theo dòng.
4. Sửa lỗi stamp của guard; đưa health gate vào repo.
5. Tầng an toàn né người (collision_monitor), làm như Baseline V2.
6. Sau S5: gỡ `openssh-server` và key `minipc-r3-test` khỏi laptop nếu không cần
   nữa (đã cài để chạy probe từ laptop thật).

## Bằng chứng (MiniPC, ngoài Git)

| Phiên | Nội dung |
|---|---|
| `runs/20261019_134512_S4_AB_4K8sH0/analysis_claude/` | REPORT.md S4, metrics, phân tích tiếp cận người |
| `runs/20261019_141001_r3_dds_preflight/` | backup, s1/s2/s2b/s2_restart*/s3/s3_restart, repro, S2_RETRY_REPORT.md, S3_REPORT.md, R3_S1-S3_DEPLOY.md, S5_ACCEPTANCE.md |
| `runs/20261019_162513_r3_S5a_AB_1f975a/` | bag 833 s, scanprobe, cpu, wifi, sshq, laptop/ping, analysis/REPORT.md, IMU_CPU_FINDINGS.md |
| `runs/20261019_165741_imu_diag/` | serial_raw.log, summary.json, REPORT.md |
| `$HOME/amr_logs/AMR_MASTER_CONTEXT.md` | context vận hành đầy đủ cho phiên tiếp theo |
