# Depth camera (Astra Pro) trong local costmap

Trạng thái 14/11/2026:
- Code và kiểm thử offline đã xong.
- Đã chạy cùng Nav2 trên robot hai lượt START → POI_01 → START, chế độ cũ T = 1 s:
  - lượt 15:43 là mốc: 165 s, 0 recovery;
  - lượt 15:04 có 6 recovery do người đi sát robot.
- Chế độ camera với RPP T = 4 s (mục 6) mới chỉ **kiểm offline**. Nghiệm thu theo mục 7.
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
  depth đánh dấu. Plugin đều là plugin Nav2 có sẵn. File params **không đổi**.
- **Chỉ khi bật camera**, `navigation.launch.py` đưa cho Nav2 một bản sao của file params
  (`RewrittenYaml`) với đúng một giá trị khác:
  `FollowPath.max_allowed_time_to_collision_up_to_carrot` 1.0 → **4.0** (mục 6).
  Camera tắt thì Nav2 dùng nguyên file.
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
| RPP khi bật camera | T = 1.0 s (kiểm va chạm 0.2 m) | T = 4.0 s (0.8 m = lookahead) | Robot phải dừng khi camera còn thấy vật (mục 6) |

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
| `robot/ros2_ws/src/robot_navigation/test/test_camera_nav2_params.py` | camera tắt: file params dùng nguyên vẹn; camera bật: đúng một khoá đổi (T 1.0 → 4.0) với V2, V3 và `nav2_params.yaml`, chuỗi `$(var …)` và `$(find-pkg-share …)` giữ nguyên; file thiếu khoá thì dùng nguyên và ghi log |
| `robot/tools/depth_camera/stop_sim.py` | vòng kín dừng trước hộp thấp, T = 1 so với T = 4 (mục 6.2) |
| `robot/tools/depth_camera/stop_check.py` | công cụ nghiệm thu: đọc bag thật, in trễ và khoảng cách dừng (mục 7) |
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

## 6. Robot phản ứng với vật thấp thế nào

### 6.1 Lỗi gốc khi T = 1 s (đã chứng minh)

- RPP kiểm va chạm trong min(v × T, carrot 0.8 m). Với T = 1 s và v = 0.2 m/s, tầm đó chỉ **0.2 m**.
- Depth chỉ thấy vật cách camera **0.6–1.1 m** (tầm gần nhất của Astra; cửa sổ costmap 3 × 3 m).
  Camera nằm gần như ở mép trước của robot.
- Vậy RPP chỉ phản ứng khi vật đã ở trong vùng mù:
  - Trong cảnh có tường phía sau, tia 2D đi qua phía trên hộp xoá luôn vết của nó (`costmap_check.py`).
  - Nếu vết còn, robot dừng cách vật khoảng 0.1 m. Sau đó BT xoá local costmap, camera không vẽ
    lại được, và robot nhích tiếp **0.22–0.25 m vào vật** (`stop_sim.py`).
- Global planner không thấy depth (ADR-0001), nên robot không đi vòng.

### 6.2 Chế độ camera: T = 4 s

Tầm kiểm va chạm lên 0.8 m (bằng lookahead). Robot dừng khi vật còn ngoài vùng mù.

Offline, với `stop_sim.py` (costmap Nav2 thật; controller phát 0 khi báo va chạm; smoother
0.5 m/s²; trễ cơ cấu chấp hành 0.15 s và 0.3 s; 8 lần BT xoá costmap):

| Hộp 12 cm | T = 1 s | **T = 4 s** |
|---|---|---|
| Có sẵn, hoặc xuất hiện khi còn cách ≥ 0.75 m | Dừng ở 0.06–0.12 m, rồi nhích 0.22–0.25 m sau các lần BT xoá: **va** | **Dừng ở 0.59–0.73 m**, vết giữ nguyên, nhích **0 cm**, robot đứng chờ |
| Xuất hiện ở 0.65 m | va | Ranh giới: giữ được với trễ 0.15 s, **mất** với trễ 0.3 s |
| Xuất hiện ở 0.5 m | va | va (vùng mù, không phát hiện được) |

- Từ lúc vật xuất hiện tới lúc RPP báo va chạm mất 0.3–0.5 s
  (camera ~17 Hz, costmap 5 Hz, controller 10 Hz).
- **Dọn vật đi thì robot đi tiếp.** Có tường phía sau thì vết tự xoá. Không có thì vết còn, cho
  tới lần BT xoá costmap kế tiếp; lúc đó không còn gì để vẽ lại.
- **Vật vẫn còn thì** BT chạy hết vòng recovery, rồi chặng báo lỗi để nhân viên xử lý.
  Robot **không đi vòng** quanh vật thấp.

**Tác dụng phụ** (đo offline):
- Replay luật RPP trên 3 bag thật:
  - 15:04: không thêm lần dừng nào; các lần dừng vì người bắt đầu sớm hơn khoảng 1 s;
  - 12/11: thêm một chu kỳ 0.1 s, ngắn hơn ngưỡng 0.3 s mà controller chịu được trước khi huỷ;
  - lượt mốc 15:43: thêm 2 phản ứng ngắn với vật có thật gần đường đi (0.2 s và 0.5 s);
    trong đó có chân người mà depth còn giữ vết.
- Xoay gần tường: T = 4 chỉ khác T = 1 khi tường bên hông cách tâm robot **0.42–0.49 m**,
  và robot cần xoay ít hơn 26–44° về phía tường.
  - Mọi POI hiện có (START, POI_01, POI_02, POI_03, poitesst) cách tường trên bản đồ tĩnh ≥ 0.89 m,
    nên không bị dừng oan khi xoay.
- Mô phỏng Nav2 đầy đủ START → POI_01: 78.8 s (T = 1: 78.9 s), không có lần báo va chạm nào.

**Chưa chứng minh, cần đo trên robot:**
- trễ dừng thật;
- tỉ lệ dừng oan trên toàn tuyến demo;
- chân người hoặc giày thấp hơn 8 cm (không thấy, vì `min_obstacle_height`).

### 6.3 Vết depth bị giữ lại (chưa sửa, theo yêu cầu)

**Nguyên nhân (đã chứng minh):**
1. **Vết ngoài góc nhìn 58°.** Depth chỉ xoá được ô nằm trên tia trong góc nhìn. Vết tạo lúc robot
   nhìn hướng khác sẽ ở lại.
   - Lúc 15:40 costmap có 448/670 ô vật cản không trùng điểm LiDAR nào, phần lớn ngoài góc nhìn.
2. **Trong góc nhìn nhưng phía sau không có gì trả về** (sàn bóng, khoảng trống): không có tia nào
   để xoá.
   - Chỗ (6.71, 0.65) trong lượt mốc bị đánh dấu ở 25/45 ảnh costmap, nhưng chỉ có LiDAR ở 4 ảnh:
     một người đi ngang.
3. **`ObstacleLayer` không có cơ chế phai theo thời gian**, và layer LiDAR không xoá vết của depth.
   Hai layer được tách riêng có chủ đích: nếu gộp, tia LiDAR sẽ xoá vết hộp thấp nằm dưới mặt quét.

**Vì sao hiện chấp nhận được:**
- Vết cũ chỉ gây hại khi nằm trên đường RPP chiếu footprint. Khi đó FollowPath báo lỗi, BT xoá
  local costmap một lần, robot dừng 1–2 s rồi đi tiếp.
- Với T = 4, robot dừng khi vật **thật** còn trong góc nhìn. Lần xoá đó vẽ lại vật thật ngay ở lần
  cập nhật sau (0 cm nhích offline), và chỉ làm mất vết cũ.
- Lúc 15:22 robot bị kẹt vì máy quá tải (load 26) làm lệnh xoá costmap hết thời gian chờ.
  V3 (`nav2-baseline-v3.md`) xử lý phần BT timeout.

**Ứng viên cho sau demo** (chưa làm, cần đối chứng riêng):
- Định kỳ gọi `ClearCostmapExceptRegion` (có sẵn trong Nav2). Lệnh này chỉ xoá **ngoài** một hình
  vuông quanh robot, nên vẫn giữ vùng mù và hai bên thân.
- Vết ở xa mà thật thì được vẽ lại khi robot nhìn lại, vì lúc đó vật cách ≥ 0.6 m.
- Không dùng `ClearEntireCostmap` định kỳ, vì nó làm quên vật đang nằm trong vùng mù.

**Không chọn:**
- `VoxelLayer`: vết sót còn nhiều hơn.
- Collision Monitor: chặn robot xoay ở START cả hai lượt chạy.
- STVL: phải cài APT.

## 7. Nghiệm thu trên robot

Mốc so sánh là lượt **15:43** (`route_154345`): 165 s, 0 recovery. Mỗi bước chỉ đổi một thứ.
**Rollback** ở mọi bước: `robot nav --no-camera`, và `NAV2_PARAMS=nav2_params_v2.yaml`.

0. **Chuẩn bị.**
   - Stage runtime từ commit có V3 và chế độ camera. Dùng profile thử
     `~/.config/sct-robot/runtime-camera-test.env` trỏ tới runtime đó, như lần 14/11.
   - Trước mỗi lượt kiểm `uptime`, load nên dưới khoảng 8, và **không** build/test trên MiniPC.
1. **V3, camera tắt.** Đặt `NAV2_PARAMS` là đường dẫn tuyệt đối tới `nav2_params_v3.yaml` trong
   runtime. Chạy `run_route.sh` hai lượt.
   - Đạt: hoàn tất, không tệ hơn mốc, không có `Timed out while waiting` (`nav2-baseline-v3.md` §5).
2. **Đứng yên, camera bật** (`robot nav --camera`, không goal):
   - Vị trí lắp: mặt trước của thùng cao cách 1 m trùng với scan trong ±3 cm; cạnh trên hộp
     0.30 m ở z = 0.30 ± 0.02.
   - Sàn trống 2 phút: không có vết depth.
   - Log có dòng `camera mode: RPP max_allowed_time_to_collision_up_to_carrot 4.0`.
   - Rút USB: Nav2 vẫn chạy.
3. **Hộp xốp** (cần đồng ý; có người cầm E-stop; hộp mềm cao khoảng 12 cm, đặt giữa đường thẳng,
   cách robot ≥ 2 m). Cho robot chạy tới một goal phía sau hộp, camera bật.
   - Đạt: robot dừng cách hộp ≥ 0.6 m và **đứng chờ**. Dọn hộp thì robot đi tiếp trong vòng vài
     giây. Lặp lại 3 lần.
   - Đo bằng `robot/tools/depth_camera/stop_check.py <bag>`. Công cụ in lúc có vết, lúc lệnh về 0,
     lúc robot đứng yên, khoảng cách còn lại và thời gian đứng chờ. Có `BELOW 0.6 m` là trượt.
   - Không đạt: trở về camera tắt cho demo.
4. **Tuyến demo, camera bật**, hai lượt.
   - So với mốc: thời gian, số recovery, số lần dừng do `stop_check.py` báo là "depth-only".
   - Đạt: hoàn tất, thêm không quá 1–2 lần dừng ngắn mỗi lượt.

Kết quả bước 3–4 quyết định demo dùng camera bật hay tắt.

## 8. Khi camera hỏng

| Lúc | Hành vi | Kiểm ở |
|---|---|---|
| Lúc khởi động: không có USB hoặc driver, hoặc runtime cũ | Launcher về LiDAR-only kèm WARNING; Nav2 dùng nguyên file params (T = 1) | test launcher, `test_camera_nav2_params.py` |
| Đang chạy: driver chết hoặc rút USB | Driver không có `respawn` hay `on_exit` nên launch vẫn chạy. `expected_update_rate: 0.0` giữ layer "current", local costmap vẫn cập nhật từ LiDAR. RPP vẫn giữ T = 4 tới hết phiên | `costmap_check.py` |
| Vết depth cũ sau khi camera chết | Giữ nguyên (ObstacleLayer không tự phai). Mất khi ra khỏi cửa sổ 3 × 3 m hoặc khi BT xoá local costmap | `costmap_check.py` |
