# Đồng bộ SRS sau đợt sửa 08/11/2026

Gửi người làm SRS v0.2. File này tóm tắt những gì code đã đổi, những gì còn thiếu so với SRS, và các câu đề xuất sửa SRS.

**Phạm vi.** Nội dung mô tả theo 4 pull request của đợt này. Tại thời điểm viết, các PR chưa merge vào `main`, nên mọi thay đổi chỉ có hiệu lực sau khi merge và nâng database lên v1.18.

| Nhánh | Branch | Nội dung |
|---|---|---|
| WS-B | `feature/claude/fe-roles-ux-0811` | Giao diện Đại diện trường, học sinh, Admin, Kỹ thuật |
| WS-A | `feature/claude/fe-staff-ux-0811` | Giao diện Staff |
| WS-C | `feature/claude/be-fe-capacity-operator-expiry` | Quy tắc nghiệp vụ, schema v1.18, ADR-0048 |
| WS-D | `feature/claude/docs-sync-0811` | Tài liệu này và `docs/requirements/srs-v02-backend-gap-register.md` |

Quyết định kỹ thuật nằm ở `docs/decisions/0048-tour-capacity-operator-change-and-t24-expiry.md`. Hợp đồng API nằm ở `docs/architecture.md`, mục 3.2.x.

Repo không chứa bản đầy đủ của SRS. Các mã BR/FR/UC dưới đây lấy từ yêu cầu của đợt sửa, ADR và `docs/requirements/srs-v02-backend-gap-register.md`, chưa đối chiếu lại với bản Google Docs.

## 1. Đã làm trong đợt này

### 1.1. Quy tắc nghiệp vụ (WS-C)

| Quy tắc | Hành vi hiện tại | Mã SRS |
|---|---|---|
| Sức chứa Tour | `Tours.Capacity` từ 1 đến 40. Tour đã có nhận 20. Tạo Tour bắt buộc có `capacity`, không vượt `Tours:MaxCapacity` (mặc định 20, chỉ nâng lên 40 khi NFR-CAP-01 đạt). | BR-26, FR-22, AC-14 |
| Ghế đang giữ | Số dòng `PENDING` và `ACCEPTED` còn hiệu lực của Tour, đếm dưới khoá Tour khi tạo đăng ký, thêm dòng, thay danh sách. Dòng bị từ chối, bị gỡ hoặc hết hạn thì trả ghế. | BR-26, FR-22, AC-14 |
| Staff đổi sức chứa | Được đổi khi Tour `SCHEDULED` hoặc `READY` chưa Start, có audit. Không thấp hơn số ghế đang giữ. | BR-26 |
| Đổi người vận hành | Staff đổi được Operator của Tour `SCHEDULED` hoặc `READY` chưa Start. Người mới phải là tài khoản Staff đang hoạt động. Tour `READY` vẫn giữ `READY`. Có audit. | SRS 7.3 quyết định 8 |
| Chặn vô hiệu hoá tài khoản | Admin nhận 409 kèm danh sách cụ thể khi Staff đang là Operator của Tour `SCHEDULED` hoặc `READY`, hoặc Đại diện trường còn đăng ký `SUBMITTED` hoặc `APPROVED` ở Tour chưa kết thúc. | SRS 7.3 quyết định 8 |
| Mốc T-24h | Job chạy mỗi phút, mỗi Tour một transaction dưới khoá Tour. Dòng `PENDING` và yêu cầu đổi email `PENDING` chuyển `EXPIRED`. Email và mã mời cũ giữ nguyên. Chạy lại không đổi gì thêm. | BR-05, FR-23 |
| Chốt Tour sau T-24h | Mục đã hết hạn không còn tính là quyết định đang chờ, nên điều kiện chốt Tour qua được. | BR-05 |
| Chặn yêu cầu đổi email muộn | Gửi yêu cầu từ T-24h trở đi bị từ chối. | BR-05, FR-23 |
| Báo cho Đại diện trường | Mỗi đăng ký một email, chỉ gồm số dòng và số yêu cầu đã hết hạn. Dùng cơ chế gửi nền hiện có, lần gửi không chắc chắn không tự gửi lại. | FR-40 |
| Chặn đoán mã mời | Theo cặp (mã mời, IP nguồn): sai 5 lần trong 10 phút thì khoá 15 phút. Nhập đúng thì xoá bộ đếm. Ba giá trị đọc từ cấu hình. | FR-45, SRS 7.3 quyết định 10 |
| Danh sách Tour của Đại diện | Chỉ gồm Tour `SCHEDULED` còn trước mốc đóng đăng ký 48 giờ. Tour đã đăng ký vẫn mở được qua trang chi tiết. | FR-22 |
| Tuyến cần chạy lại | Tuyến có PASS đo theo cách cũ hiện ở mục "Cần chạy lại" của Kỹ thuật, có số đếm trên Dashboard Kỹ thuật. | Không có mã SRS riêng |

### 1.2. Giao diện (WS-A, WS-B)

Các thay đổi này chỉ ở `web/`, không đổi quy tắc nghiệp vụ.

| Thay đổi | Liên quan |
|---|---|
| Staff: bỏ giả định 60 phút, Tour đã kết thúc hiện lý do, robot và khung giữ đã trả | Màn Lịch Tour |
| Staff: thay mã trạng thái tiếng Anh bằng chữ tiếng Việt, tab Lịch sử mở theo dữ liệu | Màn Staff |
| Staff: nhãn "Đang nhận đăng ký" và "Đã đóng đăng ký" theo mốc T-48h, chỉ để hiển thị | FR-22 |
| Staff: tuyến chưa rõ độ phù hợp với ca bị khoá khi tạo Tour, có lý do "Cần chạy thử lại" | ADR-0034, ADR-0035 |
| Đại diện trường: Tour đã huỷ ẩn thao tác sửa, hiện khối "Buổi tham quan đã bị huỷ" và câu dễ hiểu cho trường hợp tự huỷ | BR-24, UC-TOUR-07, AC-19 (theo ADR-0047) |
| Học sinh: link video dự phòng đổi thành "Xem video giới thiệu (không phải trực tiếp)" | Nhãn video dự phòng trong SRS |
| Admin: bỏ mục menu không dùng được, tên vai trò tiếng Việt, nhật ký ghi "Hệ thống" và "Tự huỷ: không bắt đầu đúng giờ", ca đã qua hiện "Đã qua" | FR-41 |
| Kỹ thuật: viết lại các chữ kỹ thuật ở màn Xác nhận và Kiểm chứng POI | Màn Kỹ thuật |

## 2. Mã lỗi và endpoint mới

### 2.1. Endpoint mới

| Endpoint | Vai trò | Nội dung |
|---|---|---|
| `POST /api/staff/manage/tours/{id}/capacity` | Staff | Body `{requestId, expectedRowVersion, capacity}` |
| `POST /api/staff/manage/tours/{id}/operator` | Staff | Body `{requestId, expectedRowVersion, operatorUserId}` |
| `GET /api/technical/route-verifications/rerun-queue` | TechnicalStaff | Các tuyến có PASS hiệu lực nhưng không có `measurementBasis` |

### 2.2. Thay đổi trên endpoint có sẵn

| Endpoint | Thay đổi |
|---|---|
| `POST /api/staff/manage/tours` | `configuration.capacity` là bắt buộc |
| `GET /api/staff/manage/tours`, `GET /api/staff/manage/tours/{id}` | Thêm `tour.capacity`, `tour.heldSeats`, `tour.registrationClosesAt`, `permissions.canChangeCapacity`, `permissions.canChangeOperator`, `permissions.maxCapacity` |
| `GET /api/staff/manage/tours/slots` | Thêm `maxCapacity` |
| `GET /api/representative/tours` | Chỉ trả Tour `SCHEDULED` trước mốc 48 giờ, thêm `capacity` và `remainingSeats` |
| `GET /api/technical/dashboard` | Thêm `kpis.routeRerunsCount` và loại việc `ROUTE_RERUN` |
| Trạng thái dòng đăng ký và yêu cầu đổi email | Có thêm giá trị `EXPIRED`. Phản hồi của yêu cầu đổi email có thêm `expiresAt` |

### 2.3. Mã lỗi mới

| HTTP | Mã | Khi nào | Dữ liệu kèm |
|---|---|---|---|
| 409 | `TOUR_CAPACITY_EXCEEDED` | Tạo đăng ký, thêm dòng, thay danh sách vượt số chỗ | `errors.fields.remainingSeats` |
| 409 | `CAPACITY_BELOW_HELD` | Giảm sức chứa xuống dưới số ghế đang giữ | |
| 409 | `ACCOUNT_IN_USE` | Admin vô hiệu hoá tài khoản còn được dùng | `errors.blockers[]` (`TOUR_OPERATOR`, `ACTIVE_REGISTRATION`) |
| 409 | `EMAIL_CHANGE_CUTOFF` | Gửi yêu cầu đổi email từ T-24h | |
| 429 | `INVITATION_CODE_LOCKED` | Cặp (mã mời, IP) đang bị khoá | Message tiếng Việt có thời gian còn lại |

### 2.4. Cấu hình và schema

- Schema v1.18: thêm `Tours.Capacity`, thêm `EXPIRED` vào CHECK trạng thái của `RosterRows.ParticipationState` và `RosterEmailChangeRequests.State`. Không thêm cột thời điểm hết hạn, vì mốc này luôn là `ScheduledStartAt - 24h`.
- Cấu hình: `Tours:MaxCapacity` và `Invitations:CodeGuard:{MaxFailures,WindowMinutes,LockMinutes}`.

## 3. Còn lại so với SRS

Phân loại sau khi đọc `docs/decisions/0043-m2-2-tour-orchestration-scope.md`: chỉ ghi "hoãn theo ADR-0043" khi ADR đó nói rõ.

| Hạng mục | Mã SRS | Trạng thái | Căn cứ |
|---|---|---|---|
| Hold/Resume | Yêu cầu đợt này không nêu mã | Hoãn theo ADR-0043 | D12 và mục Out of scope ghi Hold chưa làm. Resume không có mục riêng, được tính cùng Hold vì không có Hold thì không có gì để tiếp tục. |
| Yêu cầu đổi nhánh | BR-14 | Hoãn theo ADR-0043 | Mục Out of scope ghi branches. Riêng mốc chốt nhánh còn chờ quyết định. |
| Hệ quả của End Early: thu hồi phiên xem, email đoàn | FR-48 | Hoãn theo ADR-0043 | D14 ghi End Early của M2.2 chỉ có trạng thái và lệnh. Code hiện chưa thu hồi phiên và chưa gửi email. |
| Cảnh báo quá giờ | BR-25 | Chưa làm | ADR-0043 không nhắc tới. `docs/lich-tour-theo-ca.md` mục 9 xếp vào việc để sau. |
| Báo trễ | UC-TOUR-07 | Chưa làm | ADR-0043 không nhắc tới. Xem điểm cần xác nhận ở mục 5. |
| Dời lịch | UC-TOUR-08 | Chưa làm | ADR-0043 không nhắc tới. Tour đã có đăng ký bị từ chối đổi lịch bằng `TOUR_CONFIGURATION_LOCKED`. |
| Xoá dữ liệu sau 30 ngày | BR-20 | Chưa làm | ADR-0043 không nhắc tới. Chưa có job dọn dữ liệu. |
| Hàng đợi Q&A 8/20 | BR-19 | Chưa làm | ADR-0043 không nhắc tới. `StudentQuestionGate` vẫn giới hạn theo từng phiên. |
| Màn cài đặt Admin | UC-ACC-04 | Chưa làm | ADR-0043 không nhắc tới. Các giá trị mới hiện nằm trong cấu hình máy chủ, Admin chưa sửa được. |

Ngoài danh sách trên, việc điều phối robot thật vẫn tắt: `FleetCommands:Enabled` mặc định là false, và `Robots.IsDispatchEnabled` chưa có nơi ghi trước M2.3. Các mã AC liên quan tới robot thật chưa được nghiệm thu.

## 4. Đề xuất sửa trong SRS

Repo không có văn bản gốc của SRS, nên các câu dưới đây viết dạng câu bổ sung. Người làm SRS đặt vào đúng chỗ và chỉnh theo cách viết của tài liệu.

**BR-26, định nghĩa ghế đang giữ.**

> A Tour's held seats are its active roster rows in the PENDING or ACCEPTED state. A shared viewing point row holds one seat, regardless of how many students watch that screen. Rows that are REJECTED, REMOVED or EXPIRED hold no seat.

**BR-26, sức chứa cấu hình theo từng Tour.**

> Capacity is set per Tour, between 1 and the configured maximum (20 by default, 40 only after NFR-CAP-01 is met). Staff may change it before Start, but not below the held seats.

**BR-26, Tour có từ trước khi có sức chứa.**

> A roster change that does not add seats is never refused for capacity, even when the Tour is already above its capacity.

**BR-05 và FR-23, mốc T-24h.**

> At T-24h, every PENDING roster row and PENDING email change request of a SCHEDULED or READY Tour becomes EXPIRED. An expired row returns its seat. An expired email change leaves the current email and invitation code valid. Expired items no longer block READY. New email change requests are refused from T-24h.

**FR-40, thông báo hết hạn.**

> When items expire at T-24h, the School Representative receives one email per registration stating how many roster rows and email change requests have expired.

**SRS 7.3 quyết định 8, đổi Operator và vô hiệu hoá tài khoản.**

> Staff may reassign the Operator of a SCHEDULED or READY Tour before Start, and a READY Tour stays READY. An Admin cannot deactivate a Staff account that is the Operator of a SCHEDULED or READY Tour, or a School Representative account with an active registration on a Tour that has not ended. The system lists the blocking items.

**FR-45, giới hạn của khoá theo cặp (mã mời, IP).** Khoá theo cặp đúng như SRS, nhưng không chặn được người đoán dùng một mã khác ở mỗi lần thử. Với trường hợp đó, lớp chặn còn lại là limiter 60 lần/phút/IP. Bộ đếm nằm trong bộ nhớ, chỉ đúng khi có một instance API, và mất khi khởi động lại.

> The lockout applies per pair of invitation code and source IP: 5 failed attempts within 10 minutes lock that pair for 15 minutes. Because the pair includes the code, it does not slow a guesser who tries a different code each time; the per-IP request limit (60 requests per minute) remains the control for that case. Counters are held in memory, so they apply to one API instance and do not survive a restart.

## 5. Điểm cần người làm SRS xác nhận

- **UC-TOUR-07.** Yêu cầu của đợt này gọi UC-TOUR-07 là "báo trễ", còn `docs/decisions/0047-system-auto-cancel-of-unstarted-tours.md` trích UC-TOUR-07 cho việc tự huỷ Tour không bắt đầu đúng giờ. Phần tự huỷ đã làm theo ADR-0047, phần báo trễ chưa làm. Cần kiểm tra lại mã UC này trong SRS.
- **Đăng ký không còn dòng chờ.** Đăng ký `SUBMITTED` có mọi dòng đã hết hạn vẫn nằm ở hàng chờ của Staff. SRS chưa nói trạng thái của cả đăng ký trong trường hợp này.
- **Yêu cầu đổi email của Staff.** Staff chưa có màn duyệt riêng cho yêu cầu đổi email, nên "Hết hạn lúc" mới hiện ở hàng chờ đăng ký.
