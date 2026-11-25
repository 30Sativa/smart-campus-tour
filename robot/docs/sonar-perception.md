# Sonar SR04T: nguyên nhân gốc lỗi cũ và guard vận tốc gần thân xe

Trạng thái 23/11/2026, nhánh `feature/claude/sonar-perception`:
- Code, test đơn vị, test launch và mô phỏng Nav2 thật (offline) **xong**.
- **Chưa chạy trên robot.** Mặc định **tắt** (`sonar_mode:=off` = baseline V2/V3 y nguyên).
- Quyết định kiến trúc: ADR-0069 (`docs/decisions/0069-sonar-near-field-speed-guard.md`), trạng
  thái *Proposed*. Nghiệm thu phần cứng theo mục 8; trước đó chỉ được chạy `shadow`.

## 0. Tóm tắt

| Câu hỏi | Trả lời ngắn |
|---|---|
| Vì sao sonar từng làm dừng / hỏng điều hướng? | Không phải vì "phát hiện vật cản". Ba lỗi cơ chế: (1) bridge gửi `NaN` cho mọi trường hợp không có echo hợp lệ, và `RangeSensorLayer` Humble coi `NaN` là phép đo trung tính nên **vết không bao giờ bị xoá**; (2) layer có **một** timeout chung, khi hết hạn thì local costmap "không current" và `controller_server` **kẹt trong vòng chờ không xử lý cả cancel** cho tới khi có ai xoá costmap; (3) mọi vết sonar chỉ tới robot qua kiểm va chạm của RPP, tức **FollowPath FAILED → recovery xoá toàn bộ local costmap → thử lại ×6 → ABORTED → Tour NEEDS_ASSISTANCE**. Mục 2. |
| Kiến trúc mới? | Sonar **không vào costmap nào**. Ở `sonar_mode:=enforce`, `collision_monitor` có sẵn của Nav2 Humble đứng giữa controller và velocity_smoother, chỉ **giảm tốc theo thời gian-tới-va-chạm** của footprint (+5 cm) với điểm sonar; thêm `sonar_memory` giữ vật đã lọt vùng chết 0.2 m. Không huỷ, không làm hỏng goal. Mục 4. |
| Có an toàn hơn baseline? | Ở góc chéo gần thân xe khi cua: có (mô phỏng: baseline **va**, enforce **dừng cách 8–9 cm rồi tự đi tiếp** khi vật được dọn). Thẳng trước mũi, hai bên hông, phía sau: **không**, phần cứng không nhìn thấy. Mục 3, 6, 7. |
| Cần làm gì trên robot? | Mục 8: đo kênh/góc từng sonar, đo phản xạ sàn và hành vi vùng chết, chạy `shadow`, rồi mới `enforce`. |

## 1. Phần cứng và vùng nhìn thấy

Số liệu từ code (không phải đo):

| | Giá trị | Nguồn |
|---|---|---|
| Vị trí | 4 góc thân, (±0.388, ±0.268) m trong `base_link` | `sensors.xacro`, `cad-sensor-mounts.md` |
| Chiều cao trục | 0.2068 + 0.0095 = **0.216 m** trên sàn, chúc xuống 4° | như trên |
| Hướng | +45°, −45°, +135°, −135° (**tạm**, chưa đo; ánh xạ kênh SONAR1–4 → góc cũng chưa đo) | như trên |
| Vùng chết | < **0.200 m** → firmware báo `valid=0`, **giống hệt** "không có echo" | `sr04t.c:10`, `:228` |
| Hết giờ echo | 45 ms (~7.7 m) → `valid=0, mm=0` | `sr04t.c:9`, `:142` |
| Chu kỳ đo | Đo lần lượt từng cái, nghỉ 60 ms → mỗi sonar **0.29–0.42 s** một lần | `sr04t.c:8` |
| Gửi lên host | Cả 4 giá trị cũ trong **mọi** khung FB (~40 Hz), không có số thứ tự phép đo | `usb_protocol.c`, `PROTOCOL_FB.md` |
| Bridge | Mỗi khung FB → 4 `Range`, stamp = lúc nhận; `range` = NaN nếu `valid=0` **hoặc** ngoài [0.20, 2.00] m; FOV khai báo 0.52 rad | `stm32_bridge_node.py:856`, `:1174–1197`, `:175` |
| LiDAR | mặt quét cao 0.2068 + 0.2665 = **0.473 m** | `sensors.xacro` |
| Depth | camera cao 0.273 m, ngang, ~58°; đánh dấu 0.6–3.0 m, vật 0.08–1.20 m | `nav2_params_v3.yaml`, `depth-camera.md` |

Hệ quả hình học (vật **thấp hơn 0.47 m**, LiDAR không thấy):

```
            vùng depth (0.6-3 m trước camera, +-29 deg)
                 \           /
   sonar1 cone    \         /    sonar2 cone          (+-15 deg mô hình; chùm thật rộng hơn, chưa đo)
     (45 deg) .    \_______/    . (-45 deg)
               .   |  MÙ   |   .        <- dải thẳng trước mũi, x 0.40-1.0 m: KHÔNG sensor nào
                .  |_______|  .            thấy vật thấp (sonar chéo không với tới, depth < 0.6 m)
              [FL]=========[FR]
               ||  thân xe  ||          <- hai bên hông: không sonar
              [RL]=========[RR]
               .             .          <- sau lưng giữa: không; robot không lùi (BT không BackUp)
```

- Sonar trước nhìn **chéo**: điểm gần nhất nó báo được (0.20 m) cách hông xe 0.09–0.16 m ra ngoài.
  Vật nằm trong dải đường đi thẳng (|y| ≤ 0.28 m) **không nằm trong chùm** sonar nào, ở bất kỳ
  khoảng cách nào (chùm phải rộng > ±48° mới với tới). Mô phỏng `low_front` xác nhận: robot đi
  thẳng vào hộp thấp ở mọi cấu hình (mục 6).
- Khi xoay tại chỗ, góc xe quét bán kính 0.49 m; điểm sonar gần nhất cách tâm ≥ 0.67 m. Sonar
  **không thấy** được thứ mà cú xoay tại chỗ sẽ quệt vào (nó nằm trong vùng chết).
- Đóng góp thật của sonar: vật thấp ở **các góc chéo**, 0.2 m tới ~1 m, quan trọng nhất **khi
  cua**, lúc góc trước quét ra phía vật.
- Depth và sonar gần như **không chồng lấn** (depth ±29° quanh trục dọc, sonar 30–60°): không
  có xử lý trùng lặp cần gỡ, nhưng có vùng mù giữa hai bên (sơ đồ trên).

## 2. Nguyên nhân gốc (RCA)

Không còn log runtime của giai đoạn sonar bật (26/08–23/09, commit `4cf5aa9f` → `42a9ebec`);
lưu trữ `~/amr_logs/archive/before-20261013.tar.gz` chỉ có log build của thời đó. Phân tích dưới
đây dựa trên mã nguồn (Nav2 Humble **1.1.20**, đúng bản cài trên MiniPC) và được **tái hiện**
bằng cấu hình `legacy` trong mô phỏng (mục 6).

### R1. "Không có echo" bị gửi thành NaN, và NaN không xoá được gì

- Firmware gộp ba trường hợp vào một mã: không có echo (không có vật trong ~7.7 m), echo < 200 mm
  (vật quá gần) và cảm biến chết.
- Bridge còn gộp thêm "echo hợp lệ nhưng > 2.0 m" vào cùng `NaN`.
- `RangeSensorLayer::processVariableRangeMsg` (`range_sensor_layer.cpp:268`) loại phép đo bằng
  `range < min || range > max`; với NaN cả hai so sánh đều sai nên NaN **lọt qua**, đi vào
  `updateCostmap` với toạ độ NaN. Trong `sensor_model` (`:193`) mọi so sánh với NaN sai nên trả
  0.5, tức cập nhật Bayes **trung tính**: không đánh dấu, cũng **không xoá**.
- `clear_on_max_reading: true` chỉ xoá khi `range >= max_range` (`:279`), mà bridge không bao giờ
  gửi đúng 2.00 m (> 2.0 thành NaN). Cấu hình cũ còn ghi chú đúng nỗi lo: "hết tầm = trống, nếu
  không vết sẽ dính mãi". Vết **dính mãi** thật.
- Kết quả: một người hay vật đi qua góc xe để lại vết LETHAL trong local costmap (khung odom).
  Vết chỉ mất khi robot đi xa > 1.5 m (rolling window 3×3 m) hoặc khi BT xoá cả costmap.

### R2. Một phép đo bị đếm 10–16 lần, và đặt sai chỗ khi robot chạy

- Bridge phát lại giá trị cũ trong mọi khung FB (~40 Hz), trong khi mỗi sonar chỉ đo lại sau
  0.29–0.42 s. Layer coi mỗi bản sao là một phép đo độc lập.
- Một echo yếu ở 2 m (trọng số 0.52) lặp 40 lần thì xác suất vượt `mark_threshold` 0.9: một bức
  tường 2 m thành vật cản LETHAL trong ~1 s đứng yên.
- Stamp là lúc nhận khung, không phải lúc đo: phép đo đã cũ tới 0.42 s bị chiếu từ vị trí **hiện
  tại** của robot (lệch tới 8 cm ở 0.2 m/s, 11° khi quay 0.45 rad/s) và lặp lại → vết bị kéo dài.

### R3. Một khoảng cách không có hướng bị vẽ thành bức tường

- SR04T chỉ cho khoảng cách tới echo **gần nhất trong chùm**, không cho hướng. Layer vẽ cả cung
  ±15° ở khoảng cách đó: 0.5 m rộng ở 1 m, 1 m rộng ở 2 m, rồi inflation 0.6 m.
- Chùm thật của SR04T rộng hơn 30° (chưa đo trên robot): vật ở mép chùm, ví dụ tường song song cạnh
  xe, bị vẽ lệch vào phía đường đi.
- Hướng ±45°/±135° và ánh xạ kênh **chưa đo** (`cad-sensor-mounts.md`): đổi nhầm hai kênh sau thì
  vật bên trái bị vẽ bên phải.
- Trục sonar cao 0.216 m, chúc 4°: chùm có thể chạm sàn (chưa đo); phản xạ sàn là "vật cản" giả
  trước mỗi góc.

### R4. Timeout chung làm controller kẹt

- `no_readings_timeout: 2.0` dùng **một** `last_reading_time_` cho cả 4 topic (một sonar sống là
  đủ "current"), và NaN cũng làm mới mốc này.
- Khi cả 4 im > 2 s (bridge khởi động lại, cắm lại USB STM32, mất khung FB), layer đặt
  `current_ = false` (`:471`) và chỉ trả lại `true` **sau một lần reset** (`:517`, `was_reset_`).
- `controller_server` Humble, trong vòng điều khiển: `while (!costmap_ros_->isCurrent()) r.sleep();`
  (`controller_server.cpp:402`). Vòng này **không** kiểm tra cancel. FollowPath không thành công
  cũng không thất bại, BT không tới được recovery để reset costmap: goal **treo**, cancel không có
  hiệu lực. Mô phỏng `legacy silent` tái hiện (mục 6).

### R5. Chính sách phản ứng: mọi vết đều thành "điều hướng thất bại"

Vết LETHAL của sonar chỉ tác động qua RPP:

1. RPP thấy footprint sẽ chạm ô LETHAL trong `max_allowed_time_to_collision_up_to_carrot` (1.0 s,
   tức 0.2 m ở 0.2 m/s) → ném `detected collision ahead` (`regulated_pure_pursuit_controller.cpp:359`).
2. `controller_server` gửi vận tốc 0, chờ `failure_tolerance` 0.3 s (`nav2_params_v3.yaml:99`) rồi
   `Controller patience exceeded` (`controller_server.cpp:502`) → **FollowPath FAILED**.
3. BT V3: `ClearLocalCostmap-Context` (xoá **toàn bộ** local costmap, kể cả vết LiDAR/depth), thử
   lại; rồi RoundRobin: xoá cả hai costmap → Spin 1.57 rad → Wait 5 s; tối đa 6 vòng → **ABORTED**.
4. `fleet_bridge` (`commands.py:112`): ABORTED → `FAILED NAV2_ABORTED` → backend: Tour
   `NEEDS_ASSISTANCE / NavigationFailed` (ADR-0043). Operator phải bấm Retry (chặng mới).

Planner (global costmap, không có sonar) vẫn vẽ đường cũ xuyên qua vết, nên vòng 1–3 lặp lại
y hệt. Với vết dính mãi (R1), một echo thoáng qua là đủ để đi hết chuỗi này.

Cùng chuỗi đó giải thích luôn rủi ro ngược: recovery xoá costmap rồi chạy lại ngay, kể cả khi
vật thật vẫn còn (đã gặp với chân người 02/11, mục 4.14 master context; với depth 14/11).

## 3. Phân biệt các kiểu "robot dừng"

| Hiện tượng | Ai gây ra | Nav2 thấy gì | Goal | Tour thấy | Cách nhận ra |
|---|---|---|---|---|---|
| **Vận tốc bị chặn** (e-stop, motion gate, link STM32, collision_monitor) | `mode_manager` hoặc guard, *sau* controller | Không biết gì; robot không tiến → sau 15 s `Failed to make progress` | còn chạy, rồi như dòng dưới | không gì, cho tới khi Nav2 kết thúc | `cmd_vel_ctrl` ≠ 0 mà `cmd_vel` = 0; log guard `Robot to approach`; `emergency_stop_state` |
| **Controller failure** | RPP: va chạm phía trước; controller: `patience`, `progress` | FollowPath FAILED | còn chạy, BT vào recovery | không gì | log `detected collision ahead`, `Controller patience exceeded`, `Failed to make progress` |
| **Recovery** | BT | xoá costmap, Spin, Wait | còn chạy | không gì | log `clear entirely`, `Running spin/wait` |
| **ABORTED** | BT hết 6 lần thử | NavigateToPose ABORTED | **kết thúc** | `FAILED NAV2_ABORTED` → NEEDS_ASSISTANCE, Retry được | status 6 |
| **CANCELED** | client: mode_manager (teleop chiếm quyền, e-stop, mất link STM32), fleet_bridge (Pause, mất link backend), người dùng | NavigateToPose CANCELED | **kết thúc** | `CANCELLED` nếu do lệnh Pause; `FAILED NAV2_CANCELED` / `LOCAL_LINK_LOSS` nếu không | status 5; log `Goal was canceled` |
| **Treo** (R4) | costmap không current | không gì kết thúc | **không kết thúc, không huỷ được** | UNKNOWN / timeout | goal chạy mãi, `cmd_vel_ctrl` im |

`sonar_report.py` (mô phỏng) và `sonar_shadow_report.py` (bag robot) tách đúng các cột này.

**Khi nào phải dừng, khi nào giảm tốc, khi nào đi tiếp** (chính sách của guard mới):

- **Giảm tốc**: lệnh hiện tại, kéo dài 1.5 s, sẽ đưa footprint +5 cm chạm một điểm sonar. Giảm
  theo tỉ lệ thời-gian-tới-chạm / 1.5 s, giữ nguyên độ cong.
- **Dừng**: thời-gian-tới-chạm về 0, hoặc điểm đã nằm trong footprint +5 cm.
- **Không phản ứng**: điểm sonar không nằm trên quỹ đạo sắp tới (đi thẳng cạnh tường, cạnh khung
  cửa, quay tại chỗ, lùi xa khỏi vật). Không phải mọi phép đo đều làm chậm robot.
- **Đi tiếp**: ngay khi điểm biến mất (echo xa hơn, hoặc vật rời chùm), trong **cùng goal**, qua
  bộ làm mượt gia tốc. Vật đã lọt vùng chết thì chỉ được thả khi có bằng chứng (mục 4.3).
- **Bỏ cuộc**: không do guard. Nếu robot bị giữ > 15 s, `progress_checker` của Nav2 và các
  recovery chạy như với mọi lần dừng khác; vật vẫn chắn suốt ~3 phút → ABORTED → Retry trên web.

## 4. Kiến trúc đề xuất

### 4.1 So sánh các phương án (Nav2 Humble)

| Phương án | Ưu | Nhược (với phần cứng này) | Kết luận |
|---|---|---|---|
| A. `RangeSensorLayer` sửa ngữ nghĩa (bridge gửi max/±inf, tắt timeout) | có sẵn; vết theo khung odom | vẫn vẽ cung rộng; vẫn chỉ tác động qua RPP → FollowPath FAILED → recovery **xoá costmap** (mất luôn vết vật ở vùng chết) → chạy vào vật; vẫn cần đổi bridge | loại |
| B. Range → PointCloud2 → ObstacleLayer riêng | clear bằng raytrace | cần node chuyển đổi; cùng nhược điểm R5 của A | loại |
| C. `collision_monitor` (Range trực tiếp), không nhớ | có sẵn; không đụng goal; xét hướng chuyển động | mô phỏng: vật lọt vùng chết 0.2 m thì guard thả, robot tăng tốc **đâm** vào (−4.7 cm) | không đủ |
| C'. C + "giữ" phép đo cuối trong **khung sensor** | đơn giản | vật ảo đi theo robot, không bao giờ "tới" → robot chỉ chậm còn 0.09 m/s rồi vẫn đâm (mô phỏng) | loại |
| **D. C + `sonar_memory` (giữ cung trong khung odom tới khi có bằng chứng)** | có sẵn + một node nhỏ không nằm trên đường lệnh; dừng thật, tự đi tiếp | thêm 1 node; giả định về vùng chết cần đo (mục 8 H4) | **chọn** |
| E. Nhánh `feature/claude/sonar-guard` (22/11): node riêng + mặt nạ trong `mode_manager` + hợp nhất LiDAR | xét LiDAR để bỏ echo khung cửa | ~4.5k dòng tự viết, chưa từng chạy trên ROS; chặn ở `mode_manager` (sau smoother: dừng/khởi động giật); "guard im lặng thì chặn mọi chuyển động" = lại một cơ chế dừng do cảm biến | không chọn; có thể dùng lại mô hình Gazebo SR04T của nó |
| F. Đổi controller (MPPI) | chậm dần trước vật, tự né | thay toàn bộ baseline đã đo trên robot | ngoài phạm vi |

### 4.2 Luồng

```
controller_server ─┐                    sonar_mode:=enforce
behavior_server  ──┴─> cmd_vel_ctrl ──> collision_monitor ──> cmd_vel_sonar ──> velocity_smoother ──> cmd_vel_nav ──> mode_manager ──> cmd_vel ──> stm32_bridge
                                          ▲  approach: footprint+0.05 m, 1.5 s
                    ultrasonic/sonar1..4 ─┤  (4 nguồn Range: echo đang thấy)
          sonar_memory ─> sonar_guard/memory (PointCloud2, odom: vật đã lọt vùng chết)
                     └──> sonar_guard/footprint (footprint costmap + 0.05 m)
```

- **Trước** velocity_smoother: cả lúc giảm tốc lẫn lúc chạy lại đều qua giới hạn gia tốc (không
  nhảy 0 → 0.2 m/s trên động cơ bước). Spin của recovery cũng đi qua guard.
- Teleop và e-stop không đi qua guard (vào thẳng `mode_manager`), giữ nguyên quyền ưu tiên.
- `shadow`: cùng các node, đầu ra `cmd_vel_sonar_shadow` không ai nghe; smoother vẫn đọc
  `cmd_vel_ctrl`. Dùng để đo guard *sẽ* làm gì trên robot thật.
- Nối dây bằng một luật remap theo tên node đặt trước luật chung:
  `SetRemap('velocity_smoother:cmd_vel', 'cmd_vel_sonar')`. Đã kiểm tra hiệu lực trong mô phỏng
  (smoother làm theo guard) và bằng `test_sonar_guard_launch.py`.

### 4.3 `sonar_memory`: vì sao, và khi nào giữ / thả

Mỗi sonar: nếu một echo **gần** (< 0.40 m) đã được **xác nhận** (hai phép đo khớp nhau trong
0.10 m, hoặc một giá trị đứng yên quá một chu kỳ firmware) rồi chuyển thành "không echo" trong
vòng 1 s, **và chỗ của echo đó vẫn nằm trước sonar** (trong ±FOV/2 + 10°, không xa hơn), tức vật
mất vì *quá gần* chứ không phải vì robot quay đi hay lùi ra, thì cung của echo cuối được **giữ
trong khung odom**. Thả khi:

1. chính sonar đó, **đang nhìn lại cung giữ** (có điểm của cung trong ±FOV/2 + 10° của chùm hiện
   tại), báo echo hợp lệ ≥ 0.60 m (xem như phía trước nó trống: **giả định**, mục 8 H4). Echo dài
   bắt được khi đang nhìn hướng khác không chứng minh gì: phiên bản đầu thả nhầm như vậy trong lúc
   BT cho robot Spin, rồi robot quay lại đâm vào vật (mô phỏng `low_turn`, 23/11). Ngược lại, chỉ
   xét một điểm tâm thì quá nhạy ở cự ly 0.1 m (lệch vài cm là 28°): bản thứ hai không thả được
   sau khi vật đã được dọn, robot chờ tới ABORTED;
2. sonar khác nhìn xuyên qua các điểm đó ở khoảng cách lớn hơn, ngoài vùng chết của nó;
3. robot đi xa > 1.5 m, hoặc điểm nằm trong footprint thật (sai định vị).

"Không echo" không bao giờ thả. Node không ra lệnh vận tốc, không nằm trên đường lệnh: nếu nó
chết, guard vẫn có 4 nguồn Range trực tiếp; điểm nhớ cũ bị bỏ sau `source_timeout` 1 s. Pose lấy
từ topic `odom` của EKF (30 Hz) và mount sonar từ `/tf_static`, không dùng TF listener Python
(bản đầu tốn ~20 % một nhân J5005 chỉ để giải mã `/tf`).

### 4.4 Lỗi cảm biến và an toàn khi hỏng

| Sự cố | Hành vi |
|---|---|
| Một / cả 4 sonar im (bridge chết, mất link) | nguồn bị bỏ sau 1 s, có WARN; robot chạy như baseline LiDAR + depth (giống camera theo ADR-0001). Bridge chết thì động cơ cũng dừng (CMD_TIMEOUT). |
| Sonar chết nhưng bridge sống (luôn `valid=0`) | không phân biệt được với "không có vật"; **không** có cảnh báo tự động. Phát hiện bằng `sonar_check.py` trước mỗi phiên (mục 8 H1). |
| `collision_monitor` không active ở `enforce` | không có lệnh tới smoother: robot **đứng yên** (an toàn, mất khả dụng). Đã gặp 1 lần offline lúc CPU bận (phản hồi `configure` bị mất, lifecycle manager Humble chờ mãi); đã cho lifecycle manager khởi động trễ 3 s. Kiểm `--guard` trước goal. |
| `sonar_memory` chết | mất bảo vệ vùng chết; guard vẫn chạy với echo trực tiếp. |
| NaN / ±Inf / ngoài [min, max] | nguồn Range của collision_monitor bỏ qua (`range.cpp:81`). |

## 5. Thay đổi triển khai

| File | Thay đổi |
|---|---|
| `robot_navigation/config/sonar_collision_monitor.yaml` | mới: cấu hình collision_monitor (1 polygon approach, 4 Range + memory) |
| `robot_navigation/launch/sonar_guard.launch.py` | mới: sonar_memory + collision_monitor + lifecycle_manager_sonar (trễ 3 s) |
| `robot_navigation/robot_navigation/sonar_memory{,_core}.py` | mới: bộ nhớ vùng chết + footprint có lề |
| `robot_navigation/launch/navigation.launch.py` | `sonar_mode` (off/shadow/enforce), remap smoother khi enforce, `sonar_guard_max_range` |
| `robot_control/launch/manual_mode.launch.py` | chuyển tiếp `sonar_max_range` tới bridge (mặc định 2.0 như cũ; sonar mode = 6.0 để có echo xa làm bằng chứng thả) |
| `robot/scripts/robot` | `robot nav --sonar off\|shadow\|enforce`, khoá profile `SONAR_MODE`; runtime cũ: shadow tự tắt kèm cảnh báo, enforce bị từ chối |
| `robot/tools/sonar/` | `sonar_check.py` (kiểm tĩnh), `sonar_shadow_report.py` (đọc bag) |
| `robot/tools/ops/record_session.sh` | ghi thêm 4 topic sonar, `cmd_vel_sonar(_shadow)`, `sonar_guard/memory` |
| `robot/tools/nav2_bench/sim/` | `NAVSIM_MAP`, wiring sonar trong `sim.launch.py`; `sim/sonar/` kịch bản |
| `docs/architecture.md`, ADR-0069, `robot/AGENTS.md`, `robot_navigation/README.md` | vai trò sonar |

**Không đổi**: firmware, giao thức FB, `stm32_bridge_node.py`, `nav2_params*.yaml` (V2/V3 giữ
nguyên sha), BT, `mode_manager`, `fleet_bridge`, backend.

## 6. Kết quả kiểm thử

### 6.1 Tự động (không cần robot)

| Bộ test | Nội dung | Kết quả |
|---|---|---|
| `robot_navigation/test/test_sonar_memory.py` | 20 ca: giữ/không giữ (một echo, hai echo lệch, echo cũ, quay đi, lùi ra), thả (echo dài khi nhìn lại, khi đang nhìn hướng khác, sau khi bò theo đường cong, sonar khác nhìn xuyên, vùng chết), quên, footprint | pass |
| `robot_navigation/test/test_sonar_guard_launch.py` | phân giải `navigation.launch.py` thật với `sonar_mode` off/shadow/enforce/sai, áp đúng thứ tự luật remap của rcl: off không thêm node nào và smoother đọc `cmd_vel_ctrl`; shadow chỉ nghe; enforce smoother đọc `cmd_vel_sonar`; giá trị sai → dừng launch; hợp đồng YAML của collision_monitor | pass |
| `robot/scripts/tests/test_robot_launcher.py` (`-k sonar`) | `--sonar`, `SONAR_MODE`, chỉ cho `nav`, runtime cũ: shadow tự tắt + cảnh báo, enforce bị từ chối | pass |
| `robot/tools/sonar/test_sonar_tools.py` | thống kê tần số đo thật, phán quyết `--expect`, tách episode trong bag | pass |
| `stm32_bridge` (launch contract, odometry, link safety) | bridge không đổi; `sonar_max_range` vẫn tới node | pass |

### 6.2 Mô phỏng Nav2 V3 thật (`robot/tools/nav2_bench/sim/sonar/`, 23/11)

Một lượt mỗi ô, seed 1; `off` = baseline, `legacy` = RangeSensorLayer như 26/08–23/09.
Cột guard của `shadow` để trống vì đầu ra shadow không điều khiển robot; log cho thấy guard *sẽ*
giảm tốc 1 lần ở `low_turn_removed`.

| kịch bản | cấu hình | kết quả | t (s) | FollowPath fail (va chạm RPP / patience / progress) | recovery (clear / spin / wait) | guard giảm tốc / dừng (s) | giữ vùng chết | hở nhỏ nhất tới vật thấp (m) | thời gian chạm (s) |
|---|---|---|---|---|---|---|---|---|---|
| clean | off | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | – | 0.0 |
| clean | legacy | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | – | 0.0 |
| clean | shadow | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 1 | – | 0.0 |
| clean | enforce | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 1 | – | 0.0 |
| low_front | off | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | -0.36 | 5.0 |
| low_front | legacy | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | -0.36 | 5.0 |
| low_front | enforce | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 1 | -0.36 | 5.0 |
| low_turn | off | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | -0.05 | 4.1 |
| low_turn | legacy | SUCCEEDED | 64 | 6 / 1 / 0 | 1 / 0 / 0 | 0.0 / 0.0 | 0 | -0.03 | 3.1 |
| low_turn | enforce | ABORTED | 268 | 0 / 0 / 14 | 10 / 2 / 2 | 217.8 / 207.0 | 1 | 0.07 | 0.0 |
| low_turn_removed | off | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | -0.03 | 3.5 |
| low_turn_removed | legacy | SUCCEEDED | 65 | 7 / 1 / 0 | 1 / 0 / 0 | 0.0 / 0.0 | 0 | -0.03 | 3.0 |
| low_turn_removed | shadow | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 2 | -0.05 | 4.1 |
| low_turn_removed | enforce | SUCCEEDED | 79 | 0 / 0 / 1 | 1 / 0 / 0 | 16.2 / 11.7 | 2 | 0.09 | 0.0 |
| low_turn_gone_early | off | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | 1.09 | 0.0 |
| low_turn_gone_early | legacy | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | 1.09 | 0.0 |
| low_turn_gone_early | enforce | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 1 | 1.08 | 0.0 |
| noise | off | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | – | 0.0 |
| noise | legacy | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | – | 0.0 |
| noise | enforce | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 1 | – | 0.0 |
| silent | off | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | – | 0.0 |
| silent | legacy | HUNG | 150 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | – | 0.0 |
| silent | enforce | SUCCEEDED | 64 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | – | 0.0 |
| cancel | off | CANCELED | 15 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | – | 0.0 |
| cancel | legacy | CANCELED | 15 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | – | 0.0 |
| cancel | enforce | CANCELED | 15 | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 / 0.0 | 0 | – | 0.0 |

Đọc bảng:
- **Tái hiện lỗi cũ (legacy)**: `silent` → goal **treo** 150 s, cancel không dừng được FollowPath
  ("Action callback is still running and missed deadline to stop") = R4. `low_turn*` → 6–7 lần
  "collision ahead" → `patience` → FollowPath FAILED → xoá local costmap → robot chạy lại và **chạm**
  vật (−3 cm) = R5. Vẫn ra SUCCEEDED: thất bại "êm" nhưng có va chạm.
- **Không tái hiện được trên tuyến này**: `noise` (3 % echo giả) và vết cũ (`gone_early`) không gây
  lỗi ở `legacy`, vì vết rơi ngoài dải footprint quét qua. R1–R3 là kết luận từ mã nguồn; tuyến có
  khúc cua gắt hơn, khung cửa hẹp hơn hay sàn phản xạ sẽ khác.
- **Enforce**: `clean`, `noise`, `silent`, `gone_early`, `cancel` giống hệt baseline (0 can thiệp,
  cùng thời gian 63.6 s, khung cửa 0.9 m không dừng oan, sonar im thì chạy như LiDAR-only).
  `low_turn_removed`: chậm dần, dừng cách vật **8.9 cm**, giữ 11.7 s, bộ nhớ thả đúng lúc vật được
  gỡ, **SUCCEEDED trong cùng goal**, không Retry. `low_turn` (vật nằm lì): **không chạm** suốt
  268 s (6.5 cm), Nav2 tự leo thang rồi ABORTED → Retry trên web. `cancel` → CANCELED.
- **Không cấu hình nào cứu được `low_front`** (vật thấp thẳng trước mũi): −0.36 m ở cả bốn. Đây là
  giới hạn phần cứng (mục 1), không phải lỗi phần mềm.

Các phiên bản trung gian bị loại nhờ mô phỏng (đều ở `~/amr_logs/nav2_bench/sonar/` lúc chạy, nay đã
ghi đè): collision_monitor không nhớ (chạm −4.7 cm khi vật vào vùng chết); giữ trong khung sensor
(chạm, robot vẫn 0.09 m/s); thả bằng echo dài lúc Spin (chạm −29 cm sau recovery); thả theo một
điểm tâm (vật đã dọn mà vẫn ABORTED).

### 6.3 Khác
- CPU (mô phỏng, J5005): `sonar_memory` ~16 %, `collision_monitor` ~7 % một nhân.
- Trước khi cho lifecycle manager khởi động trễ 3 s: 1/5 lần khởi động trong mô phỏng, `configure` của
  collision_monitor mất phản hồi khi CPU bận (đang chạy test song song), lifecycle manager chờ mãi,
  robot không chạy, goal ABORTED sau 261 s. Sau khi sửa: 0/21. Không chứng minh được là hết hẳn:
  vẫn phải kiểm `--guard` trước goal (mục 8 H6).

## 7. Giới hạn còn tồn tại

1. **Không bảo vệ 360°.** Thẳng trước mũi (vật thấp 0.40–1.0 m), hai hông, sau lưng: sonar không
   thấy. Vật thấp phía trước chỉ còn depth (≥ 0.6 m trước camera, có nhớ trong local costmap cho
   tới khi BT xoá costmap) và người đi kèm.
2. **Vùng chết 0.2 m**: chỉ được che nếu vật đã được thấy ở 0.2–0.4 m trước khi lọt vào. Vật lọt
   vào từ bên hông (robot xoay, người bước sát) không được giữ.
3. **Thả bộ nhớ dựa trên giả định** "echo dài ≥ 0.6 m nghĩa là phía trước sonar trống". Nếu SR04T
   thật vẫn báo bức tường xa khi có vật ở 0.1 m trước nó, phải đặt `blind_clear_range:=0` (khi đó
   robot chờ tới khi có người dọn và robot được dời đi / Retry). Đo ở mục 8 H4.
4. **Hướng chùm và ánh xạ kênh chưa đo**: guard đặt điểm theo TF; TF sai thì phản ứng sai hướng.
   Cung ±15° (FOV 0.52) hẹp hơn chùm thật: vật ở mép chùm có thể gần hơn chỗ guard vẽ.
5. **Stamp là lúc nhận khung**, dữ liệu cũ tới 0.42 s: ở 0.2 m/s lệch tới 8 cm; bù bằng 1.5 s nhìn
   trước, và ở cuối pha dừng tốc độ đã gần 0. Muốn chính xác hơn cần firmware gửi số thứ tự /
   tuổi phép đo (đề xuất, không làm ở đây).
6. Guard ngoại suy **lệnh hiện tại** (v, ω không đổi), không theo đường cong sắp tới của RPP:
   trong cua nó phản ứng muộn hơn costmap (mô phỏng: bắt đầu giảm tốc khi còn ~0.22 m).
7. Giữ lâu > 15 s vẫn kích hoạt progress checker và recovery của Nav2 (Spin, xoá costmap). Spin
   đi qua guard nên không quét vào điểm sonar, nhưng recovery xoá costmap vẫn xoá vết depth/LiDAR
   như baseline (không đổi ở đây).
8. Phản xạ sàn (trục 0.216 m, chúc 4°) chưa đo; nếu có, các cung giả ở góc trước sẽ làm robot
   chậm khi cua.
9. **CPU** (mô phỏng, J5005): `sonar_memory` ~16 % một nhân, `collision_monitor` ~7 %. Phần lớn
   là chi phí rclpy cho 160 Range/s (bridge phát lại mỗi sonar ở mọi khung FB). Nếu đo trên robot
   (H5) thấy quá nặng: cho bridge chỉ phát khi giá trị đổi kèm nhịp giữ ~5 Hz (giữ được
   `source_timeout`), hoặc viết lại node bằng C++. Chưa làm.
10. Khi một nguồn bị bỏ vì quá hạn, `collision_monitor` Humble ghi WARN ở **mỗi chu kỳ** (mô phỏng
   `silent`: ~2200 dòng/phút). Chỉ xảy ra khi bridge hoặc `sonar_memory` đã chết.
11. Mô phỏng sạch hơn thực tế: odometry hoàn hảo, chùm lý tưởng ±20°, không có phản xạ sàn.

## 8. Nghiệm thu trên robot thật

Điều kiện chung: người đi kèm cầm E-stop; luôn ghi bag (`record_session.sh` đã có topic sonar);
mỗi bước một thay đổi; rollback = `robot nav` không `--sonar` (hoặc `SONAR_MODE=off`).
Chưa có runtime nào trên MiniPC chứa nhánh này: cần stage một overlay mới (`runtime-deploy.md`).

**H0. Bánh kê / robot đứng yên, `robot nav --sonar shadow` (hoặc `manual`).**
`python3 robot/tools/sonar/sonar_check.py --seconds 10`. Đạt: 4 sonar ~40 msg/s, 2.4–3.5 new/s,
TF có đủ 4 frame với yaw ±45/±135.

**H1. Ánh xạ kênh và hướng, từng sonar một** (tấm bìa phẳng đặt bằng thước).
Đặt tấm ở 0.50 m trên trục danh nghĩa của góc trước-trái, các góc khác để trống ≥ 1.5 m:
`sonar_check.py --expect sonar1=0.50`. Lặp cho sonar2–4. Đạt: đúng sonar báo, sai số ≤ 5 cm;
sai kênh hay sai dấu yaw thì **sửa `sensors.xacro` trước**, không đi tiếp.
Thêm: xoay tấm sang ±15°, ±30° quanh trục ở 0.5 m để đo **góc chùm thật** (ghi lại; nếu > ±15°
cân nhắc tăng `sonar_field_of_view` của bridge).

**H2. Sàn.** Robot đứng giữa sảnh trống (≥ 2 m mọi phía), trên từng loại sàn của tuyến:
`sonar_check.py --seconds 30`. Đạt: không sonar nào có echo hợp lệ < 1.0 m. Có thì ghi lại, đó
là cung giả (giới hạn 8).

**H3. Vùng chết.** Đưa hộp thấp (≤ 0.3 m cao) từ 0.60 m vào sát từng sonar, mỗi 5 cm, giữ 2 s.
Ghi giá trị tại 0.25, 0.20, 0.15, 0.10, 0.05 m. Đạt (giả định của thiết kế): dưới 0.20 m báo NaN.

**H4. Giả định thả bộ nhớ.** Hộp ở 0.10 m trước sonar, phía sau có tường ở 1–2 m:
nếu sonar báo **NaN** → giả định đúng, giữ `blind_clear_range` 0.60. Nếu nó báo bức tường
(≥ 0.6 m) → giả định **sai**, đặt `blind_clear_range:=0` trong `sonar_guard.launch.py` trước khi
enforce.

**H5. Shadow trên tuyến** (A↔B và START↔POI_01 ×2, `robot nav --sonar shadow`, có bag).
Sau mỗi phiên: `python3 robot/tools/sonar/sonar_shadow_report.py <session>/bag`. Đạt:
- 0 lần "STOP" khi không có vật thấp thật trên tuyến; mọi episode giải thích được (khung cửa,
  người, vật thấp thật);
- chuyển động, thời gian chặng, recovery giống baseline (shadow không được ảnh hưởng motion);
- CPU (`top`, 60 s giữa tuyến): ghi lại `collision_monitor` và `sonar_memory`; mô phỏng là
  ~7 % và ~16 % một nhân. Trên 30 % tổng thì làm tối ưu ở giới hạn 9 trước khi enforce.

**H6. Enforce, chặn có kiểm soát** (`robot nav --sonar enforce`, trước goal:
`sonar_check.py --guard` phải `PASS collision_monitor: active`).
1. Hộp thấp ở góc trong một khúc cua (như mô phỏng `low_turn`). Đạt: robot chậm dần và dừng,
   hộp không bị chạm, goal **vẫn chạy**.
2. Dọn hộp sau ~10 s. Đạt: robot tự đi tiếp trong cùng goal (log `sonar memory: clear`),
   SUCCEEDED, không cần Retry.
3. Để hộp ~3 phút. Đạt: recovery của Nav2, rồi ABORTED → web NEEDS_ASSISTANCE → Retry sau khi
   dọn → chạy tiếp.
4. Khung cửa 0.9 m và hành lang hẹp: 0 lần dừng.
5. Teleop chiếm quyền và E-stop trong lúc guard đang giữ: vẫn hoạt động như cũ (CANCELED).

**H7. Nhắc lại**: `enforce` không thay thế người đi kèm: vật thấp **thẳng trước mũi** không được
sonar nhìn thấy.

Rollback: bỏ `--sonar` / `SONAR_MODE=off` (không cần đổi runtime); hoặc dùng runtime cũ.

## 9. Liên quan

- `robot_navigation/README.md`: lịch sử `sonar_layer` và acceptance E.
- `depth-camera.md`: cùng vấn đề "recovery xoá costmap rồi đi tiếp" với vật chỉ depth thấy.
- Nhánh `feature/claude/sonar-guard` (22/11, chưa merge): phương án E ở mục 4.1.
- Mô phỏng: `robot/tools/nav2_bench/sim/sonar/README.md`.
