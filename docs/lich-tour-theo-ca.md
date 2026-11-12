# Lịch Tour theo ca, giới hạn thời lượng và quy tắc điểm dừng

- **Trạng thái:** Chủ dự án chốt ngày 06/11/2026. Triển khai theo 3 phần A, B, C (mục 10).
- **Thay thế:** ADR-0035 quyết định 2 (slot chỉ là giờ bắt đầu) và toàn bộ ADR-0036 (Staff gõ giờ trong 08:00–17:00).
  Các quyết định khác của ADR-0034/0035 giữ nguyên: tạo Tour trước ít nhất 72 giờ, đóng đăng ký 48 giờ trước giờ Tour,
  thời lượng lấy từ lần chạy thử PASS (đo cả thời gian dừng) cộng phần dừng tăng thêm.
- **Cách ghi tài liệu:** Đợt này không viết ADR mới. File này là nguồn duy nhất cho các thay đổi bên dưới; từ 07/11/2026
  các tài liệu trên đã trỏ về file này. Chỗ nào còn mâu thuẫn với tài liệu cũ thì theo file này.

## 1. Vì sao đổi

- Hiện tạo được tuyến chỉ 1 điểm dừng, rồi lấy luôn vị trí POI đó làm điểm bắt đầu. Robot gần như không di chuyển,
  nhưng hệ thống vẫn cho lưu, gửi kiểm chứng và chạy thử.
- Không có giới hạn thời lượng. Thời gian dừng mỗi điểm được tới 3600 giây, pin chỉ hiển thị chứ không chặn (ADR-0042, D3).
  Ngày nào trống thì tuyến 3 tiếng vẫn xếp được lịch.
- Cho gõ giờ tự do làm lịch lắt nhắt, đại diện trường khó chọn, lúc trình bày cũng khó nhìn. Các slot hiện tại
  (09:00, 10:00, 14:00, 15:00) chỉ là giờ bắt đầu: một Tour 100 phút lúc 09:00 sẽ chiếm luôn slot 10:00.
- Robot chạy 0.2 m/s khi vừa đi vừa stream, nên thời lượng là giới hạn thật. Giới hạn thời lượng cũng là lớp bảo vệ pin
  duy nhất hiện có.

## 2. Quy tắc tuyến

Chỉ áp dụng khi lưu một phiên bản tuyến mới, ở cả server lẫn form. Phiên bản đã lưu trước đây không bị kiểm lại,
vẫn đọc và xếp lịch như cũ.

| Quy tắc | Giá trị | Ghi chú |
|---|---|---|
| Số điểm dừng tối thiểu | 2 | `Routes:MinStops`, cho phép 1..100 |
| Thời gian dừng mỗi điểm | 15–300 giây | Trước đây 1–3600. Tổng thời gian giữ đầu camera (head steps) vẫn phải nằm trong thời gian dừng |
| Điểm bắt đầu cách mọi điểm dừng | ≥ 1.0 m | `Routes:MinStopSeparationMeters`, đo khoảng cách X/Y trên bản đồ |
| Hai điểm dừng liền nhau cách nhau | ≥ 1.0 m | Cùng tham số |
| Kết thúc "Về một vị trí riêng" cách điểm dừng cuối | ≥ 1.0 m | Gần hơn thì phải chọn "Dừng tại điểm dừng cuối" |
| Kết thúc "Quay về điểm bắt đầu" | Luôn hợp lệ | Điểm bắt đầu đã qua quy tắc khoảng cách ở trên |
| Tổng thời gian dừng | ≤ thời lượng tối đa của ca dài nhất (mục 4) | Chưa tính thời gian di chuyển, nên chỉ chặn những tuyến chắc chắn không vừa ca |

Trên form tạo/sửa tuyến:
- Ở bước Điểm bắt đầu/Kết thúc, mục "lấy từ một POI" không cho chọn POI đang là điểm dừng: làm mờ, kèm chữ "đang là điểm dừng".
- Vị trí quá gần một điểm dừng thì báo lỗi ngay tại chỗ, ghi rõ tên điểm dừng đó, và không cho sang bước tiếp.
- Bước "Xem lại và lưu" hiện lộ trình đúng thứ tự robot đi: `Bắt đầu → 1. … → 2. … → Kết thúc`. Kèm tổng thời gian dừng
  và dòng "Thời lượng thật chốt sau khi Kỹ thuật chạy thử".

## 3. Ca cố định

| Ca | Giữ robot | Tour bắt đầu | Tour kết thúc muộn nhất |
|---|---|---|---|
| S1 · Ca sáng | 08:00–10:00 | 08:15 | 09:45 |
| S4 · Ca trưa | 11:00–12:00 | 11:15 | 11:45 |
| S2 · Ca chiều 1 | 13:00–15:00 | 13:15 | 14:45 |
| S3 · Ca chiều 2 | 16:00–18:00 | 16:15 | 17:45 |
| S5 · Ca tối | 19:00–21:00 | 19:15 | 20:45 |

- Ca là khung **giữ robot**, đã gồm 15 phút chuẩn bị và 15 phút kết thúc (đúng `ReservationBuffer` hiện có).
  Giờ bắt đầu Tour = đầu ca + 15 phút.
- Giữa hai ca nghỉ ít nhất 1 tiếng để sạc pin và reset robot.
- S4 và S5 thêm ngày 09/11/2026 để có thêm chỗ trong ngày, lúc đó nhằm cho Tour ngắn hạn (ADR-0050); từ ADR-0053 Tour nhanh không cần ca nữa. Mã ca mới
  nằm sau S3 để Tour đã tạo giữ nguyên mã. S4 chỉ dài 1 tiếng nên chỉ nhận tuyến chạy tối đa 30 phút.
- Mỗi robot nhận tối đa 1 Tour mỗi ca. Tour mới giữ robot trọn ca (`StartsAt` = đầu ca, `EndsAt` = cuối ca),
  không còn tính khung giữ theo thời lượng.
- Staff không gõ giờ nữa: chọn ngày rồi chọn ca. Server chỉ nhận `ScheduledStartAt` trùng đúng giờ bắt đầu Tour
  của một ca. Các giờ khác trả 409 `TOUR_SLOT_NOT_ALLOWED`.
- Danh sách ca nằm trong cấu hình (`Tours:Shifts`). Đổi ca phải sửa cấu hình rồi deploy, chưa có màn hình sửa ca (mục 9).
- Tour cũ đã tạo ở giờ lẻ giữ nguyên: vẫn hiện trên lịch, vẫn chốt, mở lại, huỷ được như thường. Khung giữ robot của
  các Tour này vẫn được tính khi kiểm tra trùng.

## 4. Giới hạn thời lượng

- **Thời lượng tối đa trong một ca** = độ dài ca − 15 phút chuẩn bị − 15 phút kết thúc. Ca 2 tiếng thì được 90 phút.
  Con số này tính ra từ ca, không đặt tham số riêng, để hai giá trị không bao giờ lệch nhau.
- **Mức khuyến nghị** là 60 phút (`Tours:RecommendedMaxMinutes`). Vượt mức này chỉ hiện cảnh báo vàng, không chặn.
- Giá trị đem so là `ExpectedDurationSeconds` hiện có: số đo của lần chạy thử PASS (đã gồm thời gian dừng),
  cộng phần dừng tăng thêm.

Kiểm tra ở 3 chỗ:
1. **Lưu tuyến:** tổng thời gian dừng vượt thời lượng tối đa của ca dài nhất thì trả 409 `ROUTE_TOO_LONG_FOR_SHIFT`.
2. **Sau khi Kỹ thuật ghi PASS:** kết quả chạy thử vẫn ghi PASS, vì robot đi được tuyến. Nhưng nếu thời lượng vượt mức
   tối đa của mọi ca, tuyến hiện nhãn "Quá dài cho 1 ca" ở danh mục tuyến và trang chi tiết, và không xếp lịch được.
   Nếu vượt mức khuyến nghị thì hiện nhãn vàng "Dài hơn 60 phút khuyến nghị".
3. **Tạo Tour và danh sách ca trống:** ca nào không đủ chỗ cho tuyến thì hiện lý do `ROUTE_TOO_LONG_FOR_SHIFT`.
   Cố tạo Tour vào ca đó cũng trả 409 với cùng mã.

## 5. Đóng/mở lịch: ai làm gì

**Admin** (thuộc phần cấu hình hệ thống, scope §2):
- Khoá cả một ngày, hoặc một ca trong một ngày (nghỉ lễ, bảo trì). Bắt buộc ghi lý do. Gỡ khoá được.
  Mọi lần khoá và gỡ đều ghi audit log.
- Không được khoá ca đang có Tour chưa huỷ: trả 409 `SHIFT_HAS_TOURS` kèm danh sách các Tour đó.
  Admin không có quyền vận hành Tour, nên Staff phải huỷ Tour trước rồi mới khoá được.

**Staff** (vận hành từng Tour, giữ nguyên các chức năng đang có):
- Chốt Tour (READY), mở lại (READY → SCHEDULED), huỷ Tour.
- Thấy ca bị khoá trên Lịch Tour (ô xám kèm lý do) và không tạo được Tour vào ca đó.

Với ca bị khoá, danh sách ca trống hiện lý do `SHIFT_BLOCKED`, còn tạo Tour vào đó trả 409 `SHIFT_BLOCKED`.

**API**

| Endpoint | Role | Việc |
|---|---|---|
| `GET /api/staff/manage/tours/shifts?from=&to=` | Staff | Các ca của từng ngày kèm `block`, tối đa 31 ngày |
| `GET /api/admin/schedule-blocks?from=&to=` | Admin | Cùng dạng response với `shifts` |
| `POST /api/admin/schedule-blocks` | Admin | Khoá ngày (`shiftCode` null) hoặc khoá một ca; không khoá được ngày đã qua |
| `POST /api/admin/schedule-blocks/{id}/remove` | Admin | Gỡ khoá, kể cả khoá của ngày đã qua |

## 6. Mã lỗi và lý do mới

| Mã | Ở đâu | Nghĩa |
|---|---|---|
| `ROUTE_STOP_TOO_CLOSE` | 409 khi lưu tuyến | Điểm bắt đầu, điểm kết thúc hoặc hai điểm dừng liền nhau gần nhau dưới `MinStopSeparationMeters` |
| `ROUTE_TOO_LONG_FOR_SHIFT` | 409 khi lưu tuyến hoặc tạo Tour; lý do ở danh sách ca | Tuyến không vừa thời lượng tối đa của ca |
| `SHIFT_BLOCKED` | 409 khi tạo Tour; lý do ở danh sách ca | Admin đã khoá ca hoặc ngày đó |
| `SHIFT_HAS_TOURS` | 409 khi Admin khoá | Ca hoặc ngày đó đang có Tour chưa huỷ |
| `TOUR_SLOT_NOT_ALLOWED` | 409 khi tạo Tour (mã đã có) | Nay nghĩa là giờ gửi lên không phải giờ bắt đầu Tour của ca nào |
| `SCHEDULE_BLOCK_EXISTS` | 409 khi Admin khoá | Khoá trùng, hoặc vừa khoá cả ngày vừa khoá ca lẻ |
| `SCHEDULE_BLOCK_ALREADY_REMOVED` | 409 khi Admin gỡ khoá | Khoá này đã được gỡ trước đó |
| Lỗi validation, message "Không khoá được ngày đã qua." | 400 khi Admin khoá | Ngày khoá trước hôm nay, tính theo giờ Việt Nam |

Bỏ lý do `OUTSIDE_START_HOURS`. Với Tour mới, `ROUTE_TOO_LONG_FOR_GAP` không còn xuất hiện vì giữ robot trọn ca,
trùng với khung giữ của Tour cũ thì báo `RESERVATION_OVERLAP`.

Số điểm dừng thiếu và thời gian dừng ngoài 15–300 giây là lỗi validation (400), giống các lỗi nhập liệu hiện có.

## 7. Cấu hình

```json
"Tours": {
  "Shifts": [
    { "Code": "S1", "Name": "Ca sáng",    "Start": "08:00", "End": "10:00" },
    { "Code": "S4", "Name": "Ca trưa",    "Start": "11:00", "End": "12:00" },
    { "Code": "S2", "Name": "Ca chiều 1", "Start": "13:00", "End": "15:00" },
    { "Code": "S3", "Name": "Ca chiều 2", "Start": "16:00", "End": "18:00" },
    { "Code": "S5", "Name": "Ca tối",     "Start": "19:00", "End": "21:00" }
  ],
  "RecommendedMaxMinutes": 60
},
"Routes": {
  "MinStops": 2,
  "MinStopSeparationMeters": 1.0
}
```

Khi khởi động, server từ chối chạy nếu: không có ca nào, trùng mã ca, `Start` ≥ `End`, hai ca chồng nhau,
ca ngắn hơn 31 phút, `RecommendedMaxMinutes` ≤ 0, `MinStops` ngoài 1..100, hoặc `MinStopSeparationMeters` ≤ 0.
Giờ đọc theo giờ Việt Nam (+07:00), giống cách đang làm. Bỏ hẳn các khoá `StartSlots`, `CustomStartEarliest`
và `CustomStartLatest`.

## 8. Không đổi

Tạo trước 72 giờ, đóng đăng ký trước 48 giờ, công thức thời lượng, khoá theo từng robot khi tạo Tour, các trạng thái
Tour và điều kiện READY, chốt/mở lại/huỷ, luồng đăng ký của đại diện trường (tối đa 10 dòng mỗi đăng ký).

## 9. Để sau, không làm trong đợt này

- Tách loại POI thành "điểm tham quan" và "điểm đón/trả", để hai bước chọn tách hẳn nhau.
- Gộp bước Điểm dừng với bước Bắt đầu/Kết thúc thành một bước "Lộ trình" có kéo thả.
- Màn hình cho Admin sửa danh sách ca.
- Giới hạn số đoàn mỗi ca.
- Tự báo Staff khi tới hạn đóng đăng ký mà Tour chưa có đoàn nào.
- Cảnh báo Operator khi Tour đang chạy đã quá giờ dự kiến.

## 10. Trạng thái triển khai

Cập nhật sau mỗi phần: đã làm gì, kiểm tra bằng gì, chỗ nào lệch so với file này và vì sao.

| Phần | Nội dung | Trạng thái | Ghi chú |
|---|---|---|---|
| A | Quy tắc tuyến (mục 2, trừ dòng tổng thời gian dừng) | Xong, chờ xác nhận (06/11/2026) | Xem "Phần A" bên dưới |
| B | Ca cố định và giới hạn thời lượng (mục 3, 4, cùng dòng tổng thời gian dừng ở mục 2) | Xong, chờ xác nhận (07/11/2026) | Xem "Phần B" bên dưới |
| C | Admin khoá ngày/ca (mục 5) | Xong, chờ xác nhận (07/11/2026) | Xem "Phần C" bên dưới |

### Phần A: quy tắc tuyến

**Đã làm**
- Backend: `RouteRuleSettings` (`Routes:MinStops` mặc định 2, `Routes:MinStopSeparationMeters` mặc định 1.0) được đăng ký
  giống `MapPoiSettings`. Giá trị sai (MinStops ngoài 1..100, khoảng cách ≤ 0) thì ném lỗi khi dựng settings.
  `RouteRevisionDraftValidator` kiểm số điểm dừng ≥ MinStops và thời gian dừng 15–300 giây (400). Handler lưu tuyến,
  sau khi tải bằng chứng POI, kiểm khoảng cách X/Y: điểm bắt đầu với mọi điểm dừng, hai điểm dừng liền nhau, và kết thúc
  `POSE` với điểm dừng cuối. Vi phạm thì trả 409 `ROUTE_STOP_TOO_CLOSE`, message tiếng Việt có tên POI. Kết thúc `POSE`
  có X/Y trùng điểm bắt đầu ("Quay về điểm bắt đầu") được bỏ qua.
- `GET /api/maps/versions` và `GET /api/maps/versions/{id}` thêm `routeMinStops` và `routeMinStopSeparationMeters`,
  đi kèm phiên bản bản đồ như `poiClearanceMeters`.
- Web, form tuyến: điều kiện bước 2 lấy số điểm dừng tối thiểu từ bản đồ, thời gian dừng 15–300 (ô nhập cũng min/max
  như vậy), báo khi hai điểm dừng liền nhau quá gần. Ở bước 3, POI đang là điểm dừng bị làm mờ, kèm chữ "(đang là điểm
  dừng)". Pose quá gần một điểm dừng thì báo lỗi tại chỗ, có tên điểm dừng, và chặn nút Tiếp. Bước 4 hiện lộ trình
  `Bắt đầu → 1. … → Kết thúc`, tổng thời gian dừng và dòng "Thời lượng thật chốt sau khi Kỹ thuật chạy thử". Lỗi 409
  `ROUTE_STOP_TOO_CLOSE` hiện message của server, có câu dự phòng nếu server không gửi message.

**Kiểm tra**
- `scripts/verify web`: PASS (738 test).
- `scripts/verify backend`: chạy trên bản sao `backend/` không kèm `global.json`, vì máy chỉ có SDK 10.0.401. Có chạy
  cả test SQL trên SQL Express ở máy local. Unit 463/463 qua. Integration 470/471: test hỏng duy nhất là
  `ApiDocumentationEndpointTests.Production_ServesDocumentationOnlyWithItsCredential` ("Missing summary: get
  /api/account/me"). Lỗi này có sẵn trên `origin/main`, vì `AccountController` mới chưa có mục trong
  `ApiOperationDocumentation`, và không liên quan đến phần A. Theo xác nhận của chủ dự án, đã bổ sung tài liệu cho 7
  endpoint còn thiếu (`AccountController` Get/Update/ChangePassword, `AdminAccountsController.Update`,
  `FleetHeadController.Poll`, `StaffToursController` QueueHeadCommand/GetHeadStatus), commit riêng cùng bản sửa
  `StaffShell.tsx` ở dưới. Sau bản sửa này, `scripts/verify backend` exit 0 (unit 463/463, integration 471/471).
  Các test route/tour SQL liên quan (`SchemaV11Tests`, `PoiImportSqlTests`, `RobotIntegritySqlTests`,
  `BusinessFlowIntegrationTests`, `Tour*SqlTests`, `FleetCommandsHttpTests`) đều qua.
- Test mới: `RouteStopSeparationTests` (0.5 m bị từ chối, đúng 1.0 m được nhận, điểm dừng liền nhau quá gần, kết thúc
  gần điểm dừng cuối, quay về điểm bắt đầu, khoảng cách lấy từ cấu hình); `RouteRevisionWorkflowTests` (1 điểm dừng bị
  từ chối, thời gian dừng 14/301 bị từ chối, 15/300 được nhận, cấu hình sai bị từ chối); test SQL
  `ARevisionSavedBeforeTheStopRules_IsStillReadAndScheduled` (phiên bản cũ 1 điểm dừng, dừng 3600 giây vẫn đọc được và
  vẫn tạo được Tour); test HTTP trong `BusinessFlowIntegrationTests` (409 `ROUTE_STOP_TOO_CLOSE`, map trả hai giá trị
  cấu hình); test web cho picker làm mờ điểm dừng, lỗi tại chỗ có tên điểm dừng, số điểm dừng tối thiểu, biên thời
  gian dừng và lộ trình ở bước Xem lại.
- Các fixture đang dùng 1 điểm dừng được nâng lên 2, giữ nguyên mục đích test: `SchemaV11Tests`, `PoiImportSqlTests`,
  `RobotIntegritySqlTests`, `BusinessFlowIntegrationTests`, harness của `TourReadySqlTests` (cũng là harness của các test
  chạy Tour), `RouteMapEligibilityTests`, `route-management.test.tsx`. Không xoá test nào. Hai test chạy Tour
  (`Next_AtTheLastPoi_...`, `ARobotNeedingInspection_...`) giả định điểm dừng đầu là điểm dừng cuối, nên nay đi thêm một
  chặng tới điểm dừng thứ hai; số lệnh robot kỳ vọng tăng từ 1 lên 2, tức mỗi điểm dừng một lệnh. Một số fixture có điểm
  bắt đầu trùng đúng vị trí POI, nên đã dời điểm bắt đầu. Trong `PoiImportSqlTests`, điểm bắt đầu của case "pose mới sát
  tường" được dời sang (0.4, 1.25), vì vị trí cũ chỉ cách POI 0.05 m và nay bị chặn bởi `ROUTE_STOP_TOO_CLOSE` trước khi
  tới bước kiểm vật cản.

**Lệch so với file này hoặc tài liệu khác**
- Thứ tự kiểm trong handler: khoảng cách điểm dừng được kiểm trước khoảng trống quanh pose (ADR-0040), ngay sau khi tải
  bằng chứng POI.
- 15 và 300 giây là hằng số ở cả server lẫn web, không phải cấu hình, vì mục 7 không có khoá cho hai giá trị này. Số điểm
  dừng tối thiểu và khoảng cách tối thiểu thì web đọc từ bản đồ. Nếu bản đồ không trả hai giá trị này (API cũ), web không
  tự kiểm mà để server quyết.
- Phần "Thêm message cho mã lỗi mới": form tuyến hiện dùng message do server trả, không có bảng mã lỗi riêng. Vì vậy
  `ROUTE_STOP_TOO_CLOSE` chỉ có câu dự phòng phía web.
- Root `AGENTS.md` và `backend/AGENTS.md` yêu cầu ghi thay đổi hợp đồng API (trường mới của map version, mã 409 mới) vào
  `docs/architecture.md`. Theo chỉ đạo đợt này, chưa sửa file đó; file này là nơi ghi duy nhất.
- `web/AGENTS.md` và ADR-0036 còn mô tả "slot hoặc giờ gõ tay". Phần B sẽ thay hành vi này, không sửa các tài liệu đó.
- `origin/main` (c09f267) không typecheck được vì `web/src/features/staff/StaffShell.tsx` có hai dòng import trùng do
  merge ở 7265e13. Đã gộp lại thành một dòng để `scripts/verify web` chạy được. Thay đổi này không thuộc phần A, nên sẽ
  commit riêng.
- Branch `feature/schedule-shifts` tạo từ `origin/main`, vì `main` ở máy cũ hơn origin. Làm trong worktree
  `.claude/worktrees/schedule-shifts` để không đụng các file chưa commit ở checkout chính.

### Phần B: ca cố định và giới hạn thời lượng

**Đã làm**
- Backend: `TourScheduleSettings` nay gồm danh sách ca (`Tours:Shifts`: Code, Name, Start, End) và
  `Tours:RecommendedMaxMinutes` (mặc định 60). Server từ chối khởi tạo settings nếu: không có ca, trùng mã, giờ sai
  dạng `HH:mm`, `Start` ≥ `End`, hai ca chồng nhau, ca ngắn hơn 31 phút, hoặc mức khuyến nghị ≤ 0. Đã bỏ `StartSlots`,
  `CustomStartEarliest`, `CustomStartLatest` khỏi settings, `appsettings.json` và DI.
- `TourSchedule`: giờ bắt đầu Tour của ca (đầu ca + 15'), khung giữ của ca (cả ca), thời lượng tối đa (độ dài ca − 30'),
  `FindShift`/`RequireShift` (409 `TOUR_SLOT_NOT_ALLOWED`, message liệt kê giờ bắt đầu từng ca). Thứ tự trong
  `Evaluate`: lead time → cần đo lại → `ROUTE_TOO_LONG_FOR_SHIFT` → trùng bất kỳ khung giữ nào trong ca
  (`RESERVATION_OVERLAP`, có tên Tour). `EnsureUsable` trả `ROUTE_TOO_LONG_FOR_SHIFT` với cùng mã. Đã bỏ `StartRule`,
  `Window`, `OUTSIDE_START_HOURS` và `ROUTE_TOO_LONG_FOR_GAP`.
- Tạo Tour: `TourRobotReservation.StartsAt/EndsAt` = khung của ca. Khoá theo robot và kiểm lại trên đồng hồ mới sau
  khi lấy khoá giữ nguyên.
- `GET /api/staff/manage/tours/slots`: bỏ tham số `time` và hai trường `customStart*`. Mỗi ngày có một mục cho mỗi ca;
  các trường cũ giữ tên, thêm `shiftCode`, `shiftName`, `maxDurationSeconds`, và `recommendedMaxSeconds` ở cấp response.
- Thêm `GET /api/staff/manage/tours/shifts?from=&to=` (role Staff, tối đa 31 ngày), trả các ca đã cấu hình của từng ngày.
- Lưu tuyến: tổng thời gian dừng vượt thời lượng tối đa của ca dài nhất thì trả 409 `ROUTE_TOO_LONG_FOR_SHIFT`.
- `RouteRevisionView` thêm `scheduleFit` (`UNKNOWN`/`FITS`/`OVER_RECOMMENDED`/`TOO_LONG_FOR_SHIFT`) và
  `expectedDurationSeconds`, tách khỏi `EligibilityIssues`. Thời lượng dự kiến lấy từ lần PASS hiệu lực đo theo
  `TOTAL_WITH_DWELL`, cộng phần dừng tăng thêm, đúng công thức đặt chỗ.
- Web: form tạo Tour chọn ngày rồi chọn ca dạng nút "Ca sáng · 08:15-09:45 · Giữ robot 08:00-10:00". Ca không dùng được
  thì disable kèm lý do. Phần xem lại hiện thời lượng dự kiến, thời lượng tối đa của ca, và cảnh báo vàng khi vượt mức
  khuyến nghị. Tuyến `TOO_LONG_FOR_SHIFT` bị disable trong danh sách chọn tuyến. Form đọc `?date=&shift=`. Đã bỏ nút
  "Giờ khác", ô gõ giờ và `OUTSIDE_START_HOURS`; thêm câu báo cho `ROUTE_TOO_LONG_FOR_SHIFT`.
- Danh mục tuyến và trang chi tiết: nhãn đỏ "Quá dài cho 1 ca", nhãn vàng "Dài hơn mức khuyến nghị". Trang chi tiết bỏ
  nút "Tạo Tour" khi tuyến quá dài.
- Trang Lịch Tour, chế độ Tuần và Ngày: vẽ dải nền cho từng ca lấy từ endpoint `shifts`. Ca còn trống (không có Tour
  chưa huỷ giữ robot trong ca) và chưa qua hạn 72 giờ thì có "+ Tạo Tour" dẫn tới
  `/staff/manage/tours/new?date=…&shift=…`. Tour nằm ngoài 07:00–19:00 hiện ở dải "Ngoài ca" đầu cột ngày (chế độ Tuần)
  hoặc đầu trang ngày (chế độ Ngày), không vẽ tràn xuống dưới lưới. Chế độ Danh sách giữ nguyên.

**Kiểm tra**
- `scripts/verify web`: PASS (743 test).
- `scripts/verify backend`: exit 0 (unit 472/472, integration 471/471, có chạy test SQL trên SQL Express ở máy local; chạy
  trên bản sao không kèm `global.json`, như phần A).
- Unit: `TourScheduleTests` viết lại theo ca: đúng giờ ca được nhận, lệch 1 phút bị từ chối; ca 2 tiếng chứa 5400 giây
  (5400 được nhận, 5401 bị từ chối); vượt khuyến nghị vẫn tạo được; khung giữ cũ ở giờ lẻ báo `RESERVATION_OVERLAP`;
  khung giữ mới bằng đúng ca; kiểm tra cấu hình lúc khởi tạo; phân loại `scheduleFit`; endpoint `shifts`.
  `RouteStopSeparationTests`: 18 × 300 giây được nhận, 19 × 300 giây bị 409.
- SQL/HTTP: `SchemaV11Tests` (phần lịch viết lại theo ca: một Tour mỗi robot mỗi ca, khung giữ cả ca, giờ lẻ và lệch 1 phút
  bị từ chối, khung giữ cũ ở giờ lẻ chặn ca nó lấn vào, PASS dài quá ca vẫn là PASS nhưng không xếp lịch được, vượt khuyến
  nghị vẫn tạo được, `scheduleFit` ở chi tiết/danh mục/kết quả chạy thử); `BusinessFlowIntegrationTests` (dạng response mới
  của slots và shifts, Technical bị 403 ở `shifts`, 409 `TOUR_SLOT_NOT_ALLOWED` qua HTTP).
- Web: form tạo theo ca, chọn sẵn từ query, cảnh báo vượt khuyến nghị, tuyến quá dài bị disable; lịch có dải ca,
  "+ Tạo Tour" chỉ ở ca trống, dải "Ngoài ca"; nhãn ở danh mục và chi tiết tuyến.
- Các fixture đang tạo Tour lúc 09:00 được đổi sang 08:15 (giờ bắt đầu của ca sáng), và cấu hình test đổi từ
  `StartSlots`/`CustomStart*` sang `Tours:Shifts`. Mục đích của các test này giữ nguyên.

**Lệch so với file này hoặc tài liệu khác**
- Nhãn vàng ghi "Dài hơn mức khuyến nghị", không ghi cứng "60 phút", vì danh mục tuyến không nhận giá trị cấu hình. Chi
  tiết thời lượng dự kiến nằm ở tooltip. Form tạo Tour thì có `recommendedMaxSeconds` nên ghi đúng số phút.
- `ScheduleFit` được tính ở chi tiết tuyến, danh mục tuyến, lưu tuyến và ghi kết quả chạy thử. Các chỗ đọc khác (hàng đợi
  kiểm chứng, chi tiết Tour, kiểm tra READY) trả `UNKNOWN`, vì không hiển thị nhãn này. Chặn xếp lịch không dựa vào
  trường này mà dựa vào `Evaluate`.
- `TOUR_SLOT_NOT_ALLOWED` được kiểm trước khi tìm robot, nên một yêu cầu vừa sai giờ vừa sai robot nay trả 409 thay vì 404.
- "Ca còn trống" trên trang Lịch là ca chưa có Tour chưa huỷ nào giữ robot, tính trên mọi robot. Khi có nhiều robot, ca
  có thể vẫn tạo được cho robot khác. Form tạo Tour mới là nơi quyết định theo từng robot.
- `backend/docs/admin-tour-management.md`, ADR-0035, ADR-0036 và `web/AGENTS.md` vẫn mô tả slot và giờ gõ tay. Theo chỉ đạo
  đợt này, các file đó chưa được sửa.

### Phần C: Admin khoá ngày/ca

**Đã làm**
- DB: schema v1.16 (`backend/database/smart-campus-tour-schema-v1.16.sql`) và patch
  `backend/database/patches/upgrade-v1.15-to-v1.16-schedule-blocks.sql`. Bảng `TourScheduleBlocks` có đủ các cột theo yêu
  cầu. Index lọc `UX_TourScheduleBlocks_Active` đảm bảo mỗi ngày/ca có tối đa một khoá đang hiệu lực. Runtime chỉ được
  SELECT, INSERT và UPDATE hai cột `RemovedAt`, `RemovedByUserId`; không sửa được lý do, không xoá được dòng.
- Nâng phiên bản theo đúng cách bản v1.14 → v1.15: `bootstrap-check`, `init-db.sh` (có thêm bước kiểm quyền trên bảng mới),
  `upgrade-db.sh` (mọi đường nâng cấp đều chạy thêm patch mới), `upgrade-db-schema-ec2.sh`, `deploy-ec2.sh`,
  `validate-release-manifest.py`, `Dockerfile.db-init`, hai workflow trong `.github/workflows/` (chỉ đổi số phiên bản, không
  bỏ bước kiểm tra nào), các script test deploy và `test-db-upgrade` (thêm ca 12: nâng từ v1.15).
- Backend: `GET /api/admin/schedule-blocks?from=&to=` (cùng dạng với `shifts`), `POST /api/admin/schedule-blocks`
  (`requestId`, `date`, `shiftCode`, `reason`; `shiftCode` null là khoá cả ngày), `POST /api/admin/schedule-blocks/{id}/remove`
  (`requestId`). Chỉ role Admin. Ghi audit `SCHEDULE_BLOCK_CREATED` và `SCHEDULE_BLOCK_REMOVED`; dòng audit đồng thời là
  biên nhận chống gửi trùng, giống Tour.
- Khoá vào ngày hoặc ca đang có Tour chưa huỷ: 409 `SHIFT_HAS_TOURS`, `errors.blockers` liệt kê từng Tour.
- Không có race giữa tạo Tour và tạo khoá: cả hai lấy cùng một khoá `sp_getapplock` theo ngày (`tour-schedule-date:<ngày>`).
- Danh sách ca trống và tạo Tour: ca bị khoá trả `SHIFT_BLOCKED` kèm lý do, nằm sau `ROUTE_TOO_LONG_FOR_SHIFT` và trước
  `RESERVATION_OVERLAP`, đúng thứ tự mục B. Endpoint `shifts` của Staff có thêm `block` (`id`, `scope`, `reason`).
- Web Admin: trang "Lịch vận hành" (`/admin/schedule-blocks`) trong menu Admin. Hiện từng ngày theo từng ca, có nút khoá ca,
  khoá ngày, gỡ khoá; nhập lý do trong hộp thoại; lỗi `SHIFT_HAS_TOURS` hiện tên các Tour. Nhật ký hệ thống có nhãn cho hai
  hành động mới.
- Web Staff: trên Lịch Tour, ca bị khoá là dải xám kèm lý do, không có "+ Tạo Tour".

**Kiểm tra**
- `scripts/verify web`: PASS (749 test). `scripts/verify backend`: exit 0 (unit 474/474, integration 481/481, có chạy test SQL;
  chạy trên bản sao không kèm `global.json`). `scripts/verify digital-twin`: PASS.
- `scripts/verify robot` và `scripts/verify ai-assistant` không qua trên máy này vì thiếu môi trường, nên `scripts/verify` đầy đủ
  chưa exit 0 ở đây. Đợt này không sửa hai thư mục đó. Xem báo cáo phần C.
- Test `HeadControl_TheOperatorOfARunningTour_...` hỏng một lần (`HEAD_ROBOT_NOT_CONNECTED`) khi máy đang chạy tsc và vitest
  song song, và qua ở lần chạy verify đủ sau đó. Đã tìm ra nguyên nhân và sửa: xem "Dọn sau review (07/11/2026)".
- Test mới: `ScheduleBlockSqlTests` (khoá ca đang có Tour bị từ chối và nêu tên Tour, Tour đã huỷ không chặn, tạo Tour vào
  ca bị khoá, gỡ khoá xong tạo được, audit, khoá trùng, ngày và ca lẻ loại trừ nhau, gửi trùng `requestId`, đầu vào sai,
  đua giữa tạo Tour và tạo khoá qua 5 vòng); `SchemaV11Tests` (patch khớp snapshot, chạy lại được, từ chối phiên bản khác,
  ràng buộc bảng, quyền runtime); `DeploymentDatabaseTests` (bootstrap v1.16, v1.15 cần nâng cấp);
  `BusinessFlowIntegrationTests` (Staff và Technical bị 403, `SHIFT_HAS_TOURS` và `SHIFT_BLOCKED` qua HTTP);
  `AdminSchedulePage.test.tsx`, `SchedulePage.test.tsx`.
- **Chưa chạy được:** `backend/scripts/test-db-upgrade` và `backend/scripts/test-deployment` cần Docker, mà Docker không chạy
  trên máy này. Hai script đã được cập nhật và qua `bash -n`; CI sẽ chạy thật. Patch thì đã được chạy trên SQL Express qua
  `SchemaV11Tests`.

**Lệch so với file này hoặc tài liệu khác**
- Quy tắc "không vừa khoá cả ngày vừa khoá ca lẻ" được kiểm trong ứng dụng dưới khoá ngày, trả 409 `SCHEDULE_BLOCK_EXISTS`;
  SQL không có ràng buộc riêng cho quy tắc này. Mã này và `SCHEDULE_BLOCK_ALREADY_REMOVED` là hai mã mới, nay đã có trong mục 6.
- Entity `TourScheduleBlock` và mapping EF được viết tay theo đúng dạng scaffold, không chạy `scaffold-db`. Test SQL đọc và
  ghi bảng này đều qua.
- `AGENTS.md` yêu cầu ADR cho thay đổi schema và ghi hợp đồng API vào `docs/architecture.md`. Theo chỉ đạo đợt này, không có
  ADR. `docs/architecture.md` đã được sửa ở lần dọn 07/11/2026; `backend/database/README.md` và
  `backend/docs/ec2-deployment.md` vẫn chưa sửa.
- **Khi triển khai:** `deploy-ec2.sh` nay yêu cầu schema 1.16. `backend/deploy/receive-release.sh` ở chế độ `application`
  gọi `upgrade-db-schema-ec2.sh --if-needed` trước khi deploy API, nên không cần chạy nâng cấp riêng: script kiểm tra chỉ đọc,
  nếu database chưa nhận DB tool v1.16 thì tạo backup đã kiểm chứng rồi nâng cấp. Thiếu chương trình hoặc cấu hình backup thì
  delivery dừng với lỗi. Có deployment đang chờ khôi phục thì script bỏ qua bước nâng cấp.

### Dọn sau review (07/11/2026)

**Đã làm**
- Tài liệu cũ: bỏ các mô tả sai về khung 30 phút và giờ tuỳ chọn, trỏ về file này. Không tạo ADR mới, không sửa SRS.
- Mục 5 và mục 6 của file này: thêm bảng API và các mã lỗi còn thiếu; sửa lại đoạn "Khi triển khai" theo script thật.
- Không khoá được ngày đã qua: `POST /api/admin/schedule-blocks` trả 400 "Không khoá được ngày đã qua.", tính theo ngày ở
  campus. Hôm nay vẫn khoá được, gỡ khoá cũ vẫn được. Web hiện "Đã qua", không có nút khoá, vẫn hiện khoá cũ kèm lý do.
- Sửa hai test không ổn định. Cả hai là lỗi của test, code chạy thật không đổi:
  - `HeadControl_TheOperatorOfARunningTour_...`: test gửi lệnh sau một khoảng chờ cố định 300 ms, có thể trước khi poll của robot
    tới server, và khi đó `HEAD_ROBOT_NOT_CONNECTED` là câu trả lời đúng. Nay test chờ `connected` rồi mới gửi. Khi đổi 300 ms
    thành 0 ms, bản cũ hỏng 3/3 lần với đúng mã này.
  - `ConcurrentDecisionsAndRepresentativeEdits_...`: lỗi này lộ ra khi chạy verify đợt này, không nằm trong danh sách việc.
    Khi Representative thắng cuộc đua, audit ghi theo id của đăng ký, còn test tìm theo id của dòng. Nay test kiểm đúng audit của bên
    thắng và kiểm bên thua không ghi audit.

**Kiểm tra**
- `scripts/verify web`: exit 0 (745 test).
- `scripts/verify backend`: exit 0 (unit 480/480, integration 238/238, SQL 248/248), chạy trong WSL trên bản sao không kèm
  `global.json`, có `SMARTCAMPUS_REQUIRE_SQL_TESTS=true`.
- Test head-control: trước khi sửa 0/20 lần lỗi khi tải bình thường, và 3/10 lần lỗi khi có tải rất nặng; 2 trong 3 lần đó là lỗi mở
  kết nối SQL, lần còn lại không ghi được chi tiết. Sau khi sửa 0/20 khi tải bình thường và 0/20 với 20 tiến trình chiếm CPU trên 20 lõi.
  Mức tải của hai lần đo có tải khác nhau (40 và 20 tiến trình).
- Test đăng ký: trước khi sửa 2/10 lần lỗi, ép Representative thắng thì hỏng đúng assert đó. Sau khi sửa ép thứ tự đó vẫn qua, và 0/15
  lần lỗi với cuộc đua thật.

**Chưa chạy được:** `scripts/verify robot`, `scripts/verify ai-assistant` (thiếu môi trường trên máy này; đợt này không sửa hai thư
mục đó), `backend/scripts/test-db-upgrade` và `backend/scripts/test-deployment` (cần Docker).

## 11. Tự huỷ Tour quá giờ

Nguồn: SRS v0.2 BR-24, UC-TOUR-07, BR-27, FR-40, AC-19; quyết định kỹ thuật ở ADR-0047.

- **Khi nào:** Start chỉ được nhận trong [T−10', T+15'] (`TourStartPreflight`, `FleetCommands:StartLateLimitMinutes`; mốc sớm theo ADR-0050). Tour còn
  `SCHEDULED`/`READY`, chưa có dấu vết vận hành (cùng điều kiện Staff Cancel dùng), đến hết khung giữ robot thì hệ thống tự huỷ.
  Hết khung giữ là `EndsAt` của reservation đang hiệu lực; Tour không có reservation thì là T+15'. Mốc này không bao giờ sớm
  hơn T+15', nên hệ thống không lấy mất Tour mà Staff còn Start được.
- **Ai chạy:** `TourAutoCancelWorker` ở Api, mỗi 60 giây. Nó liệt kê Tour quá hạn rồi gửi một command cho mỗi Tour, mỗi Tour một
  transaction. Không gửi lệnh nào cho robot; Tour `RUNNING`, `COMPLETED`, `CANCELLED` không bị đụng tới.
- **Làm gì:** đúng phần lõi của Staff Cancel: huỷ đơn đang chờ duyệt, thu hồi lời mời, đóng phiên xem, nhả reservation, xếp
  email thông báo huỷ cho đoàn `SUBMITTED`/`APPROVED`. `EndReason` là "Không bắt đầu trong khung giờ, hệ thống tự huỷ."
- **Không có người thao tác:** các audit ghi `ActorUserId = NULL`; receipt `TOUR_CANCELLED` có ResultCode `SYSTEM_NO_START`.
  Reservation được nhả với `ReleasedByUserId = NULL`: schema v1.17 đổi CHECK thành `CK_TourRobotReservations_Release_Actor`
  để cho phép việc này.
- **Đua với Staff:** command lấy khoá Tour giống Start và Cancel rồi mới kiểm lại điều kiện. Bên tới sau thấy kết quả của bên
  trước: Staff Cancel tới sau nhận 409, job tới sau bỏ qua. Chạy lại không huỷ hai lần và không xếp email hai lần.
- **Tồn đọng:** Tour hết khung giữ hơn 24 giờ trước lượt chạy vẫn bị huỷ nhưng không xếp email; receipt ghi
  `notice = SKIPPED_BACKLOG` và worker ghi số lượng vào log.
- **Web:** Lịch Tour (thẻ Tour, popup chi tiết) và trang chi tiết Tour hiện "Quá giờ bắt đầu · tự huỷ lúc HH:mm" cho Tour
  `SCHEDULED`/`READY` đã quá T+15'. Nhãn chỉ để hiển thị, quyết định do server.
- **Khi triển khai:** cần nâng cấp database lên v1.17 (patch `upgrade-v1.16-to-v1.17-system-reservation-release.sql`) trước hoặc
  cùng API này, theo đường nâng cấp có backup như v1.16.

## 12. Tour nhanh (ADR-0053, 09/11/2026)

Tour nhanh dùng cho buổi trình diễn hoặc đoàn khách đột xuất. Nó **không theo ca**; mọi quy tắc của Tour theo ca ở các
mục trên giữ nguyên.

- **Tạo:** cùng form và cùng API tạo Tour (`POST /api/staff/manage/tours`), chỉ bớt ràng buộc: chọn loại "Tour nhanh", chọn
  tuyến đã chạy thử đạt, robot, người vận hành, sức chứa và ghi **lý do** (bắt buộc, gửi `shortNoticeReason`). Không chọn ngày,
  không chọn ca (`scheduledStartAt` để trống), không cần báo trước 72 giờ. Robot đang bận thì tạo báo lỗi kèm lý do.
- **Hạn Start:** lúc tạo + `Tours:ShortNoticeMinLeadMinutes`, làm tròn lên phút. Mặc định 30 phút (đúng giá trị đã có trong
  `appsettings.json`); không còn công tắc bật/tắt. Hạn Start cũng là giờ ghi cho người xem.
- **Giữ robot:** từ lúc tạo đến hạn Start + thời lượng tuyến + 15 phút. Vẫn kiểm tra trùng khung giữ robot của mọi Tour khác
  (kể cả Tour theo ca), và bị từ chối nếu khung giữ chạm vào ngày hoặc ca Admin đã khoá. Tuyến không được dài hơn ca dài nhất.
- **Luồng:** tạo → (đại diện trường đăng ký, Staff duyệt nếu có người xem) → chốt READY → **Start ngay**, không chờ tới giờ.
  Từ ADR-0057, Start không cần chờ đủ điểm xem vào phòng chờ: màn hình chỉ cảnh báo số điểm xem đã vào (X/Y), và sự kiện
  `EARLY_START` ghi lại con số đó. Mọi kiểm tra an toàn robot giữ nguyên.
- **Đăng ký:** như Tour ngắn hạn của ADR-0050: không có mốc 48 giờ và 24 giờ; đăng ký đóng khi Staff chốt READY, muộn nhất
  là hạn Start; job T−24h bỏ qua Tour này.
- **Quá hạn:** chưa Start tới hạn Start + 15 phút thì hệ thống tự huỷ như mục 11 và trả robot.
- **Web:** không có tab hay trang riêng. Trong Lịch Tour, Tour nhanh hiện ở giờ hạn Start với nhãn "Nhanh" (thường ở dòng
  "Ngoài ca"), và ca bị nó giữ robot không nhận Tour mới. Danh sách và trang chi tiết ghi "Tour nhanh".
- **Bỏ:** cách "Tour ngắn hạn gắn vào ca" của ADR-0050 (`shortNotice` trên `/slots`, `shortNoticeReason` khi tạo Tour theo ca).
- **Để sau:** email mời vẫn ghi một giờ cố định (với Tour nhanh là hạn Start); Staff tự thêm người xem cho Tour nhanh cần quyết
  định riêng.
