# Cô lập DDS của robot và debug từ xa bằng RViz qua SSH (R3)

**Trạng thái (17/10):** code và kiểm thử offline đã xong trên branch. **Chưa áp
dụng lên robot:** discovery server, `robot/.env`, SSH và package trên miniPC
vẫn như cũ. Các bước chuyển đổi nằm ở mục 8, user chạy từng bước.

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
- **Laptop ở mạng Wi-Fi khác** (10.87.x, khác subnet 10.86.4.0/22 của robot).
  - Robot và laptop cách nhau 2 hop, RTT 3–312 ms.
  - Fast DDS gửi mỗi bản tin tới **mọi** IP mà reader khai báo, kể cả IP
    Tailscale của laptop nếu Tailscale còn chạy.
- **Bảo mật.** Discovery server nghe `0.0.0.0:11811` trên mạng trường. DDS
  không có xác thực, nên bất kỳ máy nào trong trường cũng publish được
  `cmd_vel` vào robot.

Chi tiết và số liệu: `~/amr_logs/dds_isolation/PROPOSAL_v2.md` trên miniPC.

## 2. Kiến trúc

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
| `robot/scripts/source-minipc` | robot | Thêm chặn: `LOCALHOST_ONLY=1` thì `ROS_DISCOVERY_SERVER` phải là `127.0.0.1`; server đang ở S3 thì `LOCALHOST_ONLY` phải là 1 |
| `robot/tools/rviz_over_ssh/rviz-over-ssh` | laptop | Mở tunnel, chạy `fox2ros` và RViz; tự nối lại; dọn tiến trình khi thoát |
| `robot/tools/rviz_over_ssh/fox2ros.py`, `fox2ros_topics.yaml` | laptop | WebSocket → DDS cục bộ của laptop (chuyển nguyên CDR); gửi initial pose |
| test: `test_debug_bridge_contract.py`, `test_initialpose_guard.py`, `tools/rviz_over_ssh/test_fox2ros.py`, `scripts/tests/` | — | Hợp đồng bảo mật, guard, giao thức, reconnect, script (`verify` Tier 1.7) |

`remote_rviz.launch.py` (`scan_rviz`, `tf_rviz_relay`) được giữ lại để
rollback. Sau S2 nó không còn chạy được.

## 4. Dùng hằng ngày

Trên robot, ngoài navigation như cũ:

```bash
ros2 launch robot_navigation debug_bridge.launch.py robot_id:=robot_01
```

Trên laptop: source ROS Humble và workspace có `robot_description` (để RViz
hiện mesh), rồi chạy:

```bash
robot/tools/rviz_over_ssh/rviz-over-ssh sativa@<ip-robot>
```

- RViz mở `navigation.rviz` trong namespace `/robot_01`, cùng tên topic như
  trên robot.
- Kết quả "2D Pose Estimate" in ở terminal với tiền tố `[robot]`.
- Không tới được robot: Nav2 Goal, panel Nav2 (action/service), param,
  `cmd_vel`.
- Debug bằng CLI (`ros2 topic`, `ros2 bag`): SSH vào robot rồi chạy ở đó.

## 5. Topic, namespace, QoS

- Topic của robot nằm trong `/robot_01/...`; TF là global (`/tf`,
  `/tf_static`). Tên và kiểu topic đã đối chiếu với bag B2c.
- Publisher phía laptop luôn `RELIABLE`, nên khớp mọi yêu cầu của RViz.
  - Topic latched (`map`, `tf_static`, `robot_description`, costmap,
    `amcl_pose`) dùng `TRANSIENT_LOCAL`: RViz mở sau, hoặc mở sau khi nối lại,
    vẫn nhận ngay.
  - Stream (`scan`, `tf`, footprint, plan, particle cloud) dùng `VOLATILE`.
- Đã kiểm bằng một probe subscribe **đúng QoS ghi trong `navigation.rviz`**:
  0 lỗi incompatible QoS. Probe vào muộn nhận map, costmap và TF trong
  0.1–5 s.
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

Một số chi tiết khác:
- **Odom và `cmd_vel` lấy theo yêu cầu:** guard chỉ subscribe hai topic này
  khi có request. Topic trạng thái action được subscribe thường trực, vì là
  latched và chỉ phát khi goal đổi trạng thái.
  - Đo được: subscription thường trực 25 Hz tốn khoảng 7 % một core J5005.
  - Lấy theo yêu cầu: lúc rảnh khoảng 0.4 %; lấy được mẫu trong khoảng 26 ms
    (tối đa 0.9 s).
- **Stamp:** thay bằng đồng hồ robot, vì đồng hồ laptop có thể lệch.
- **Khi link đứt:** không gửi và không xếp hàng (`NOT sent`). Một pose cũ
  không bao giờ tới robot muộn.
- **Lệch đồng hồ:** `fox2ros` cảnh báo khi đồng hồ laptop lệch robot quá
  0.5 s. Ước lượng lấy giá trị nhỏ nhất trên stamp của `/scan`, nên độ trễ
  link không gây báo động giả.
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

**Cài code lên robot (không đụng Nav2 Baseline V1).**
- Robot chạy từ install cũ cộng overlay V1 (`~/.cache/armtc/smoothws`).
- Build overlay `robot_navigation` của R3 vào một thư mục **mới**, chồng lên
  `smoothws`, và **chỉ source nó trong terminal debug**. Terminal Nav2 vẫn dùng
  đúng môi trường V1.
- Các script (`check-dds-isolation`, `discovery-server-stage`,
  `foxglove-bridge-portable`) chạy thẳng từ checkout của branch (hoặc main sau
  khi merge), không cần build.

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
   source robot/scripts/source-minipc && source ~/.cache/armtc/r3_runtime/install/setup.bash
   source ~/.local/opt/foxglove-bridge-3.6.0/env.sh
   ros2 launch robot_navigation debug_bridge.launch.py robot_id:=robot_01
   ```

   - Terminal chạy Nav2 không source `env.sh`, nên không bị ảnh hưởng.
3. Trên laptop: kiểm tra `ssh -o BatchMode=yes sativa@<ip-robot> true` chạy
   được mà không hỏi mật khẩu, rồi chạy `rviz-over-ssh sativa@<ip-robot>`.
4. Đạt khi:
   - RViz hiện map, scan, TF, costmap, RobotModel;
   - "2D Pose Estimate" lúc robot đứng yên và không có goal → `ACCEPTED`;
   - bấm lúc đang có goal → `REJECTED`;
   - trên robot, `ss -tlnp | grep -E '8765|8766'` chỉ có `127.0.0.1`;
   - `ps -o ni,comm -C foxglove_bridge` cho `10`.
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
- từ chối khi stack còn chạy (trừ CLI daemon), khi có drop-in lạ, hoặc khi
  `.env` không khớp với bậc đích;
- sau khi restart, kiểm tra service và socket; hỏng thì **tự quay về bậc
  trước**.

Unit gốc không bị sửa; script chỉ dùng một file
`/etc/systemd/system/fastdds-discovery.service.d/10-dds-isolation.conf`.
`discovery-server-stage status` chạy không cần root.

Trước mỗi bước: dừng stack (công cụ đo → bag → Nav2, SIGINT). Sau mỗi bước:
mở terminal mới, `source robot/scripts/source-minipc`, chạy stack,
`ros2 daemon stop`, rồi `robot/scripts/check-dds-isolation`.

| Bước | Lệnh | Đạt khi | Rollback |
|---|---|---|---|
| S1 | `sudo robot/scripts/discovery-server-stage s1` | stack lên đủ; CLI trên robot thấy đủ node (laptop vẫn discovery được: chưa đóng) | `sudo …stage original --env ~/smart-campus-tour/robot/.env` |
| S2 | sửa `~/smart-campus-tour/robot/.env`: `ROS_LOCALHOST_ONLY=1` | `check-dds-isolation` chỉ còn **một** FAIL (socket server); node đều ở `127.0.0.1`; `ros2 bag record` chạy | `.env` về `0` (server vẫn ở S1, chạy với cả hai) |
| S3 | `sudo robot/scripts/discovery-server-stage s3 --env ~/smart-campus-tour/robot/.env` | `check-dds-isolation` → `ISOLATED` (chỉ còn WARN sshd); laptop nối thẳng DDS không thấy gì | `sudo …stage s1 --env …` |

**Thang rollback** luôn đi qua S1, vì S1 chạy với cả hai loại node:
- S3 → S1 → (`.env` về `0`) → original.
- Script từ chối `original` khi `.env` còn `LOCALHOST_ONLY=1` (E1b).
- `source-minipc` từ chối `LOCALHOST_ONLY=0` khi server còn ở S3.

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

**Đã kiểm:**
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

**Chưa kiểm (S0/S5 sẽ kiểm):**
- RViz2 thật: miniPC không có rviz2.
- SSH thật: dùng TCP forward thay thế.
- Roam Wi-Fi thật: dùng `tc` giả lập.
- systemd thật: drop-in, `daemon-reload` và restart với sudo; logic đã kiểm
  bằng `systemctl` giả, dòng lệnh đã kiểm bằng `fastdds` thật.
- `robot_description`, sonar, `go_to_stop` và `cmd_vel` của mode_manager:
  không có trong mô phỏng (chỉ có unit test).
- CPU và băng thông trên robot thật. Đo trong mô phỏng: bridge khoảng 1–4 %
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
| `laptop clock is … ahead/behind` | Bật NTP trên laptop |
