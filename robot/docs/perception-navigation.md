# Perception và navigation tổng thể: LiDAR + depth + sonar (đề xuất 25/11/2026)

Tài liệu này nhìn robot như **một hệ AMR**, không phải ba hệ cảm biến riêng lẻ.
- Mọi số liệu ở đây lấy từ TF của robot đang chạy, bag và mô phỏng ngày 23–25/11.
- Không dựa vào ADR cũ: một số ADR ghi sai thông số (ví dụ "LiDAR ~0.27 m").
- Mỗi kết luận được ghi rõ là **[đã chứng minh]**, **[giả thuyết]** hay **[giới hạn vật lý]**.

Chi tiết từng phần: `depth-camera.md` (mục 6.4), `sonar-perception.md` (nhánh
`feature/claude/sonar-perception`), ADR-0068.

## 1. Robot thật nhìn thấy gì

| Cảm biến | Vị trí, tầm, tần số | Thấy | Không thấy |
|---|---|---|---|
| RPLiDAR A3 | Mặt quét **0.473 m** trên sàn (TF), 360°, 11.8 Hz, trễ trung vị 83 ms (có lúc 349 ms) | Tường, người (chân), vật cắt qua mặt quét, ở mọi hướng | **Mọi vật thấp hơn 0.47 m**; kính (đi xuyên) |
| Astra Pro depth | Cao 0.273 m, nhìn thẳng, 58° × 45°, 19.5 Hz. Đánh dấu khi độ sâu 0.6–3.0 m (local: chỉ tới ~1.1 m trước mũi vì cửa sổ 3 × 3 m) | Vật 8 cm–1.2 m cao ở **phía trước** | **0–0.6 m trước mũi** (tầm gần nhất của Astra); hai bên và phía sau; vật < 8 cm; kính |
| 3 × JSN-SR04T còn sống (s4 sau-phải hỏng) | Ở 4 góc, nhìn **chéo 45° ra ngoài**, chúc xuống. Mỗi sonar một phép đo mới mỗi **0.35 s** | Vật trên **đường chéo**, cách 0.2 m tới mép echo sàn: s1 ≤ 0.46, s2 ≤ 0.58, s3 ≤ 0.64 m (đo 2 phiên) | **Đường đi phía trước** (phủ 0 %, kể cả chùm ±35°); vật sát hơn 0.2 m (khi đó lại **báo echo sàn**); xa hơn mép sàn |
| Odom | Đếm xung STEP + IMU (IMU chỉ phát khi đổi, đứng yên có quãng 14 s) | Quãng đường **đã ra lệnh** | Bánh trượt hay không quay: odom vẫn chạy |

**Vùng không cảm biến nào thấy, với cách lắp hiện tại [giới hạn vật lý]:**
- Phía trước mũi 0–0.6 m, dưới 0.47 m.
- Hai bên thân và phía sau, dưới 0.47 m, ngoài ba đường chéo sonar.
- Vật thấp hơn khoảng 8 cm.
- Kính ở mọi độ cao. Riêng sonar thấy kính, nhưng chỉ trên đường chéo.

## 2. Điểm yếu thực sự, xếp theo mức nguy hiểm

| # | Điểm yếu | Bằng chứng | Trạng thái |
|---|---|---|---|
| 1 | BT gỡ kẹt bằng cách xoá **toàn bộ** costmap, làm quên vật thấp đã vào vùng mù camera, rồi đâm vào nó | Robot 25/11 11:28 (dừng 3 lần rồi đâm). Sim chế độ cũ: nhích 0.69 → 0.21 m rồi ABORTED | [đã chứng minh] → **đã sửa** (mục 4, ADR-0068) |
| 2 | Planner không biết có vật thấp, nên vạch thẳng qua. Robot chỉ dừng, không bao giờ đi vòng | Sim chế độ cũ: ABORTED; ADR-0001 | [đã chứng minh] → **đã sửa** trong chế độ camera |
| 3 | Bánh không quay (driver tắt, kẹt) nhưng odom STEP vẫn chạy. Nav2 và progress checker không biết; AMCL nhảy | Bag 25/11 11:15: `NO_MOTION` 26 s, odom trôi khoảng 4 m. Bridge chỉ ghi nhận | [đã chứng minh], **chưa sửa** |
| 4 | Cảm biến chết giữa chừng thì Nav2 không biết: mọi lớp vật cản đặt `expected_update_rate: 0` | Cấu hình V2/V3; `costmap_check.py` 14/11 | [đã chứng minh], **chưa sửa** |
| 5 | Sonar góc không bảo vệ được đường đi phía trước, và vật trong vùng chết làm sonar báo "sàn trống" | Bag 11:06 (đâm hộp), 11:16 (hộp cách 0.14 m, sonar báo sàn), hình học | [đã chứng minh], [giới hạn vật lý] |
| 6 | Hai thiết kế sonar guard cũ đều giả định sonar nhìn ngang. Nhánh `sonar-guard` (ngưỡng chậm 0.70 m) sẽ cho xe chạy chậm **79–88 %** lệnh trên sàn này | Chạy lại `sonar_guard_core` trên bag 25/11 | [đã chứng minh] |
| 7 | V2: BT chờ dịch vụ 20 ms, nên lệnh xoá costmap toàn cục báo "timed out" dù vẫn chạy | Log sim 25/11; `nav2-baseline-v3.md` | [đã chứng minh], V3 đã sửa (chưa nghiệm thu robot) |
| 8 | Recovery Spin 90° quay camera đi chỗ khác, góc xe quét qua vùng mù hai bên. Khi quay lại, robot gần vật hơn | Chuỗi log 11:28; sim cũ có 2 spin trước khi nhích | [giả thuyết có dấu hiệu] |
| 9 | Vết cũ không ai xoá: người đi sát hông (ngoài góc nhìn), vật được dọn khi không có gì phía sau cho tia chạm (kính, khoảng trống), nhiễu sàn ở xa trong global costmap | 14/11: 448 ô vết cũ; cơ chế ObstacleLayer | [giả thuyết], phải đo trên robot. Bản sửa #1 làm vết gần **ở lâu hơn** |
| 10 | Máy tải cao làm BT hết thời gian chờ, robot từ chối đi | 14/11 15:22 (load 26). Hôm nay load 3–9 trên 4 nhân; `fleet_bridge` 21 %, `stm32_bridge` 20 % | [đã chứng minh] ngày 14/11 |

## 3. Kiến trúc đề xuất: mỗi lớp một việc

```
Bản đồ tĩnh (kính, vùng cấm vẽ tay) ─┐
LiDAR (≥ 0.47 m, 360°) ──────────────┼─► global costmap ─► planner 1 Hz: ĐI VÒNG khi còn đường
Depth ≤ 2 m (chỉ chế độ camera) ─────┘
LiDAR + depth 0.6–1.1 m ─────────────► local costmap ─► RPP: chậm dần gần vật, DỪNG cách ~0.7 m
BT gỡ kẹt: xoá trừ vùng 2.2 m quanh robot, không bao giờ quên vật sát mũi
Sonar góc (vật trên đường chéo, dưới mép sàn) ─► collision_monitor: chỉ GIẢM TỐC khi quay/cua sát vật
Sức khoẻ: LiDAR/camera/odom cũ, encoder NO_MOTION ─► DỪNG VÀ GIỮ goal, tự đi tiếp khi khoẻ lại
```

| Lớp | Cảm biến | Vai trò | Lý do |
|---|---|---|---|
| Bản đồ | Bản đồ sửa tay | Kính và chỗ không được đi | LiDAR và depth không thấy kính. Đây là cách rẻ nhất, chắc nhất |
| Lập đường | LiDAR + depth ≤ 2 m | Đi vòng trước khi tới gần | Planner có sẵn; vật thấy sớm thì không cần dừng |
| Điều khiển | LiDAR + depth | Giảm tốc, dừng trước vùng mù camera | RPP có sẵn (T = 4 s, chậm theo cost) |
| Gỡ kẹt | — | Không xoá vết mà không ai vẽ lại được | Nguyên nhân gốc của lần đâm |
| Bảo vệ gần | Sonar | Chỉ giảm tốc khi quay hoặc cua sát vật thấp ở góc | Đó là chỗ duy nhất sonar thấy mà camera không thấy |
| Sức khoẻ | Tất cả | Dữ liệu cũ hoặc bánh không quay thì dừng tạm, không huỷ goal | Hiện nay Nav2 không biết, robot chạy như mù |

**Không đề xuất:**
- Gộp dữ liệu thô.
- Đổi controller (DWB/MPPI): planner đã đi vòng được, và MPPI quá nặng cho J5005.
- STVL: phải cài APT.
- Đưa sonar vào costmap: sonar chỉ thấy đường chéo, lại báo sàn khi vật ở vùng chết. Vết sonar
  sẽ vừa sai vị trí vừa không xoá đúng được.

## 4. Đã làm và đã kiểm (nhánh `feature/claude/camera-keep-near-marks`)

Chế độ camera (`robot nav --camera`) đưa cho Nav2 một bản sao của file params với 4 thay đổi:
1. RPP T = 4 s.
2. Depth vào global costmap, đánh dấu tới 2 m.
3. Depth chỉ xoá từ 0.65 m (vẫn đánh dấu từ 0.6 m).
4. Mọi lệnh xoá costmap của BT thành `ClearCostmapExceptRegion` 2.2 m.

Chế độ LiDAR-only dùng file params và cây BT nguyên vẹn.

Mô phỏng vòng kín (Nav2 V2 thật, robot giả trên `map2`, hộp 30 × 30 × 15 cm chỉ depth thấy):

| Kịch bản | Chế độ camera cũ | **Mới** |
|---|---|---|
| Hộp giữa đường, còn chỗ | Nhích dần rồi **đâm**, goal vẫn SUCCEEDED, giống robot 11:28 | **Đi vòng**, không dừng, 37 s, cách hộp 0.19 m |
| Chắn kín, dọn hộp | Nhích tới 0.33 m, ABORTED | Dừng 1.5 m, chờ, **tự đi tiếp**, 53 s |
| Chắn kín, để nguyên | — | Không chạm, ABORTED 53 s, dừng cuối 0.61 m |
| Hộp xuất hiện muộn ở 0.65–0.7 m (`stop_sim`) | Nhích 0.2 m, mất vết | Dừng 0.51–0.55 m, giữ vết |
| Hộp xuất hiện ở 0.5 m | Đâm | Đâm: **giới hạn vật lý** |

Muốn bịt cả hai đường mất vết thì cần đủ hai thay đổi: BT xoá trừ vùng quanh robot, và depth xoá
từ 0.65 m. Chi tiết ở `depth-camera.md` mục 6.4. Mô hình sim đã sửa ngày 25/11 để cắt 0.6 m theo
độ sâu như Astra (trước đó lạc quan).

## 5. Thứ tự triển khai và tiêu chí nghiệm thu

Mỗi bước một thay đổi, có bag, so với lượt trước. Không bước nào cần sửa firmware.

| Bước | Việc | Nghiệm thu trên robot | Cần |
|---|---|---|---|
| 1 | Chế độ camera mới (nhánh này) | T1–T3 (mục 6), mỗi bài 3 lần, không chạm vật. Tuyến tour 2 lượt: số lần dừng/recovery không tệ hơn lượt camera tắt quá 1–2 lần | Bạn cho phép deploy |
| 2 | V3 làm nền cho chế độ camera: timeout BT 200 ms (đã có sẵn) | `nav2-baseline-v3.md` §5 và T1–T3 lặp lại | Deploy |
| 3 | Cổng sức khoẻ: encoder `NO_MOTION`, LiDAR/camera/odom quá hạn → dừng và giữ goal, tự đi tiếp khi khoẻ lại | T7, T8 | Code mới, sim, deploy |
| 4 | Kính và vùng cấm vẽ vào bản đồ tuyến | T6 | Sửa bản đồ |
| 5 | Sonar góc, chế độ **shadow**: ngưỡng theo từng sonar dưới mép sàn; không thả nhớ chỉ vì thấy sàn | Bag các tuyến thật: tỉ lệ "sẽ giảm tốc oan" gần 0; T5 thấy vật | Sửa mô hình sonar trong sim cho khớp robot (góc 45°, sàn, vùng chết, s4), deploy |
| 6 | Sonar **enforce**, chỉ giảm tốc, không dừng | T5 và tuyến tour | Bạn cho phép |
| 7 | (Phần cứng, tuỳ chọn) xoay 2 sonar trước nhìn thẳng ra trước để phủ vùng mù 0.2–0.6 m của camera | Đo lại T0/T1 sonar | Bạn quyết định |

## 6. Bài test tích hợp giá trị cao

| # | Tình huống | Đạt khi |
|---|---|---|
| T1 | Hộp thấp giữa đường, còn chỗ | Đi vòng, không dừng, không chạm |
| T2 | Hộp chắn kín (hai bên có vật LiDAR thấy), dọn hộp sau 10–20 s | Dừng cách hộp ≥ 0.5 m, chờ, không nhích vào. Dọn hộp thì tự đi tiếp cùng goal |
| T3 | Như T2, hộp để nguyên | Không chạm; goal ABORTED trong khoảng 1 phút; ghi khoảng cách các lần dừng |
| T4 | Người đi ngang đường, rồi người đi dọc sát hông rồi rời đi | Dừng hoặc chậm rồi đi tiếp, không phải Spin; không bị chặn vì vết cũ (kiểm điểm yếu #9) |
| T5 | Xoay tại chỗ hoặc cua sát vật thấp ở góc (camera không thấy) | Sonar shadow báo đúng sonar ở góc đó; không báo oan trên sàn trống |
| T6 | Đi về phía vách kính | Planner không vạch đường xuyên kính |
| T7 | Rút USB camera, rồi tắt LiDAR giữa tuyến | Hiện nay: ghi lại hành vi. Sau bước 3: dừng và giữ goal |
| T8 | Tắt nguồn driver động cơ khi đang có goal | Hiện nay: odom trôi. Sau bước 3: dừng, báo lỗi, không trôi |
| T9 | Tuyến tour đầy đủ, camera bật, 2 lượt | Không tệ hơn camera tắt về thời gian; số recovery ghi rõ nguyên nhân |

## 7. Những gì chưa biết

- Tỉ lệ dừng oan trên tuyến thật khi depth vào global costmap (nhiễu sàn 1–2 m, người đi ngang).
- Vùng giữ 2.2 m có làm robot chờ hay ABORTED oan vì vết cũ sát hông không.
- Dọn hộp trong phòng kính có xoá được vết không (cần vật phía sau cho tia depth chạm vào).
- Trễ dừng thật của chuỗi camera → costmap → RPP → STM32 trên robot.
