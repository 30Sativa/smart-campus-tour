# Cô lập DDS của robot và debug từ xa bằng RViz qua SSH (R3)

**Trạng thái (17/10):** đường debug S0b đã chạy trên robot thật; wrapper,
adapter và guard được harden qua review đứng yên. Discovery server,
`robot/.env`, mạng, SSH và Nav2 Baseline V1 chưa đổi. Chỉ overlay debug riêng
được cập nhật. Các bước cô lập DDS vẫn ở mục 8, chưa thực hiện.

**Review điều kiện chuyển đổi:**
`robot/docs/r3-dds-readiness-2026-10-17.md` đối chiếu runtime MiniPC với R3
và hướng dẫn dùng helper mới với install V1 hiện tại. Có thể chuyển S1–S3
khi robot đứng yên ở vị trí chưa biết trên map; Initial Pose hợp lệ để sau.
Vẫn cần phiên bảo trì, sudo, stop/restart toàn bộ ROS process và kiểm từng
bước. Đây là kết luận sẵn sàng triển khai, không phải xác nhận đã cô lập.

**Cập nhật review S0b:** người vận hành đã xác nhận RViz thật hiện map, LiDAR, TF và
RobotModel sau khi source workspace laptop. Những sửa tiếp theo gồm wrapper
`amr-rviz --r3`, cleanup, kiểm dữ liệu cũ và guard protocol v2 (`sent_at` bắt
buộc). Đây không phải bằng chứng S1–S3 đã được áp dụng, cũng không thay cho
kiểm thử localization/navigation. Trạng thái nguồn và overlay được ghi ở
[project-status.md](project-status.md); tiêu chí chuyển đổi/rollback ở
[r3-dds-readiness-2026-10-17.md](r3-dds-readiness-2026-10-17.md).

**Đính chính so với đề xuất v2:**
- `fastdds discovery -l 127.0.0.1` **không** đóng discovery; socket vẫn bind
  `0.0.0.0`.
- Kết luận "chỉ cần bind server là cô lập" (case E1c) là sai. E1/E1c chỉ đo
  luồng dữ liệu, không đo discovery.
- Bước đóng discovery thật là S3 (profile XML).

Không ảnh hưởng Nav2 Baseline V1: các file runtime của V1 (`robot_control`,
`robot_nav_plugins`, `robot_description`, `navigation.launch.py`,
`localization.launch.py`, params) giống từng byte với `dfcf889`. Phần mới đều
là thêm vào và chạy bằng launch riêng.

## 1. Vì sao

- **Nav2 Baseline V1, giới hạn 1.** Một subscriber ở laptop qua Wi-Fi làm treo
  publisher `/scan` trên robot.
  - Lý do: Fast DDS 2.6 mặc định gửi `SYNCHRONOUS`, với socket blocking.
  - Hậu quả ở B2: `/scan` bị hở 27 lần, có lần tới 2.5 s; AMCL mất dữ liệu,
    FollowPath bị huỷ.
- **Thí nghiệm trong network namespace**, mô phỏng link đứng 3–4 s:
  - cấu hình hiện tại: `publish()` bị chặn 5.5 s;
  - chỉ bật `ASYNCHRONOUS`: vẫn chặn 2 s;
  - `non_blocking_send`: mất scan âm thầm khi dữ liệu cục bộ đi qua UDP;
  - cô lập: 0 lần hở.
- **Laptop ở mạng Wi-Fi khác**, khác subnet với robot (địa chỉ nội bộ được
  lược khỏi tài liệu công khai).
  - Robot và laptop cách nhau 2 hop, RTT 3–312 ms.
  - Fast DDS gửi mỗi bản tin tới **mọi** IP mà reader khai báo, kể cả IP
    Tailscale của laptop nếu Tailscale còn chạy.
- **Bảo mật.** Discovery server nghe `0.0.0.0:11811` trên mạng trường. DDS
  không có xác thực, nên bất kỳ máy nào trong trường cũng publish được
  `cmd_vel` vào robot.

Chi tiết và số liệu: `~/amr_logs/dds_isolation/PROPOSAL_v2.md` trên miniPC.

## 2. Kiến trúc

Sơ đồ dưới là đích sau S3. Trong S0b robot vẫn dùng DDS chưa cô lập.

```text
miniPC (robot)                                               laptop (Wi-Fi khác)
┌───────────────────────────────────────────────┐
│ domain 30, chỉ loopback/SHM                   │
│ discovery server 127.0.0.1:11811              │
│ Nav2, AMCL, EKF, STM32 bridge, LiDAR...       │
│   ▲ subscribe cục bộ        │ initialpose     │
│ foxglove_bridge         initialpose_guard     │
│ 127.0.0.1:8765          127.0.0.1:8766        │◄═ ssh -N -L 8765 -L 8766 (key)
│ (chỉ đọc)               (chỉ initial pose)    │        ║  TCP, mã hoá
└───────────────────────────────────────────────┘        ▼
                                  fox2ros ─► DDS riêng của laptop (LOCALHOST_ONLY,
                                             domain 42) ─► RViz2 (navigation.rviz)
```

- **Không node nào ngoài robot** tham gia graph DDS của robot. Dữ liệu rời
  robot chỉ qua hai cổng loopback, và chỉ khi có người mở SSH tunnel.
- **Bridge chỉ đọc.**
  - `foxglove_bridge` 3.6.0 **không thực thi `client_topic_whitelist`**: một
    client thử nghiệm đã publish được `/robot_01/cmd_vel` qua nó.
  - Vì vậy bridge chạy không có `clientPublish`. Với cấu hình này, bridge đã
    từ chối mọi client channel (đo được: 0 bản tin `cmd_vel` lọt qua).
- **Đường ghi duy nhất là initial pose.** Nó đi tới `initialpose_guard` qua
  một cổng riêng, bằng giao thức JSON một chức năng.
- **Backend và Digital Twin** không dùng DDS (`fleet_bridge` dùng SignalR,
  ADR-0008), nên không bị ảnh hưởng. `fleet_bridge` phải theo cùng nguyên tắc:
  là tiến trình riêng, và I/O mạng không bao giờ chặn callback ROS.

## 3. Thành phần

| File | Chạy ở | Vai trò |
|---|---|---|
| `robot_navigation/launch/debug_bridge.launch.py` | robot | Chạy bridge và guard; dừng launch không ảnh hưởng Nav2. Báo cách cài nếu thiếu `foxglove_bridge` |
| `robot_navigation/config/debug_bridge.yaml` | robot | Bridge: `127.0.0.1`, chỉ đọc, allowlist topic, buffer 4 MB |
| `robot_navigation/robot_navigation/initialpose_guard.py` | robot | Cổng `127.0.0.1:8766`; kiểm tra rồi mới chuyển `initialpose`; báo kết quả |
| `robot/scripts/check-dds-isolation` | robot | Kiểm tra chỉ đọc: env, socket DDS, bậc của server (bắt được E1b và lệch S3/`.env`), bind của bridge, sshd |
| `robot/scripts/discovery-server-stage` | robot (sudo) | Đổi server từng bậc `original ↔ s1 ↔ s3` bằng một drop-in; kiểm tra rồi tự quay lại nếu hỏng |
| `robot/scripts/foxglove-bridge-portable` | robot | Cài bridge **không qua apt**: hai `.deb` ghim phiên bản và sha256, giải nén vào `~/.local/opt` |
| `robot/config/fastdds/discovery_server_loopback.xml` | robot | Profile cho discovery server: mọi socket trên `127.0.0.1` (S3) |
| `robot/scripts/source-minipc` | robot | Chặn discovery LAN với localhost-only, S2 trước S1 và S3 với node chưa localhost-only; `ROBOT_RUNTIME_ROOT` chọn install runtime khi helper nằm ở worktree khác |
| `robot/tools/rviz_over_ssh/rviz-over-ssh` | laptop | Mở tunnel, chạy `fox2ros` và RViz; tự nối lại; dọn tiến trình khi thoát |
| `robot_navigation/robot_navigation/scan_rviz.py` | laptop | Utility có sẵn, không đổi code: chiếu scan trong DDS laptop, tránh đợi TF cuối scan ở UI RViz |
| `robot/tools/rviz_over_ssh/fox2ros.py`, `fox2ros_topics.yaml` | laptop | WebSocket → DDS cục bộ của laptop (chuyển nguyên CDR); gửi initial pose |
| test: `test_debug_bridge_contract.py`, `test_initialpose_guard.py`, `tools/rviz_over_ssh/test_fox2ros.py`, `scripts/tests/` | — | Hợp đồng bảo mật, guard, giao thức, reconnect, script (`verify` Tier 1.7) |

`remote_rviz.launch.py` (`scan_rviz`, `tf_rviz_relay`) được giữ lại để
rollback. Sau S2 nó không còn chạy được.

## 4. Dùng hằng ngày

Trên laptop hiện tại, lệnh vận hành là `amr-rviz`: mặc định vẫn gọi nguyên
script cũ đã lưu thành `~/.local/bin/amr-rviz.legacy`. Chọn R3 bằng:

```bash
amr-rviz --r3
# Robot chưa được định vị: kiểm TF/model/scan cục bộ trong odom.
amr-rviz --r3 -f odom
```

Wrapper source Humble và workspace laptop ở
`~/Desktop/smart-campus-tour/robot/ros2_ws/install/setup.bash`; chọn workspace
khác bằng `AMR_ROS_WS_SETUP`. `AMR_RVIZ_TARGET` chọn SSH user/host; nếu truyền
đối số positional thì dùng `<user>@<ip-robot>`. Mọi option được chuyển cho
`rviz-over-ssh`.
Thiếu workspace hoặc `robot_description` thì dừng trước khi mở cửa sổ lỗi.
R3 không tự fallback sang DDS cũ. Sau S2, `--legacy` chỉ dùng được khi đã
rollback cấu hình robot theo mục 8.

Để cài từ checkout R3 trên laptop (không phải trên miniPC): lưu script cũ
thành `amr-rviz.legacy` trước, chép `amr-rviz`, `rviz-over-ssh`, `fox2ros.py`,
`fox2ros_topics.yaml` và `navigation.rviz` từ `robot/tools/rviz_over_ssh/` vào
`~/.local/share/amr-rviz/r3/`, rồi liên kết `~/.local/bin/amr-rviz` tới wrapper
đã chép. Thư mục cài độc lập với vòng đời worktree. Không ghi đè bản legacy.
Rollback lệnh laptop bằng bản legacy đã lưu; không cần sửa robot để chỉ dừng R3.

Trên robot, ngoài navigation như cũ:

```bash
ros2 launch robot_navigation debug_bridge.launch.py robot_id:=robot_01
```

Trên laptop: source ROS Humble và workspace có `robot_description` (để RViz
hiện mesh), rồi chạy:

```bash
robot/tools/rviz_over_ssh/rviz-over-ssh <user>@<ip-robot>
```

- RViz mở `navigation.rviz` trong namespace `/robot_01`, cùng tên topic như
  trên robot.
- Layout R3 riêng ở `robot/tools/rviz_over_ssh/navigation.rviz`: bật scan/model
  sẵn; bỏ panel Nav2, Goal Tool và Astra không được bridge chuyển tiếp. Layout
  Nav2 V1 và layout legacy giữ nguyên. `2D Pose Estimate` vẫn qua guard.
- Launcher chạy thêm `scan_rviz` có sẵn trên laptop, cùng domain cục bộ; không
  dùng TF relay và không subscribe DDS của robot. Output PointCloud2
  `/robot_01/scan_rviz` giữ stamp scan, target frame bằng Fixed Frame (lấy từ
  config hoặc `-f`). Không có TF tại stamp đó thì bỏ scan ngay; không đợi trong
  UI, không dùng TF "latest", không sửa timestamp. Raw scan trên robot không đổi.
- Kết quả "2D Pose Estimate" in ở terminal với tiền tố `[robot]`.
- Không tới được robot: Nav2 Goal, panel Nav2 (action/service), param,
  `cmd_vel`.
- Debug bằng CLI (`ros2 topic`, `ros2 bag`): SSH vào robot rồi chạy ở đó.

## 5. Topic, namespace, QoS

- Topic của robot nằm trong `/robot_01/...`; TF là global (`/tf`,
  `/tf_static`). Tên và kiểu topic đã đối chiếu với bag B2c.
- Publisher của `fox2ros` phía laptop luôn `RELIABLE`, nên khớp mọi yêu cầu RViz.
  - Topic latched (`map`, `tf_static`, `robot_description`, costmap,
    `amcl_pose`) dùng `TRANSIENT_LOCAL`: RViz mở sau, hoặc mở sau khi nối lại,
    vẫn nhận ngay.
  - Stream (`scan`, `tf`, footprint, plan, particle cloud) dùng `VOLATILE`.
  - Riêng cloud suy ra bởi `scan_rviz` là BEST_EFFORT/VOLATILE, depth 1;
    layout R3 yêu cầu đúng QoS đó. Đây là topic cục bộ, không phải downlink mới.
- Đã kiểm bằng một probe subscribe **đúng QoS ghi trong `navigation.rviz`**:
  0 lỗi incompatible QoS. Probe vào muộn nhận map, costmap và TF trong
  0.1–5 s.
- **Bridge 3.6.0 có cuộc đua discovery/QoS:** channel có thể được quảng bá trước
  khi `get_publishers_info_by_topic()` có endpoint. Khi đó bridge chọn
  BEST_EFFORT/VOLATILE và mất map/TF tĩnh đã publish. Đã tái hiện trên miniPC
  khi restart bridge. Adapter chờ 2 s trước subscribe topic latched; nếu chưa
  có dữ liệu của map, TF tĩnh hoặc model sau 30 s thì unsubscribe, đợi rồi thử
  lại để bridge tạo reader với metadata mới. Không lặp lại map đã nhận.
  Bridge chia sẻ reader giữa client: adapter cũ giữ subscription sai có thể
  cản sửa QoS; nâng các adapter cùng lượt và đóng client cũ khi xử lý lỗi này.
  `LIVE` yêu cầu scan mới **và** đủ map/TF tĩnh/model của kết nối hiện tại.
- Global costmap (khoảng 2.8 MB, 1 Hz) mặc định tắt. Thêm `-e
  global_costmap/costmap` để nhận một snapshot mỗi 10 s.
- Thêm topic: sửa **cả** `fox2ros_topics.yaml` và `topic_whitelist`. Contract
  test kiểm hai file khớp nhau.

## 6. Initial pose

```text
RViz "2D Pose Estimate" -> /robot_01/initialpose (laptop)
  -> fox2ros -> JSON line -> tunnel -> initialpose_guard
  -> REJECTED | FORWARDED -> /robot_01/initialpose (AMCL)
  -> ACCEPTED | DIFFERENT | NO_ANSWER
```

Guard từ chối khi:
- **còn goal đang chạy** (ACCEPTED, EXECUTING hoặc CANCELING) trên bất kỳ
  action nào có thể làm robot di chuyển: `navigate_to_pose`,
  `navigate_through_poses`, `follow_waypoints`, `follow_path`, `spin`,
  `backup`, `drive_on_heading`, `assisted_teleop`, `wait`, `go_to_stop`.
  - Lý do: robot có thể **đang đứng yên tạm thời** (controller chờ, recovery
    Wait, gặp vật cản). Khi chạy tiếp, nó sẽ bám theo một `map→odom` vừa bị
    nhảy.
  - Đã kiểm với bt_navigator thật: goal active, robot không chạy được →
    `REJECTED ... navigate_to_pose, follow_path`; huỷ goal → `FORWARDED`.
  - Nếu action server đã chết mà trạng thái cuối vẫn là EXECUTING (latched),
    guard không chặn, vì không còn ai điều khiển được robot.
- robot không đứng yên **suốt 0.5 s**: có bất kỳ mẫu odom nào > 0.02 m/s hoặc
  > 0.05 rad/s, có ít hơn 3 mẫu, hoặc có `cmd_vel` khác 0 (teleop, controller).
  - Số liệu từ bag B2c: khi đứng yên, EKF cho `v = 0` và `|ω|` ≤ 0.026, nên
    không bị từ chối nhầm.
  - 0.6 % số mẫu lấy lúc đang chạy nằm dưới ngưỡng (lúc khởi động hoặc dừng).
    Đó là lý do phải xét cả cửa sổ chứ không xét một mẫu.
- odom cũ hơn 0.5 s, hoặc không nhận được odom trong 2 s;
- frame khác `map`;
- giá trị NaN/inf, hoặc quaternion suy biến;
- bấm hai lần trong vòng 1 s;
- request sai định dạng, hoặc dài hơn 8 KiB.
- request protocol v1 thiếu `sent_at`, quá 2 s hoặc hơn 0.5 s trong tương lai;
  kiểm lại hạn dùng ngay trước khi publish sau cửa sổ lấy odom;
- request khác đang được kiểm hoặc đang chờ AMCL xác nhận; client đã ngắt
  kết nối trong lúc kiểm. Những request này không xếp hàng.

Một số chi tiết khác:
- **Odom và `cmd_vel` lấy theo yêu cầu:** guard chỉ subscribe hai topic này
  khi có request. Topic trạng thái action được subscribe thường trực, vì là
  latched và chỉ phát khi goal đổi trạng thái.
  - Đo được: subscription thường trực 25 Hz tốn khoảng 7 % một core J5005.
  - Lấy theo yêu cầu: lúc rảnh khoảng 0.4 %; lấy được mẫu trong khoảng 26 ms
    (tối đa 0.9 s).
- **Stamp:** thay bằng đồng hồ robot, vì đồng hồ laptop có thể lệch.
- **Khi link đứt:** không gửi mới, không retry request cũ. Request đã vào TCP
  được guard chặn khi quá hạn; đây là hạn dùng 2 s, không phải bảo đảm thu hồi
  một request đã tới robot. Adapter chỉ cho gửi khi có scan mới (cả thời điểm
  nhận lẫn header stamp), guard READY và không có request đang chờ.
- **Phản hồi bị đứng:** sau 5 s adapter báo `NO_ANSWER`, nối lại, không phát lại
  request. Kết quả cuối chỉ là `ACCEPTED`, `DIFFERENT`, `REJECTED`, `ERROR` hoặc
  `NO_ANSWER`; `FORWARDED` chưa phải xác nhận AMCL.
- **Dữ liệu cũ:** transport còn UP/pong nhưng scan đứng hoặc header cũ quá 2 s
  thì báo `STALE`; RViz có thể vẫn giữ map/model cũ. Có scan mới lại báo `LIVE`.
- **Đồng hồ:** độ chênh stamp gồm cả clock skew và trễ mạng. Một giá trị dương
  lớn không đủ để kết luận NTP sai; kiểm cả NTP và link. Timestamp của map
  latched và TF tĩnh có thể cũ một cách bình thường.
- **Cảnh báo vô hại:** AMCL có thể in `Failed to transform initial pose in
  time`. Robot đứng yên nên không cần bù odom; hiện tượng này cũng có khi đặt
  pose từ RViz trên robot.

## 7. Mạng chập chờn và bảo mật

**Reconnect.** Đo trong namespace, có tunnel thay cho `ssh -L`:

| Sự kiện | Kết quả |
|---|---|
| Tunnel đứt 11 s | DOWN ngay; bấm pose lúc đó → `NOT sent`; nối lại 1 s sau khi tunnel có lại; bấm tiếp → `ACCEPTED` |
| Bridge bị kill (SIGKILL) | launch respawn sau 2 s; `fox2ros` nối lại và subscribe theo channel id mới trong khoảng 3 s |
| Link đứng 4 s | `/scan` phía robot hở tối đa 0.12 s; RViz có dữ liệu mới lại sau khoảng 0.8 s |
| Link sống nhưng không có dữ liệu 10 s | `fox2ros` tự đóng kết nối và nối lại |
| Robot bận CPU | Dữ liệu sang laptop có thể trễ vài giây rồi bắt kịp; phía robot không đổi |

**Bề mặt bảo mật:**

| Bề mặt | Trước | Sau R3 |
|---|---|---|
| Graph DDS robot (`cmd_vel`, param, lifecycle) | mở cho cả mạng trường, không xác thực | dữ liệu chỉ loopback/SHM sau S2; discovery đóng sau S3 |
| Bridge 8765 | — | `127.0.0.1`, chỉ đọc, allowlist, không param/service/asset |
| Guard 8766 | — | `127.0.0.1`, chỉ initial pose, kiểm tra chặt |
| Truy cập vào hai cổng | — | chỉ qua SSH (người có SSH vào robot vốn đã làm được mọi thứ) |
| CPU | — | bridge và guard chạy `nice -n 10`: một client gây quá tải chỉ làm chậm phần hiển thị, không lấy CPU của Nav2 |

**Không bao giờ** đổi `address` của bridge sang `0.0.0.0` hay IP LAN, và
không bật `clientPublish`. Contract test chặn cả hai.

**Khuyến nghị, chưa làm (cần sudo):**
- SSH chỉ cho đăng nhập bằng key; hiện vẫn nhận mật khẩu.
- Xoá key tạm `codex-amr-tf2-temporary-test`.
- Xem lại RustDesk và mediamtx đang mở cho cả mạng trường.

## 8. Chuyển đổi trên robot (user chạy, mỗi bước một thay đổi)

**Điều kiện chung:**
- Robot đứng yên khi đổi cấu hình.
- Thứ tự dừng như mọi khi: công cụ đo → bag → Nav2 (SIGINT).

**Cài code lên robot (không đụng Nav2 Baseline V1).** The exact safeguard
behavior described here is in the local R3 branch at `c4abcf3`; GitHub `main`
at the evidence snapshot has only the initial R3 code from PR #59. The
documentation PR does not add or deploy those later code commits.
- Robot chạy từ install cũ cộng overlay V1 (`~/.cache/armtc/smoothws`).
- Build overlay `robot_navigation` của R3 vào một thư mục **mới**, chồng lên
  `smoothws`, và **chỉ source nó trong terminal debug**. Terminal Nav2 vẫn dùng
  đúng môi trường V1.
- Các script (`check-dds-isolation`, `discovery-server-stage`,
  `foxglove-bridge-portable`) chạy thẳng từ checkout R3 đã được review, không
  cần build. Chọn đúng source ref trước khi vận hành; không lấy bản cũ từ
  checkout MiniPC đang bẩn.

```bash
mkdir -p ~/.cache/armtc/r3_runtime && cd ~/.cache/armtc/r3_runtime \
  && source /opt/ros/humble/setup.bash \
  && source ~/smart-campus-tour/robot/ros2_ws/install/setup.bash \
  && source ~/.cache/armtc/smoothws/install/setup.bash \
  && colcon build --base-paths ~/sct-dds-r3/robot/ros2_ws/src/robot_navigation
```

### S0: dựng đường debug mới khi chưa cô lập (an toàn, chưa cắt đường cũ)

**Không dùng `apt install` trên miniPC lúc này.** Lý do (đo ngày 17/10):
- `v4l2loopback-dkms` đang ở trạng thái half-configured (`iF`): bản build DKMS
  cho kernel 6.8 bị lỗi, và module đang dùng do thành viên khác build tay;
  `quest-stream.service` `modprobe` lại module này mỗi lần khởi động.
- `apt-get -s install ros-humble-foxglove-bridge` cho thấy apt sẽ cấu hình lại
  gói đó trong cùng lệnh. Nếu lỗi, dpkg kẹt ở trạng thái lỗi; nếu thành công,
  module của Quest có thể bị thay.

Vì vậy dùng bản portable:

1. Trên robot, không cần root:

   ```bash
   robot/scripts/foxglove-bridge-portable install --debs ~/amr_logs/deps/foxglove-bridge-3.6.0
   robot/scripts/foxglove-bridge-portable check
   ```

   - Kho ROS chỉ giữ bản mới nhất, nên hai `.deb` đã kiểm thử được lưu sẵn ở
     `~/amr_logs/deps/`.
   - Thiếu `--debs` thì script tải bằng `apt-get download` (không root, không
     đụng dpkg).
   - Sha256 được kiểm cho cả hai cách.
   - Gỡ: `foxglove-bridge-portable remove`.
2. Build overlay `robot_navigation` của branch (mục trên), rồi **trong một
   terminal riêng**:

   ```bash
   export ROBOT_RUNTIME_ROOT="$HOME/smart-campus-tour/robot"
   source "$HOME/sct-dds-r3/robot/scripts/source-minipc"
   source ~/.cache/armtc/smoothws/install/setup.bash
   source ~/.cache/armtc/r3_runtime/install/setup.bash
   source ~/.local/opt/foxglove-bridge-3.6.0/env.sh
   ros2 launch robot_navigation debug_bridge.launch.py robot_id:=robot_01
   ```

   - Terminal chạy Nav2 không source `env.sh`, nên không bị ảnh hưởng.
3. Trên laptop: kiểm tra `ssh -o BatchMode=yes <user>@<ip-robot> true` chạy
   được mà không hỏi mật khẩu, rồi chạy `rviz-over-ssh <user>@<ip-robot>`.
4. Đạt khi:
   - RViz nhận map, scan mới, TF, RobotModel; adapter báo LIVE;
     khi chưa định vị dùng `-f odom` kiểm scan/model, không yêu cầu map overlay
     đúng hoặc global costmap có dữ liệu;
   - trên robot, `ss -tlnp | grep -E '8765|8766'` chỉ có `127.0.0.1`;
   - `ps -o ni,comm -C foxglove_bridge` cho `10`.
   Initial Pose hợp lệ/AMCL ACCEPTED kiểm khi biết vị trí trên đúng map;
   guard với goal thật kiểm ở phiên được phép gửi goal. Hai bài này không
   chặn chuyển DDS. S0b hiện đã có bằng chứng đứng yên, không cần lặp toàn bộ.
5. Rollback: Ctrl+C launch debug. Gỡ hẳn: `foxglove-bridge-portable remove`.

### S1–S3: discovery server và `.env`

Thứ tự S1 → S2 → S3 là bắt buộc. Mỗi bước chỉ đổi một thứ, và sau bước nào
robot cũng chạy được (đã đo trong namespace, kể cả với đúng dòng `ExecStart`
do script sinh ra):

| Server | Node `LOCALHOST_ONLY=0` (hiện tại) | Node `LOCALHOST_ONLY=1` | Laptop discovery được? |
|---|---|---|---|
| `original` (hiện tại) | chạy | **hỏng** (E1b) | có |
| `s1`: `-l 127.0.0.1` | chạy | chạy | **vẫn có**: socket vẫn bind `0.0.0.0` |
| `s3`: profile `discovery_server_loopback.xml` | **hỏng** (an toàn: không lộ gì) | chạy | không |

`-l` chỉ đổi địa chỉ mà server **quảng bá**; chỉ có profile XML mới giới hạn
được socket.

Mọi thay đổi server đều qua `discovery-server-stage`. Script:
- chỉ đi từng bậc;
- từ chối khi stack/CLI daemon còn chạy, khi có drop-in lạ/bị sửa, hoặc khi
  `.env` không khớp với bậc đích;
- sau khi restart, kiểm tra service, command line thật và socket; hỏng hoặc
  bị INT/TERM/HUP thì **tự quay về bậc trước**. Không tự đổi `.env`, restart
  Nav2 hoặc nghiệm thu topic; SIGKILL/mất điện phải phục hồi thủ công.

Unit gốc không bị sửa; script chỉ dùng một file
`/etc/systemd/system/fastdds-discovery.service.d/10-dds-isolation.conf`.
`discovery-server-stage status` chạy không cần root.

Trước mỗi bước, kể cả S2: báo phiên bảo trì, chuẩn bị sudo/bản sao cấu hình,
dừng stack (công cụ đo → bag nếu có → debug → Nav2, SIGINT) và
`ros2 daemon stop` trong môi trường domain 30 hiện tại. Sau đổi, mở terminal
mới với helper R3 trỏ đúng runtime, chạy cùng V1 và debug, rồi checker cùng
probe dữ liệu. Không source install R3 vào terminal Nav2. Lệnh và rollback
cụ thể theo runtime đã kiểm: `robot/docs/r3-dds-readiness-2026-10-17.md`.

| Bước | Lệnh | Đạt khi | Rollback |
|---|---|---|---|
| S1 | `sudo robot/scripts/discovery-server-stage s1` | server thật có `-l 127.0.0.1`; dữ liệu cục bộ/R3 trở lại như trước, vẫn chưa cô lập | `sudo …stage original --env ~/smart-campus-tour/robot/.env` |
| S2 | sửa `~/smart-campus-tour/robot/.env`: `ROS_LOCALHOST_ONLY=1` | mọi node/daemon được tạo mới với env=1; checker hết FAIL node, chỉ còn FAIL socket server; scan/odom/TF cục bộ vẫn chạy | `.env` về `0` (server vẫn ở S1, chạy với cả hai) |
| S3 | `sudo robot/scripts/discovery-server-stage s3 --env ~/smart-campus-tour/robot/.env` | checker → `ISOLATED`, exit 0; R3 nhận dữ liệu mới và lịch sử; subscriber chỉ đọc từ LAN không nhận DDS trong khi robot vẫn có dữ liệu | `sudo …stage s1 --env …` |

Robot chưa định vị: AMCL chờ pose, thiếu map→odom và một số Nav2 lifecycle
chưa active là mốc đã biết, không phải lỗi DDS mới. Không yêu cầu Initial
Pose/A→B→A trước S1; không đặt pose giả để kiểm. Bag ngắn local có thể kiểm
sau S3. SSH warning là advisory, không tự sửa SSH trong phiên đổi DDS.

**Thang rollback** luôn đi qua S1, vì S1 chạy với cả hai loại node:
- S3 → S1 → (`.env` về `0`) → original.
- Script từ chối `original` khi `.env` còn `LOCALHOST_ONLY=1` (E1b).
- `source-minipc` từ chối `LOCALHOST_ONLY=0` khi server còn ở S3.
- `source-minipc` từ chối `LOCALHOST_ONLY=1` khi server còn original (E1b),
  kể cả `.env` đã trỏ `127.0.0.1`.

### S4–S6

| Bước | Nội dung | Đạt khi |
|---|---|---|
| S4 | Một vòng sạch theo runbook B2c | đạt bảng "hành vi kỳ vọng" của Baseline V1 |
| S5 | Một vòng với RViz qua SSH **mở suốt**, đi qua vùng roam như B2 | 0 lần `/scan` hở > 0.3 s, 0 huỷ FollowPath, scanprobe không có `sock_alloc_send_pskb`; RViz hồi sau mỗi lần roam. Đối chứng: B2 (27 lần hở) |
| S6 | Robot **đứng yên** (hoặc kê bánh), script hẹn giờ tắt Wi-Fi 30–60 s | TF, AMCL, Nav2 không gián đoạn; tunnel và `fox2ros` tự nối lại |

**Không thử mất mạng khi robot đang chạy:** dừng khẩn phần mềm (`stopkey.py`)
đi qua SSH. Tunnel phải dùng một kết nối SSH **riêng** với terminal dừng khẩn
(`rviz-over-ssh` đã đặt `ControlMaster=no`).

## 9. Phụ thuộc và ảnh hưởng tới người khác

- **miniPC:** `foxglove_bridge` 3.6.0 và `rosx_introspection` 2.3.0 ở dạng
  portable trong `~/.local/opt` (bước S0). Không qua apt, không root, không
  đụng dpkg, nên không chạm vào gói half-configured của thành viên khác.
  - Đây **không** phải dependency trong `package.xml`, nên rosdep, Docker image
    và CI không đổi.
  - Khi dpkg của máy đã sạch (`v4l2loopback-dkms` được người phụ trách xử lý),
    có thể chuyển sang apt và `apt-mark hold` hai gói này.
  - Bridge 3.x chỉ nhận protocol `foxglove.sdk.v1`. Nâng phiên bản bridge thì
    phải chạy lại test và E2E.
- **Laptop:** không thêm package. Cần ROS Humble, `rviz2`,
  `nav2_rviz_plugins`, workspace có `robot_description`, và SSH key.
- **Thành viên khác:** từ S2, mọi cách nối DDS thẳng vào robot sẽ ngừng chạy:
  `ROS_DISCOVERY_SERVER=<ip robot>`, `remote_rviz.launch.py`, container
  `ros2-debug`, `ros2 topic` từ laptop. Họ phải chuyển sang `rviz-over-ssh`
  hoặc SSH, nên cần báo trước. Backend, Digital Twin và Gazebo preview không
  đổi.

## 10. Đã kiểm thử và chưa kiểm thử

**Đã kiểm trước lượt review đứng yên (kết quả lịch sử):**
- 117 test: hợp đồng bảo mật; guard (gồm node thật với rclpy, goal active,
  server chết, chuyển động ngắn, `cmd_vel`); giao thức; reconnect với bridge
  giả; `discovery-server-stage` với `systemctl`, `ss` và `/proc` giả; profile
  server; `check-dds-isolation`; chốt chặn trong `source-minipc`. Có thêm test
  đóng băng của V1.
- 45/45 mutant của các kiểm tra an toàn bị bắt.
- E2E trong network namespace với AMCL, map_server, Nav2 và bt_navigator thật;
  bridge cài **portable** bằng `foxglove-bridge-portable`; discovery server
  bằng profile trong repo; probe theo QoS của `navigation.rviz`.
  - Kịch bản: tunnel đứt, bridge crash, link đứng, client tấn công, nối thẳng
    DDS hoặc nối thẳng cổng 8765, chạy nhầm adapter trên robot, goal Nav2
    active khi robot đứng yên.
  - Kết quả: `/scan` phía robot hở tối đa 0.14 s; `ISOLATED`; `nice` = 10.
- Dòng `ExecStart` mà `discovery-server-stage` sinh cho S1/S3 được chạy với
  `fastdds` thật, với cả hai loại node (bảng ở mục 8).
- `foxglove-bridge-portable`: cài từ bản sao, tải qua `apt-get download`, sai
  checksum, cài lại, gỡ; dpkg không thay đổi.
- E2E đã tìm ra và sửa:
  - bridge không thực thi `client_topic_whitelist`;
  - `-l` không giới hạn socket của server;
  - guard crash vì logger rclpy;
  - adapter chạy được trên robot;
  - guard tốn CPU do subscribe odom thường trực;
  - guard chấp nhận initial pose khi goal đang tạm dừng (bản trước của review
    này).

**S0b/review đứng yên:** RViz2 trên laptop thật, SSH thật, tunnel reconnect,
cold restart bridge, hash map/model, QoS, guard từ chối, cleanup và tài nguyên
được ghi riêng ở [project-status.md](project-status.md) và
[r3-dds-readiness-2026-10-17.md](r3-dds-readiness-2026-10-17.md).

**Vẫn chưa kiểm trên robot thật trong lượt này:**
- Initial pose hợp lệ/AMCL ACCEPTED tại vị trí đã biết trên đúng map.
- Roam Wi-Fi thật: dùng `tc` giả lập.
- systemd thật: drop-in, `daemon-reload` và restart với sudo; logic đã kiểm
  bằng `systemctl` giả, dòng lệnh đã kiểm bằng `fastdds` thật.
- `go_to_stop`, goal active và chuyển động: không kích hoạt trên robot thật.
- Băng thông khi roam/vận hành. Đo trong mô phỏng: bridge khoảng 1–4 %
  một core khi có laptop nối (0 khi không có client); guard khoảng 0.4 %;
  dữ liệu khoảng 0.2 MB/s, cộng 2.8 MB mỗi lần nối (map).

## 11. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `REJECTED: a goal is active on …` | Huỷ goal (hoặc chờ nó xong), rồi đặt lại pose. Robot đứng yên không có nghĩa là hết goal |
| `REJECTED: … cmd_vel …` | Teleop hoặc một nguồn lệnh khác đang gửi; dừng nó trước |
| `source-minipc`: `discovery server is loopback-only (S3)` | `.env` đã về `0` nhưng server còn ở S3: đặt lại `1`, hoặc `discovery-server-stage s1` |
| `discovery-server-stage`: `ROS nodes are running` | Dừng stack trước (CLI daemon không tính) |
| `fox2ros refused to start` | Còn `ROS_DISCOVERY_SERVER`, hoặc `LOCALHOST_ONLY` khác 1. Chỉ chạy qua `rviz-over-ssh` trên laptop, không chạy trên robot |
| `handshake refused ... 400` | Phiên bản bridge không dùng `foxglove.sdk.v1` |
| `connection closed during handshake` | Tunnel lên nhưng `debug_bridge.launch.py` chưa chạy trên robot |
| `not advertised by robot` | Topic đó chưa có publisher trên robot (stack chưa chạy, camera tắt…) |
| `SSH tunnel down` lặp lại | Không đăng nhập bằng key được (BatchMode), hoặc mất mạng |
| RViz không có `map→base_link` | Chưa đặt initial pose; xem dòng `[robot] ...` |
| `scan stamps differ from laptop time` | Kiểm NTP và độ trễ mạng; không tự đổi cấu hình robot |
| `STALE` nhưng transport UP | Scan chưa có, đứng, backlog hoặc clock lệch; đợi `LIVE`, không dùng hình cũ để đặt pose |
| `missing fields ['sent_at']` | Adapter cũ; nâng adapter/guard cùng protocol v2 |
