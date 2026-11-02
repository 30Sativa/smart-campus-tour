# Robot baseline 2026-11-02: Nav2 V2 + LiDAR −3.0695

**Mức:** baseline phát triển và vận hành **có giám sát**, chốt sau nhiều vòng tối ưu.
Các lần tối ưu sau so với baseline này.
- Nav2 params **giữ nguyên V2** ([nav2-baseline-v2.md](nav2-baseline-v2.md)), không đổi
  giá trị nào. Cái mới là góc LiDAR (giá bị xoay vật lý) và quy trình launch/route đã
  chạy thành công trên robot ngày 02/11.
- **Chưa HARDWARE VALIDATED** theo tiêu chí ABBA ở nav2-baseline-v2.md §6 (mới 1 vòng).
- **Chưa an toàn khi có người đứng gần đường đi.** Ngày 02/11 robot cán qua chân người
  (§5.1). Người giám sát không đứng chắn trước robot, không demo với khách.

## 1. Thành phần

| Thành phần | Giá trị |
|---|---|
| Nav2 params | `robot_control/config/nav2_params_v2.yaml` (V2). sha256 YAML chuẩn hoá `57a60cae…` (khoá bởi `test_nav2_baseline_v2_contract.py`); sha256 file thô đã chạy 02/11 `77d0ed948d8fe521…` |
| Planner / controller | Smac2D + RPP, lookahead 0.8, 0.20 m/s, collision detection bật, `LatchedGoalChecker` |
| Comment đầu file V2 | còn nhắc các file đã gỡ (V1, wide inflation, turn test). Giữ nguyên để file trùng từng byte với bản đã chạy 02/11 |
| Behavior tree | `robot_navigation/behavior_trees/navigate_to_pose_no_backup.xml` (không BackUp) |
| Định vị | `robot_navigation/config/localization_params.yaml` (AMCL V1). Localization V2 **chưa** dùng |
| EKF | `robot_control/config/ekf.yaml` (mặc định) |
| **Góc LiDAR** | **`lidar_yaw:=-3.0695`** (−175.87°). Mặc định của launch vẫn là −0.2225, nên **bắt buộc truyền tham số này** |
| Map | `robot/robot_maps/map2.yaml` |
| DDS | S3 (Discovery Server chỉ loopback, `ROS_LOCALHOST_ONLY=1`), xem [dds-isolation.md](dds-isolation.md) |
| Package trên MiniPC | overlay `~/.cache/armtc/smoothws`, build từ commit cũ hơn `main`. Hành vi tương đương `main`: khác biệt duy nhất là 2 file launch trên `main` có thêm tham số odometry (`wheel_base`, `wheel_radius`, `odom_linear_scale`) với mặc định giữ nguyên hành vi cũ |

## 2. Launch trên MiniPC

Mỗi terminal là **terminal mới** (từ S3, terminal cũ còn `ROS_LOCALHOST_ONLY=0` sẽ chờ mãi).

**Terminal 1: Nav2**

```bash
export ROBOT_RUNTIME_ROOT="$HOME/smart-campus-tour/robot"; source "$HOME/sct-r3-deploy/robot/scripts/source-minipc"; source "$HOME/.cache/armtc/smoothws/install/setup.bash"; unset ROS_SUPER_CLIENT
```

```bash
ros2 launch robot_navigation navigation.launch.py robot_id:=robot_01 \
  map:="$HOME/smart-campus-tour/robot/robot_maps/map2.yaml" enable_camera:=false rviz:=false \
  nav2_params_file:="$HOME/smart-campus-tour/robot/ros2_ws/src/robot_control/config/nav2_params_v2.yaml" \
  lidar_yaw:=-3.0695
```

- Không launch Nav2 với `ROS_SUPER_CLIENT` (biến này chỉ cho CLI và bag).

**Terminal 2: debug bridge** (source như Terminal 1, rồi thêm)

```bash
source ~/.cache/armtc/r3_runtime_review_20261017/install/setup.bash; source ~/.local/opt/foxglove-bridge-3.6.0/env.sh
ros2 launch robot_navigation debug_bridge.launch.py robot_id:=robot_01
```

**Laptop:** `amr-rviz --r3`.

**Terminal 3: kiểm tra trước khi chạy** (source như Terminal 1)

```bash
bash ~/smart-campus-tour/robot/tools/nav2_bench/verify_params.sh V2 -3.0695
```

- Phải ra `== ALL PASS (V2)`. FAIL thì **không** gửi goal.
- Kiểm: lookahead 0.8, `max_decel[yaw]` −1.2, 0.20 m/s, collision detection, TF
  `lidar_link` −3.0695.

**Đặt vị trí:** robot đứng ở START, quay mặt dọc hành lang; trên RViz bấm 2D Pose
Estimate. Scan vàng phải trùng tường của map (nếu ngược khoảng 180° là sai `lidar_yaw`).

**Ghi bag** (luôn ghi trước khi chạy): trên MiniPC dùng
`~/amr_logs/tools_r3s5/rec_start.sh <thư mục phiên>` (ngoài Git), hoặc lệnh
`ros2 bag record` trong [logging.md](logging.md).

**Chạy tuyến** (Terminal 3, xem [route_test/README.md](../tools/route_test/README.md)):

```bash
cd ~/smart-campus-tour/robot/tools/route_test
python3 route_test.py route.example.yaml --max-points 1 --with-end   # START -> POI_01 -> START
```

- Gửi goal lẻ thì dùng `~/smart-campus-tour/robot/tools/nav2_bench/go.sh POI_01|START|POI_03`: từ chối nếu
  không đang ghi bag hoặc Quest stream đang chạy.
- **Rút Quest** trước khi chạy (Quest làm CPU MiniPC bão hoà).

**Dừng:** route_test (Ctrl+C) → `rec_stop.sh <thư mục phiên>` → debug bridge → Nav2
(Ctrl+C), luôn bằng SIGINT, không `kill -9`. Chỉ đọc bag sau khi recorder đã đóng.
E-stop phần cứng **không** hoạt động.

## 3. Rollback

| Muốn quay lại | Cách |
|---|---|
| Góc LiDAR cũ (chỉ khi giá LiDAR được xoay về như trước 02/11) | `lidar_yaw:=-0.0833` |
| Nav2 V1 | file vẫn còn trong overlay đã cài: `nav2_params_file:=$HOME/.cache/armtc/smoothws/install/robot_control/share/robot_control/config/nav2_params_smooth.yaml`; trong Git: `git show nav2-baseline-v1:robot/ros2_ws/src/robot_control/config/nav2_params_smooth.yaml` |
| Mặc định chung (`nav2_params.yaml`, 0.24 m/s) | bỏ `nav2_params_file`. Không khuyến nghị cho robot thật (§7) |

Mọi rollback chỉ là tham số launch, không cần build.

## 4. Bằng chứng 02/11

**Góc LiDAR:**
- Triệu chứng: scan trên RViz ngược map khoảng 180°.
- Cách đo: robot đứng yên ở START; khớp `/scan_raw` với map, quét đủ 360°.
- Với góc cũ (−0.0833) chỉ 8 % tia trúng tường. Khớp tốt nhất ở hướng ngược lại (63 %).
  Thử giả thuyết scan bị soi gương (LiDAR lật úp) thì khớp kém hơn, nên LiDAR bị
  **xoay**, không lật.
- Với −3.0695: điểm khớp 0.84 tại pose user đặt. TF `base_link → lidar_link` đo được
  184.13° (= −175.87°).
- Bộ lọc thân xe (`scan_range_filter.yaml`, 0.20 m) lọc theo bán kính, không phụ thuộc
  hướng, nên không cần sửa.

**Route `TEST_MAP2_LOOP`** START → POI_01 → START (log
`~/amr_logs/runs/20261102_151955_route_TEST_MAP2_LOOP_*`, bag
`~/amr_logs/runs/20261102_1516_route_V2/bag`; Quest tắt):

| Chặng | Kết quả | Thời gian | Recovery | Sai số dừng (vị trí / hướng) |
|---|---|---|---|---|
| START → POI_01 | SUCCEEDED | 81.6 s | 0 | 0.158 m / 14.7° |
| POI_01 → START | SUCCEEDED | 85.7 s | 1 (do người chắn, §5.1) | 0.06 m / −15.4° |

**verify_params:** ngày 02/11 công cụ báo FAIL dù Nav2 đã nạp V2, vì
`ros2 param get --no-daemon` không trả lời dưới Discovery Server. Đã sửa (đọc bằng
rclpy, có chờ service). Kiểm trên stack thật: V2 + −3.0695 ra ALL PASS; chọn sai cấu
hình (V1) hoặc sai góc đều ra FAIL.

## 5. Giới hạn đã biết

### 5.1 An toàn khi có người (nghiêm trọng)

Phân tích từ bag, chặng về, ở sảnh gần map (7.2, 2.3). Khoảng cách đo từ mép thân xe
tới chân, ở độ cao mặt quét LiDAR (26.7 cm, tức ống chân):

| Giờ | Khoảng cách | Tốc độ | Diễn biến |
|---|---|---|---|
| 15:22:17.5–18.3 | 1.17 → 0.40 m | 0.20 m/s | người bước vào đường đi rồi đứng yên; robot **không giảm tốc** |
| 15:22:18.8–19.2 | 0.19 → 0.15 m | 0.20 → 0 | RPP `collision ahead`, dừng |
| 15:22:19.24 | — | — | BT xoá **toàn bộ** local costmap |
| 15:22:19.5 | 0.15 m | chạy lại | 0.3 s sau đã chạy tiếp, quẹo để vòng qua |
| 15:22:20.0–20.4 | **6.4–9.6 cm** | 0.17–0.18 m/s | góc trước-trái lướt qua, **cán bàn chân** |
| 15:22:24.5–27 | 4.5 cm | 0.18 m/s | sát thêm một lần bên trái |

Footprint đúng (0.80 × 0.563 m). Nguyên nhân:
1. LiDAR quét ở 26.7 cm nên không thấy bàn chân; camera depth tắt.
2. RPP chỉ kiểm va chạm 1.0 s phía trước (20 cm ở 0.20 m/s). Giảm tốc theo costmap chỉ xét
   ô dưới robot, nên không chậm lại khi có vật phía trước.
3. Khi FollowPath bị huỷ, BT xoá costmap rồi chạy lại ngay.
4. Không có `collision_monitor` (vùng giảm tốc và vùng dừng quanh cả thân xe).
   `nav2_collision_monitor` đã có sẵn trên MiniPC.

### 5.2 Khác

- Góc LiDAR: phần khoảng 180° là chắc chắn; vài độ cuối được suy ra với giả định robot
  đang hướng đúng theo pose user đặt. Cần đo lại bằng `lidar_mount_est.py` trên một chặng
  thẳng có bag.
- Sai số hướng ở đích khoảng 15° (tol 17°).
- AMCL còn trôi trên hành lang dài, ít đặc trưng (Localization V2 chờ đo 10 m bằng thước).
- Mẫu nhỏ: 1 vòng START↔POI_01.

## 6. Việc tối ưu tiếp (theo thứ tự)

1. **An toàn (V3):** `collision_monitor` (giảm tốc khoảng 0.4 m, dừng 0.15 m, quanh cả
   thân xe); BT `Wait` trước khi xoá costmap; RPP nhìn trước khoảng 2.5 s. Thấy bàn chân
   thì cần camera depth hoặc sonar.
2. Đo lại góc LiDAR từ bag; khi chắc thì đổi mặc định `lidar_yaw` trong launch.
3. Localization V2 (đo 10 m).
4. Sai số hướng ở đích.
5. Khi đạt tiêu chí hardware validated: cho V2 (hoặc V3) làm mặc định của
   `navigation.launch.py`.

Cách làm một phiên bản mới: nav2-baseline-v2.md §7 (file mới, test khoá mới, so bằng
`robot/tools/nav2_bench`).

## 7. Lịch sử cấu hình Nav2 và những gì đã gỡ (02/11)

| Cấu hình | Thay đổi | Kết quả | Trạng thái |
|---|---|---|---|
| `nav2_params.yaml` ("turn test") | tiến 0.24 m/s, quay 0.45 rad/s | 39–50 % lệnh bị bridge scale (trần bánh 250 mm/s); V1 chọn 0.20 m/s | **giữ file**: còn là mặc định chung cho sim, auto-explore và launch. Doc `nav2-turn-test.md` đã gỡ |
| `nav2_params_wide_global_inflation.yaml` | global inflation 1.50 / 2.0 | robot đi giữa hành lang; giá trị đã nằm trong V1 và V2 | file và test đã gỡ |
| Thử nghiệm độ mượt | `LatchedGoalChecker` + 0.20 m/s | thành V1 | doc `nav2-smooth-trial.md` và `test_nav2_smooth_contract.py` đã gỡ |
| V1 `nav2_params_smooth.yaml` | wide inflation + latched checker + 0.20 m/s | V2 tốt hơn ở mọi chặng ngày 22/10 | file và test đã gỡ; tag `nav2-baseline-v1`; doc [nav2-baseline-v1.md](nav2-baseline-v1.md) giữ làm hồ sơ |
| Thử offline 22/10 | SmoothPath / Simple Smoother, quay 0.35, tăng tốc chậm hơn, BT timeout 200 ms | không có lợi | không có file |
| **V2** `nav2_params_v2.yaml` | V1 + lookahead 0.8 + `max_decel[yaw]` −1.2 | **baseline này** | giữ |

Lấy lại file đã gỡ: `git show 5b6d9a87:<đường dẫn>` (commit cuối trên `main` còn đủ file).
