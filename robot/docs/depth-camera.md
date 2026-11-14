# Depth camera (Astra Pro) trong local costmap

Trạng thái 14/11/2026:
- Code và kiểm thử offline đã xong.
- Driver đã đo trên robot đứng yên.
- **Chưa chạy cùng Nav2 trên robot.**
- Mặc định **tắt**: `robot nav` không bật camera nếu không có `--camera` hoặc `ENABLE_CAMERA=true`.

## 1. Kiến trúc

```
RPLiDAR (mặt quét cao ~0.47 m) ─ /robot_01/scan ──────────► lidar_obstacle_layer ─┐
                                                                                 ├ MAX ─► inflation ─► local costmap ─► RPP (kiểm va chạm)
Astra Pro depth (cao ~0.27 m) ─ /robot_01/camera/depth/points ► depth_obstacle_layer ┘
   driver astra_camera, namespace /robot_01/camera, chỉ depth (không RGB/IR/UVC)
```

- Camera là cảm biến **phụ** (ADR-0001 `docs/decisions/0001-lidar-primary-astra-supplementary.md`).
  Nó chỉ vào **local costmap**. Không vào AMCL, không vào global costmap. Nav2 không phụ thuộc vào nó.
- Mỗi cảm biến có `ObstacleLayer` riêng, gộp bằng MAX. Vì vậy tia LiDAR không xoá được vết do
  depth đánh dấu. Plugin đều là plugin Nav2 có sẵn. `nav2_params_v2.yaml` **không đổi**.
- TF:
  - `base_link → camera_link` là static, do `navigation.launch.py` publish.
  - `camera_link → camera_depth_frame → camera_depth_optical_frame` do driver publish.
    Gốc TF của driver luôn là `camera_link`.
- Lọc theo kích thước robot (tham số Nav2 có sẵn):
  - footprint CAD 0.80 × 0.56 m;
  - bỏ điểm thấp hơn `min_obstacle_height` 0.08 m (sàn và nhiễu);
  - bỏ điểm cao hơn `max_obstacle_height` 1.20 m;
  - chỉ đánh dấu ở khoảng 0.60–3.00 m tính từ camera;
  - `footprint_clearing_enabled` (mặc định bật) xoá vết nằm dưới thân robot;
  - inflation 0.60 m.

### Bật / tắt

| Cách | Kết quả |
|---|---|
| `robot nav` (mặc định) | LiDAR-only như baseline, `enable_camera:=false` |
| `robot nav --camera` | Thêm camera cho lần chạy này |
| `ENABLE_CAMERA=true` trong profile | Bật mặc định. `robot nav --no-camera` tắt cho một lần |

Khi được yêu cầu bật camera nhưng không bật được, launcher **không từ chối nav**. Nó in
`WARNING depth camera off for this session, LiDAR-only: …` rồi chạy LiDAR-only. Các trường hợp:
- không có USB `2bc5:0403`;
- thiếu driver `astra_camera`;
- runtime cũ, chưa có các thiết lập 14/11.

Lock của phiên ghi `camera: true|false`, xem bằng `robot status`.

## 2. Thay đổi 14/11

| Mục | Trước | Sau | Lý do |
|---|---|---|---|
| Vị trí lắp `base_link → camera_link` | placeholder x 0.25, z 0.35, pitch 0.17 rad | x 0.394, y 0, z 0.066, rpy 0 (điểm mặt camera trong CAD, `cad-sensor-mounts.md`; người dùng xác nhận lắp thẳng, nhìn ngang) | Placeholder đặt camera cao 0.56 m thay vì 0.27 m và chúc xuống 10°. Hai sai số này đè vật thấp xuống dưới `min_obstacle_height` |
| Thiết bị RGB UVC | luôn mở | `use_uvc_camera` theo `enable_color` (tắt) | Khi tắt màu, driver vẫn giải mã MJPEG 640×480@30, tốn gấp đôi CPU |
| Chế độ depth | 320×240 @ "10" (driver tự về 30) | 160×120 @ 30 | Astra không có chế độ 10 Hz. 160×120 cho số điểm ít hơn 4 lần với cùng góc nhìn |
| Launcher | luôn `enable_camera:=false` | `--camera` / `--no-camera` / `ENABLE_CAMERA` | Để so sánh trước và sau |

## 3. Số đo trên robot đứng yên

Đo ngày 14/11: driver chạy riêng ở domain 89 (`ROS_LOCALHOST_ONLY=1`), không có Nav2, robot
không chạy.

| Cấu hình driver | CPU (% một nhân J5005) | Điểm/khung | Tần số đo được | Trễ stamp → nhận |
|---|---|---|---|---|
| 320×240 + UVC mở (cũ) | ~23 % | 76 800 | ~19 Hz | ~4–5 ms |
| 320×240, UVC tắt | ~12 % | 76 800 | ~19 Hz | ~4–5 ms |
| **160×120, UVC tắt (mới)** | **~6 %** | **19 200** | ~19 Hz | ~4 ms |

Sàn bóng hầu như không trả về depth ở góc nhìn sát mặt sàn. Vì vậy:
- không thể hiệu chỉnh vị trí lắp bằng cách khớp mặt phẳng sàn (`depth_check` báo FAIL ở bước sàn);
- vị trí lắp phải kiểm bằng phép thử hộp (mục 7, bước 1).

**Chưa đo:**
- RAM của driver;
- CPU của local costmap (nằm trong `controller_server`) khi nhận 19.2k điểm × 19 Hz.

Lúc làm việc này robot đang chạy `nav --fleet`, nên không đo tải nặng. Hai số này đo ở mục 7, bước 3.

## 4. Camera thấy được gì

- Camera cao 0.27 m, nhìn ngang. FOV khoảng 58° × 45° (±22.75° theo phương đứng). Tầm gần nhất
  khoảng 0.6 m.
- LiDAR quét ở độ cao khoảng **0.47 m** (`base_z` 0.2068 + `lidar_z` 0.2665). Vật **thấp hơn
  0.47 m** chỉ camera thấy được: hộp, ghế đẩu, chân người, túi.
- Local costmap là cửa sổ 3 × 3 m quanh tâm robot. Phía trước, depth chỉ đánh dấu được tới 1.5 m
  tính từ tâm, tức **0.6–1.1 m trước camera**. Camera nằm gần như ở mép trước của thân robot.
- Ở khoảng cách d, camera thấy tới độ cao 0.27 + 0.42·d. Ở 1.1 m là 0.73 m. Vì vậy mặt bàn khoảng
  0.75 m không bao giờ lọt vào cửa sổ phía trước. Trong cửa sổ, depth có ích chủ yếu cho vật
  **0.08–0.47 m**.
- Vật thấp hơn 8 cm không được đánh dấu: giày nằm sát sàn, nắp máng cáp.

## 5. Kiểm thử offline

| Kiểm thử | Kết quả |
|---|---|
| `robot/scripts/tests/test_robot_launcher.py` | bật/tắt theo lần chạy và profile; `--camera` và `--no-camera` loại trừ nhau; chỉ `nav` có camera; 3 trường hợp hỏng đều về LiDAR-only kèm WARNING |
| `robot/ros2_ws/src/robot_navigation/test/test_camera_launch_scope.py` | giá trị mặc định: mount CAD `base_link → camera_link`, depth 160×120@30, `use_uvc_camera` false; camera tắt thì không có node camera và TF mount |
| `robot/tools/depth_camera/costmap_check.py` | xem bảng dưới |

`costmap_check.py` chạy `nav2_costmap_2d` thật của Humble:
- tham số lấy từ mục `local_costmap` của `nav2_params_v2.yaml`;
- TF, scan LiDAR rỗng và point cloud đều giả lập, cloud ở frame optical như driver;
- chạy ở domain 89 với `nice 19`, không dính tới robot.

Nó chạy được cả `--depth-layer voxel`: thay layer bằng `VoxelLayer` trong bản tạm, để so sánh.
Kết quả 14/11, cả hai chế độ đều `ok: true`:

| Kịch bản | ObstacleLayer (đang dùng) | VoxelLayer (so sánh) |
|---|---|---|
| Camera tắt: costmap vẫn cập nhật từ LiDAR, không có vết | ✔ | ✔ |
| Hộp 12 cm cách camera 0.83 m: đánh dấu | ✔ | ✔ |
| Sàn, vật 6 cm, vật trên 1.2 m, vật cách camera 0.43 m: không đánh dấu | ✔ | ✔ |
| Điểm NaN: bỏ qua | ✔ | ✔ |
| Camera ngừng gửi giữa chừng: costmap vẫn cập nhật, vết cũ giữ nguyên (không tự phai) | ✔ | ✔ |
| Người rời đi, phía sau không có gì trả về (chỉ sàn bóng): **vết còn lại** | còn | còn |
| Người rời đi, có tường phía sau: vết được xoá | xoá | **còn** (voxel thấp không có tia nào đi qua) |
| Hộp vào vùng mù (0.33 m), phía sau trống: giữ vết | giữ | giữ |
| Clear local costmap (recovery của BT): vết mất, vùng mù không vẽ lại | mất | mất |
| Hộp vào vùng mù, **có tường phía sau** (trường hợp thường gặp) | **mất** (tia 2D đi qua phía trên hộp xoá ô của nó) | giữ |

## 6. Ý nghĩa với navigation (đọc trước khi bật cho demo)

- **Với `ObstacleLayer` hiện tại, robot sẽ không dừng trước một vật thấp nằm thẳng phía trước.**
  - Vật được đánh dấu khi còn cách camera khoảng 1.1 m.
  - Vết mất khi vật cách khoảng 0.55 m, nếu phía sau có gì đó.
  - RPP chỉ kiểm va chạm khoảng 0.2 m trước thân ở 0.20 m/s
    (`max_allowed_time_to_collision_up_to_carrot` 1.0 s).
  - Giảm tốc theo cost tính tại tâm robot, nên cũng không kịp tác động.
  - Global planner không thấy depth, nên cũng không tránh vòng.

  Kết luận: camera *thấy* vật (có thể xem trên RViz) nhưng gần như không đổi chuyển động.
  `phase3-nav2.md` (mục `clearing: true`) đã cảnh báo trước việc vết bị xoá trong vùng mù; phép
  thử offline cho thấy việc đó xảy ra trước khi RPP kịp phản ứng.
- **`VoxelLayer`** giữ được vết trong vùng mù, nên RPP dừng cách vật khoảng 0.2 m. Sau đó:
  1. `FollowPath` báo lỗi.
  2. BT gọi `clear_entirely_local_costmap`.
  3. Vết mất và robot đi tiếp vào vật.

  Ngoài ra voxel thấp còn sót sau khi người rời đi, gây dừng oan. Kết quả là chỉ thêm một lần
  dừng ngắn, không ngăn được va chạm.
- **Collision Monitor** (`nav2_collision_monitor`, có sẵn trong `/opt/ros/humble`):
  - Đặt vùng dừng 0.6–0.9 m trước camera thì giữ được lệnh dừng, vì vật vẫn còn trong tầm nhìn.
  - Đổi lại, robot sẽ dừng oan khi rẽ ở góc hành lang có tường trong khoảng 0.9 m phía trước.
- Gốc của vấn đề là phần cứng: vùng mù 0.6 m nằm ngay mép trước robot, và không có cảm biến tầm
  gần. Sonar đang tắt. Không có cấu hình Nav2 có sẵn nào vừa dừng chắc chắn, vừa tự đi tiếp khi
  vật được dọn đi.

**Khuyến nghị cho demo:**
- Giữ camera **tắt** (baseline đã kiểm), tốc độ 0.20 m/s, có người giám sát và E-stop.
- `--camera` dùng cho phép so sánh ở mục 7, hoặc để trình diễn cloud và costmap trên RViz.
- Chỉ chọn VoxelLayer + BT, hoặc Collision Monitor, sau khi bước 5 cho thấy cần, và mỗi phương án
  được thử riêng.

## 7. Kế hoạch thử trên robot

Bước 0–4 robot **đứng yên**. Bước 5 cần đồng ý riêng.

0. **Runtime.** Sau khi merge: `robot/scripts/stage-runtime <commit>`, sửa `SCT_OVERLAY`
   (`runtime-deploy.md`). Runtime cũ vẫn chạy được: `robot nav --camera` sẽ in WARNING và chạy
   LiDAR-only.
1. **Kiểm vị trí lắp** bằng `robot nav --camera` (không `--fleet`, không gửi goal) và RViz với
   cloud `/robot_01/camera/depth/points` và scan:
   - Đặt một vật cao, phẳng (thùng hoặc tủ, cao hơn 0.5 m) cách mũi robot 1.0 m, trên trục giữa.
     Mặt trước của vật trong cloud và trong scan phải trùng nhau trong ±3 cm, cả x lẫn y. Lệch y
     theo khoảng cách nghĩa là sai yaw.
   - Đặt hộp cao 0.30 m ở cùng chỗ. Cạnh trên của hộp phải ở z = 0.30 ± 0.02 m trong frame
     `base_footprint`. Lệch nhiều nghĩa là sai pitch hoặc z.
   - Nếu lệch: sửa default `camera_*` trong `navigation.launch.py` (hoặc truyền
     `camera_pitch:=…` khi chạy tay), rồi làm lại.
2. **Costmap đứng yên** (`/robot_01/local_costmap/costmap`):
   - Sàn trống 2 phút: không có vết depth nào.
   - Hộp 12 cm cách mũi 0.8 m: có vết.
   - Bỏ hộp: ghi lại vết còn hay mất (mục 5).
3. **Tải.** So sánh `robot nav` và `robot nav --camera`, mỗi cái để yên 5 phút:
   - CPU tổng, CPU của `controller_server` và của driver (`pidstat -p … 5`), RSS;
   - log có `Map update loop missed its desired rate` không;
   - tần số `amcl_pose` có giữ như cũ không.
4. **Rút camera.** Rút USB khi `robot nav --camera` đang chạy:
   - Nav2 vẫn active, local costmap vẫn cập nhật;
   - ghi lại driver có tự nối lại khi cắm vào không. Nếu không: Ctrl+C rồi `robot nav --camera` lại.
5. **Chạy (cần đồng ý, có người giữ E-stop).** Phép thử D trong
   `robot/ros2_ws/src/robot_navigation/README.md` (mục D.2 "dừng trước khi va" được dự đoán là trượt):
   - Hộp xốp 12 cm nằm trên đường đi, 0.10 rồi 0.20 m/s, camera bật rồi tắt.
   - Theo mục 6, dự đoán robot **không dừng** ở cả hai trường hợp: dùng vật mềm và sẵn sàng bấm
     stop.
   - Ghi bag các topic `scan`, `local_costmap/costmap`, `cmd_vel_nav`, `camera/depth/points`
     (khoảng 4.4 MB/s).
   - Sau đó chạy cả tuyến demo một lần với `--camera`, đếm số lần dừng oan và số lần recovery so
     với baseline.

Kết quả bước 5 quyết định:
- giữ camera tắt;
- bật để trình diễn;
- hoặc mở một việc riêng cho VoxelLayer + BT, hoặc Collision Monitor.

## 8. Khi camera hỏng

| Lúc | Hành vi | Kiểm ở |
|---|---|---|
| Lúc khởi động: không có USB hoặc driver, hoặc runtime cũ | Launcher về LiDAR-only kèm WARNING | test launcher |
| Đang chạy: driver chết hoặc rút USB | Driver không có `respawn` hay `on_exit` nên launch vẫn chạy. `expected_update_rate: 0.0` giữ layer "current", local costmap vẫn cập nhật từ LiDAR | `costmap_check.py` |
| Vết depth cũ sau khi camera chết | Giữ nguyên (ObstacleLayer không tự phai). Mất khi ra khỏi cửa sổ 3 × 3 m hoặc khi BT clear local costmap | `costmap_check.py` |
