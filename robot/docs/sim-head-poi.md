# Thử góc đầu camera theo POI trên Gazebo (web → backend → robot giả lập)

Mục tiêu: Staff cài góc đầu camera cho từng POI trên web, robot trong Gazebo chạy tới POI bằng Nav2, và đầu
quay giả lập (`head_sim`) quay đúng góc đó. Đây là cùng một luồng như trên robot thật (ADR-0045 phụ lục
14/11/2026), chỉ thay STM32 và motor bằng `head_sim`.

**Chỉ dùng trong mô phỏng.** `head_sim` mở cùng tên `head/*` như `stm32_bridge`: không chạy nó trên mini PC
của robot và không chạy cùng `stm32_bridge`.

```
web "Camera & tư liệu" ─► backend AWS ─GET /api/fleet/head/v1/pois─► fleet_bridge (head_poi_auto)
                                                                       │ nghe navigate_to_pose/_action/status
Gazebo + Nav2 (sim_navigation) ─ robot tới POI (SUCCEEDED) ─────────────┘
                                                                       ▼
                                                     head/set, head/sweep ─► head_sim ─► RViz /head/markers
```

## Cần có

- Ubuntu 22.04, ROS 2 Humble, Gazebo Classic 11 (máy laptop Linux; Windows thì dùng WSL2 có WSLg).
- Robot giả lập dùng map `warehouse_12x12` của `sim_navigation`, nên POI phải đặt trên **map đó**, không
  phải map tầng 6 của robot thật.
- Tài khoản web Technical Staff và Staff, quyền sửa `/etc/campustour/api.env` trên EC2.

## A. Chuẩn bị trên web (làm một lần)

1. **Gói map giả lập.** Từ gốc repo:
   ```bash
   (cd robot/ros2_ws/src/robot_navigation/maps && python3 -m zipfile -c /tmp/sim_map.zip warehouse_12x12.yaml warehouse_12x12.pgm)
   ```
2. **Technical, Bản đồ:** tải `/tmp/sim_map.zip` lên. Đặt tên dễ nhận, ví dụ `SIM warehouse`. Ghi lại
   **map key** của phiên bản vừa tạo.
3. **Technical, Robot:** đăng ký robot mới, ví dụ mã `sim_01`, gán map `SIM warehouse`, rồi **cấp khóa**. Lưu
   khóa vào file trên máy chạy Gazebo:
   ```bash
   nano ~/sim_01.cred && chmod 600 ~/sim_01.cred
   ```
   Không dùng khóa của `robot_01` thật: hai nơi cùng hỏi lệnh đầu quay sẽ giành lệnh của nhau.
4. **Staff, Chuẩn bị Tour → POI:** tạo 2 hoặc 3 POI trên map `SIM warehouse`, mỗi POI một hoạt động khác
   nhau ở phần **Camera & tư liệu**. Ví dụ:
   - `SIM A`: Góc tùy chỉnh, **Trái 90°**, TILT 0°
   - `SIM B`: Góc tùy chỉnh, **Phải 45°, Ngửa 10°**
   - `SIM C`: **Quét trái, phải** 135°

   Rồi gửi kiểm định.
5. **Technical, kiểm định POI:** ghi **Đạt** cho từng POI. Robot chỉ nhận POI đã đạt.
6. **Máy chủ AWS:** `FleetHead__Enabled=true` trong `/etc/campustour/api.env`, tạo lại container `api`.
   Nếu đặt `FleetHead__DefaultMode=MANUAL` thì robot không tự quay khi không có Tour: để `AUTO` khi thử.

## B. Chạy giả lập (4 terminal)

Build một lần, rồi mỗi terminal mới đều `source`:

```bash
cd robot/ros2_ws && colcon build --symlink-install --packages-up-to robot_navigation stm32_bridge fleet_bridge && cd ../..
source robot/ros2_ws/install/setup.bash
```

**Terminal 1: Gazebo + Nav2 + RViz.** Đợi Nav2 active.

```bash
ros2 launch robot_navigation sim_navigation.launch.py rviz:=true
```

**Terminal 2: đầu quay giả lập.** Tự HOME khi bật (khoảng 15 s), giống robot thật.

```bash
ros2 launch stm32_bridge head_sim.launch.py
```

**Terminal 3: fleet_bridge, chỉ bật phần đầu quay.** Thay `<MAP_KEY>` bằng map key ở bước A2.

```bash
FLEET_ROBOT_CREDENTIAL_FILE=$HOME/sim_01.cred \
ros2 run fleet_bridge fleet_bridge --ros-args \
  --params-file robot/ros2_ws/src/fleet_bridge/config/fleet_bridge.yaml \
  -p backend_url:=https://api.fptcampustour.cloud/api/fleet/v1/sync \
  -p robot_code:=sim_01 -p map_key:=<MAP_KEY> \
  -p head_enabled:=true -p head_poi_auto:=true -p commands_enabled:=false
```

Giữ `use_sim_time` của `fleet_bridge` là false (nó từ chối khởi động nếu true). Cảnh báo
`Fleet pose is unavailable or stale` là bình thường trong Gazebo vì TF mang giờ mô phỏng; phần đầu quay
không cần pose "tươi" theo giờ thật.

**Terminal 4: xem trạng thái đầu.**

```bash
ros2 topic echo /head/state
```

Trong RViz: **Add → By topic → `/head/markers` → MarkerArray**. Trên robot có quả cầu (đầu), mũi tên (hướng
camera nhìn), hai cạnh vùng nhìn và dòng chữ `PAN …, TILT …, IDLE`.

## C. Thử

| Bước | Mong đợi |
|---|---|
| Khởi động xong | Terminal 3: `POI head: 3 POI from MAP, automatic motion on.` Terminal 2: `PAN 0, TILT 0, IDLE` |
| RViz: **Nav2 Goal** đặt đúng vị trí `SIM A` | Lúc xe bắt đầu chạy: đầu về phía trước. Khi tới (trong 0,6 m): terminal 3 `POI head: at SIM A: ANGLE:90,0.`, mũi tên trong RViz chỉ sang trái xe |
| Nav2 Goal tới `SIM B` | Đầu về trước khi xe chạy, tới nơi thì quay phải 45°, ngửa 10° |
| Nav2 Goal tới `SIM C` | Tới nơi đầu quét trái 135°, sang phải, rồi về giữa (khoảng 18 s) |
| Nav2 Goal tới một chỗ không phải POI | Đầu ở phía trước, không quay |
| Sửa góc `SIM A` trên web, kiểm định lại **Đạt**, đợi 5 s, đi lại tới `SIM A` | Đầu quay theo góc mới |
| Trên web, xem bảng đầu camera (cần Tour đang chạy với `sim_01`) | Góc web hiện khớp `/head/state` |

Góc trong RViz phải trùng với hình **Mô phỏng** ở phần Camera & tư liệu của POI đó.

## Khi không chạy

| Log | Nguyên nhân |
|---|---|
| `automatic motion off` | `FleetHead:Enabled` false trên AWS, hoặc `DefaultMode` là MANUAL |
| `0 POI from NONE` | Robot `sim_01` chưa gán map, hoặc map key/mã robot sai |
| `0 POI from MAP` | Chưa có POI nào **Đạt** trên map giả lập |
| `POI list refused: …` hoặc HTTP 401 | Sai khóa, sai `robot_code`, hoặc khóa đã thu hồi |
| `head/set unavailable` | Chưa chạy `head_sim` (terminal 2) |
| `goal reached but the robot pose is unknown` | Chưa có TF `map → base_footprint` (AMCL chưa khởi tạo: đặt 2D Pose Estimate) |
| Tới nơi mà đầu không quay | Điểm đến cách POI hơn 0,6 m: đặt goal sát POI hơn, hoặc tăng `-p head_poi_radius_m:=1.0` |

## Dọn dẹp

Thử xong, Technical **thu hồi khóa** của `sim_01`. Map và POI `SIM …` vẫn nằm trên backend thật: đặt tên có
`SIM` để không ai chọn nhầm khi tạo Route.

## Mã nguồn

- `robot/ros2_ws/src/stm32_bridge/stm32_bridge/head_sim.py`: node ROS, cùng giao diện `head/*` như
  `stm32_bridge`, vẽ `head/markers`.
- `robot/ros2_ws/src/stm32_bridge/stm32_bridge/head_sim_model.py`: mô hình chuyển động (giới hạn, vật chặn,
  tốc độ, bước đủ như firmware), test ở `test/test_head_sim_model.py`.
- `robot/ros2_ws/src/fleet_bridge/fleet_bridge/poi_head.py`: robot tự quay đầu theo POI (dùng y nguyên trên
  robot thật).
