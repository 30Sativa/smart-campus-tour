# Đồng bộ SRS sau đợt sửa 09–11/11/2026

Gửi người làm SRS v0.2. File này tóm tắt những gì code đã đổi so với SRS từ sau `docs/dong-bo-srs-2026-11-08.md`, các mã lỗi và endpoint mới, các câu đề xuất sửa SRS, và các điểm cần người làm SRS xác nhận.

**Phạm vi.** Nội dung mô tả `main` sau các pull request #228 đến #270 và đợt sửa sau review 11/11/2026. Schema mới nhất là v1.20 (v1.19 thêm `Tours.IsShortNotice`, v1.20 thêm cột huỷ đề xuất POI). Tour nhanh, READY cần dòng đã duyệt, đầu camera theo POI và camera bật khi cần không đổi schema.

| Nội dung | Quyết định | Pull request |
|---|---|---|
| Start sớm trong ca, `allViewersJoined` | `docs/decisions/0050-early-start-and-short-notice-tours.md` (quyết định 1, 2) | #236 |
| Tour nhanh | `docs/decisions/0053-quick-tours.md` (thay quyết định 3–5 của ADR-0050) | #255, #256, #257, #258 |
| READY cần ít nhất một dòng đã duyệt | `docs/decisions/0054-ready-needs-an-accepted-row.md` | #262, #264, #266 |
| Ca S4, S5 | `docs/lich-tour-theo-ca.md` | #245, #249, #251 |
| Đầu camera theo POI, chế độ AUTO/MANUAL | `docs/decisions/0045-operator-head-control.md` (phụ lục 10/11/2026) | #265 |
| Camera chỉ bật khi cần | `docs/decisions/0052-quest-camera-on-demand.md` | #253, #254 |
| An toàn robot tại chỗ, bật điều phối robot | `docs/decisions/0049-m2-3-robot-local-safety.md` | #228, #230, #231, #232, #270 |
| Staff huỷ đề xuất POI chưa từng đạt | `docs/decisions/0051-staff-discard-never-passed-poi.md` | #237 |
| Thông báo cho Staff | `docs/architecture.md`, `GET /api/staff/notifications` | #259, #261, #263 |

Repo không chứa bản đầy đủ của SRS. Các mã BR/FR/UC dưới đây lấy từ ADR và `docs/requirements/srs-v02-backend-gap-register.md`, chưa đối chiếu lại với bản Google Docs.

## 1. Đã đổi so với SRS

### 1.1. Lịch, READY và Start

| Quy tắc | Hành vi hiện tại | Mã SRS |
|---|---|---|
| Start sớm | Start được nhận từ `FleetCommands:StartEarlyLimitMinutes` (mặc định 10 phút) trước giờ công bố, vẫn trong khung giữ robot của Tour. Trước giờ công bố, mọi dòng đã duyệt phải đang ở phòng chờ (`allViewersJoined`). Start sớm ghi `ReasonCode = EARLY_START` trên `TOUR_STARTED`. | FR-17, ADR-0009 cũ ("không có nút bỏ qua giờ công bố") |
| Giới hạn Start trễ | Start được nhận tới `StartLateLimitMinutes` (mặc định 15 phút) sau giờ công bố. Từ đợt này, máy chủ không khởi động nếu giới hạn sớm hoặc trễ lớn hơn 15 phút đệm giữ robot, để lượt chạy luôn nằm trong khung giữ. Quá giới hạn thì Tour tự huỷ (ADR-0047). | FR-17, ADR-0042 §7 |
| Tour nhanh | Staff tạo Tour không chọn ngày và ca, bắt buộc ghi lý do. Giờ công bố là hạn Start muộn nhất: lúc tạo cộng `Tours:ShortNoticeMinLeadMinutes` (mặc định 30 phút), làm tròn lên phút. Robot được giữ từ lúc tạo tới hạn Start + thời lượng tuyến + 15 phút, có kiểm tra trùng với mọi khung giữ khác và khoá của Admin. Start mở ngay khi Tour READY. | FR-12, FR-15, BR-06 |
| Tour nhanh bỏ qua mốc 72/48/24 giờ | Theo quyết định của owner trong ADR-0053: Tour nhanh không cần tạo trước 72 giờ, không có mốc đóng đăng ký 48 giờ và mốc hết hạn duyệt 24 giờ. Đăng ký đóng ở hạn Start hoặc khi Staff chốt READY; job T-24h bỏ qua Tour này. Dòng chưa duyệt vẫn chặn READY và Start. Tour thường giữ nguyên các mốc. | BR-03, BR-04, BR-05, FR-22, FR-23 |
| READY cần dòng đã duyệt | Tour chỉ READY khi có ít nhất một dòng còn hiệu lực ở trạng thái `ACCEPTED`. Một dòng phòng chiếu chung tính là một. Khi còn quyết định chờ Staff thì chỉ báo `PENDING_DECISIONS`, chưa báo `NO_ACCEPTED_ROWS`. Start kiểm tra lại (`hasAcceptedRows`). Tour nhanh không có ngoại lệ. | FR-16, BR-11 |
| Ca S4, S5 | Có năm ca: S1–S3 như cũ, thêm S4 "Ca trưa" 11:00–12:00 (Tour bắt đầu 11:15, chỉ nhận tuyến tối đa 30 phút) và S5 "Ca tối" 19:00–21:00 (Tour bắt đầu 19:15, kết thúc chậm nhất 20:45). | FR-15, BR-06 |

### 1.2. Robot và camera

| Quy tắc | Hành vi hiện tại | Mã SRS |
|---|---|---|
| Bật điều phối robot | Chỉ Technical Staff bật `IsDispatchEnabled` qua `POST /api/technical/physical-robots/{id}/dispatch`, phải kèm biên bản GATE A (`evidenceRef`), robot đang hoạt động, có khoá, có bản đồ, lần kiểm tra triển khai gần nhất đạt và không chờ kiểm tra. Tắt luôn được. Có audit `ROBOT_DISPATCH_CHANGED`. Chưa có biên bản GATE A nào, nên chưa robot nào được bật. | FR-17, FR-36, NFR-SAFE-03 |
| An toàn tại chỗ trên robot | Có quyền chạy (motion permit) và cổng chốt trong `mode_manager`, `localized`/`motionReady` thật, kiểm tra nội dung bản đồ, một nguồn gửi goal duy nhất, mất liên kết STM32 giữ trạng thái dừng. Nút dừng khẩn cấp phần cứng chưa nối vào phần mềm (bước 3.4). Mọi số liệu thời gian dừng vẫn là mục tiêu, chưa đo. | SRS §7, NFR-SAFE |
| Camera chỉ bật khi cần | Camera Quest chỉ chạy khi một Tour trên robot đó đang `RUNNING` hoặc một trang Staff đang giữ lease (120 giây, trang kiểm tra trước Start gia hạn mỗi 30 giây). Robot hỏi backend định kỳ. Mất backend quá 60 giây thì robot vẫn giữ camera chạy để không làm tối Tour đang chạy. Người xem tạm dừng được, tab ẩn thì ngừng kéo hình. | FR-25, FR-38, NFR-SEC-02 |
| Đầu camera theo POI | Mỗi bản POI chọn một hoạt động của đầu camera: Phía trước, Bên trái, Bên phải, Không tự xoay, Quét trái rồi phải (10–170 độ mỗi bên) hoặc Góc tùy chỉnh (PAN −170 đến 170, TILT −18 đến 18). Ở chế độ AUTO, backend gửi một lệnh đầu camera khi robot tới POI và đưa về giữa khi rời POI. Operator chuyển được sang MANUAL. Phần điều khiển đầu camera vẫn tắt bằng `FleetHead:Enabled = false` và ADR-0045 chưa được owner chấp nhận. | FR-49 |

### 1.3. Khác

| Quy tắc | Hành vi hiện tại | Mã SRS |
|---|---|---|
| Huỷ đề xuất POI | Staff huỷ mềm một đề xuất POI chưa từng có bản đạt kiểm chứng. Không xoá dữ liệu. Đề xuất đã có bản đạt thì không huỷ được. | FR-08 |
| Thông báo cho Staff | Staff xem danh sách kết quả kiểm chứng POI và chạy thử tuyến mới nhất của Technical Staff. | FR-40 (gần nhất), không có mã riêng |

## 2. Mã lỗi và endpoint mới

### 2.1. Endpoint mới

| Endpoint | Vai trò | Nội dung |
|---|---|---|
| `POST /api/technical/physical-robots/{id}/dispatch` | TechnicalStaff | Body `{requestId, expectedRowVersion, enabled, reason, evidenceRef}` |
| `POST /api/staff/manage/robots/{robotCode}/camera-lease` | Staff | Không body. Giữ camera bật thêm `FleetCamera:LeaseSeconds` |
| `POST /api/fleet/camera/v1/poll` | Robot | Trả `{wanted, reason, pollSeconds}` |
| `POST /api/staff/manage/tours/{id}/head-commands`, `PUT .../head-mode`, `GET .../head` | Staff (lệnh và chế độ chỉ Operator) | Đầu camera, tắt mặc định |
| `POST /api/fleet/head/v1/poll` | Robot | Long poll lệnh đầu camera, tắt mặc định |
| `POST /api/staff/poi-proposals/{id}/discard` | Staff | Body `{expectedRevisionNumber, expectedRowVersion}` |
| `GET /api/staff/notifications` | Staff | `size` 1–50 |

### 2.2. Thay đổi trên endpoint có sẵn

| Endpoint | Thay đổi |
|---|---|
| `POST /api/staff/manage/tours` | `scheduledStartAt` được để trống khi có `shortNoticeReason` (Tour nhanh) |
| `GET /api/staff/manage/tours/shifts` | Thêm `quickTourWaitMinutes` |
| `GET /api/staff/manage/tours/slots` | Bỏ tham số `shortNotice` và trường `shortNoticeMinLeadMinutes` |
| Phản hồi Tour | Thêm `isShortNotice` |
| `GET .../tours/{id}/start-checks` | Thêm kiểm tra `allViewersJoined`, `hasAcceptedRows` và trường `opensAt` |
| POI tạo, sửa, nháp | `cameraPreset` nhận thêm `NONE`, `SWEEP`, `SWEEP:deg`, `ANGLE:pan,tilt` |
| Danh sách robot vật lý, Dashboard Kỹ thuật, chẩn đoán robot | Thêm `isDispatchEnabled` |

### 2.3. Mã lỗi mới hoặc đổi

| HTTP | Mã | Khi nào |
|---|---|---|
| 409 | `READY_PRECONDITION_FAILED` với `NO_ACCEPTED_ROWS` | Chốt READY khi không có dòng nào đã duyệt và không còn quyết định chờ |
| 409 | `START_PRECONDITION_FAILED` với `allViewersJoined`, `hasAcceptedRows` | Start sớm khi còn người chưa vào phòng chờ, hoặc Tour không còn dòng đã duyệt |
| 422 | `POI_CAMERA_PRESET_INVALID` | Câu báo mới liệt kê đủ sáu loại hoạt động đầu camera |
| 409 | `ROBOT_DEACTIVATED`, `ROBOT_CREDENTIAL_REQUIRED`, `ROBOT_MAP_REQUIRED`, `ROBOT_DEPLOYMENT_CHECK_REQUIRED`, `ROBOT_NEEDS_INSPECTION` | Bật điều phối robot khi thiếu điều kiện |
| 409 | `HEAD_CONTROL_DISABLED`, `HEAD_ROBOT_NOT_CONNECTED` | Lệnh đầu camera khi tính năng tắt hoặc robot chưa nối |
| 409 | `POI_PROPOSAL_HAS_PASS`, `POI_PROPOSAL_DISCARDED` | Huỷ đề xuất đã có bản đạt, hoặc ghi vào đề xuất đã huỷ |
| — | `SHORT_NOTICE_DISABLED` | **Đã bỏ.** Tour nhanh luôn dùng được |

### 2.4. Cấu hình

- `FleetCommands:StartEarlyLimitMinutes` (10) và `FleetCommands:StartLateLimitMinutes` (15): mỗi giá trị từ 0 tới 15.
- `Tours:ShortNoticeMinLeadMinutes` (30): thời gian chờ của Tour nhanh.
- `FleetCamera:LeaseSeconds` (120).
- `TourSchedule:Shifts`: năm ca S1–S5.

## 3. Đề xuất sửa trong SRS

Repo không có văn bản gốc của SRS, nên các câu dưới đây viết dạng câu bổ sung. Người làm SRS đặt vào đúng chỗ và chỉnh theo cách viết của tài liệu.

**FR-17, Start sớm.**

> The Operator may start a READY Tour up to 10 minutes before its published time, but only when every accepted roster row holds a live session in the waiting room. From the published time this condition no longer applies. Start is refused more than 15 minutes after the published time. Neither limit may exceed the 15-minute robot reservation buffer.

**FR-12, BR-03/04/05, Tour nhanh.**

> Staff may create a quick Tour, with a required reason, for a group that is ready to start now. A quick Tour has no date or shift; its published time is its latest Start, set to the creation time plus the configured wait (30 minutes by default). The robot is held from creation until a run started at the latest Start would end, plus 15 minutes, and the hold must not overlap any other hold or Admin block. A quick Tour is exempt from the 72-hour lead time and from the 48-hour and 24-hour registration and review deadlines; registration closes at the latest Start or when Staff marks the Tour READY. All other READY and Start conditions apply.

**FR-16, READY cần dòng đã duyệt.**

> A Tour can be marked READY only when it has at least one active ACCEPTED roster row; a shared viewing point row counts as one. While a roster or email change decision is pending, only the pending decision is reported. Start rechecks that an accepted row still exists.

**FR-15, BR-06, ca.**

> Tours on a fixed schedule use five shifts: 08:00–10:00, 11:00–12:00 (routes of at most 30 minutes), 13:00–15:00, 16:00–18:00 and 19:00–21:00. Each Tour starts 15 minutes after its shift opens and must end 15 minutes before it closes; the robot is held for the whole shift.

**FR-25, FR-38, camera bật khi cần.**

> The robot camera captures only while a Tour on that robot is RUNNING or a Staff preview is open. If the robot cannot reach the server for more than 60 seconds, it keeps capturing so that a running Tour is not blacked out.

**FR-49, hoạt động của đầu camera ở mỗi POI.**

> Each POI revision defines one camera head action at arrival: front, left, right, no automatic movement, a left-right sweep of 10 to 170 degrees each side, or a custom angle within the head's limits (pan −170 to 170 degrees, tilt −18 to 18 degrees). In automatic mode the head performs that action on arrival and returns to centre when the robot leaves the POI; the Operator may switch to manual control.

**FR-36, NFR-SAFE-03, bật điều phối robot.**

> A physical robot accepts fleet movement commands only after Technical Staff enables dispatch for it with a signed safety test record. Disabling is always allowed and does not by itself stop a moving robot.

## 4. Điểm cần người làm SRS xác nhận

- **Tour nhanh có trong phạm vi SRS không.** Tour nhanh là quyết định của owner (ADR-0053), nằm ngoài mốc 72/48/24 giờ của BR-03/04/05. Cần xác nhận SRS nhận Tour nhanh như một ngoại lệ có tên, hay coi đây là tính năng chỉ để thử và trình diễn.
- **Ca tối 19:00–21:00 có hợp với học sinh không.** S5 kết thúc lúc 20:45–21:00. Cần xác nhận đối tượng học sinh tham gia giờ này có phù hợp với trường và phụ huynh không, hoặc chỉ dùng cho đoàn đặc biệt.
- **Ca trưa 11:00–12:00.** Chỉ nhận tuyến tối đa 30 phút. Cần xác nhận một tuyến ngắn như vậy vẫn đạt mục tiêu tham quan của SRS.
- **Start sớm.** ADR-0009 cũ ghi không có nút bỏ qua giờ công bố. Cần xác nhận SRS chấp nhận Start sớm 10 phút khi mọi người đã vào phòng chờ.
- **Thao tác đầu camera của Operator.** Phạm vi cũ ghi Staff không điều khiển camera bằng tay. ADR-0045 cho Operator làm việc này nhưng chưa được owner chấp nhận và đang tắt.
- **Người xem livestream.** Relay công khai hiện chưa chặn người không có mã mời khi camera đang chạy (FR-25, FR-38). Việc chặn bằng token được làm ở một pull request riêng (ADR-0055); khi pull request đó vào `main`, mục này đổi thành đã làm.
