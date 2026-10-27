# Đề xuất API cho giao diện web (CampusTour DT-AMR)

Ngày: 27/10/2026. Người soạn: nhóm WP4 (web). Trạng thái: **đề xuất**, chờ người
làm backend xác nhận hoặc sửa. Căn cứ: Capstone Register v1.9 (26/10/2026),
ADR-0009/0010/0016/0017/0018/0020.

Tài liệu này liệt kê những gì web cần từ backend: (A) thay đổi trên API đã có,
web đã sửa giao diện và đang chờ; (B) API mới cho các màn còn thiếu. Tên
endpoint và trường là đề xuất; nếu backend đổi, chỉ cần báo lại để web sửa
contract trong `web/src/api/contracts/` hoặc `features/*/api/`.

## Quy ước chung (giữ như API hiện có)

- Envelope `ApiResponse<T>` / `PagedApiResponse<T>`; lỗi nghiệp vụ trả
  `errors.code` dạng `UPPER_SNAKE` để web hiển thị đúng câu chữ.
- Mọi thao tác có điều kiện trả kèm `ActionGate { allowed, reason }` trong
  `allowedActions`; web chỉ bật nút theo gate và in `reason` khi tắt. Server
  luôn kiểm tra lại khi nhận request.
- Ghi có tương tranh dùng `expectedRowVersion` (409 khi lệch), tạo mới dùng
  header `Idempotency-Key` như hiện tại.
- Giờ là UTC ISO-8601; web tự hiển thị theo UTC+7.

## Thứ tự ưu tiên

| Ưu tiên | Mục | Demo acceptance liên quan |
|---|---|---|
| 1 | A1 quyền Staff, A2 giới hạn đăng ký | (2) |
| 2 | B5 vận hành tour | (1) |
| 3 | B3 sửa từng dòng mời | (2) |
| 4 | B7 Technical Staff và version | (6) |
| 5 | B6 rẽ nhánh | (1) |
| 6 | A3, A4, B8, B9, B10 | (1), (4) |

---

## A. Thay đổi trên API đã có (web đã làm xong phần giao diện)

### A1. Chuyển quyền chuẩn bị Tour từ Admin sang Staff (ADR-0020)

Web đã chuyển các trang sang `/staff/manage/*` nhưng vẫn gọi `/api/admin/*`.
Hiện tài khoản Staff nhận **403**.

- Đổi `[Authorize(Roles = Admin)]` thành `Staff` trên `AdminToursController`,
  `AdminRoutesController`, `AdminPoisController`,
  `AdminRegistrationsController`, và phần quyền Admin trong
  `InvitationsController` (Admin → Staff; Representative giữ nguyên).
- `AdminAccountsController` giữ `Admin`.
- Đổi đường dẫn sang `/api/staff/...` là tùy chọn; nếu đổi, báo web để đổi
  một lần.
- Thông báo lỗi sửa email đang ghi "chỉ quản trị viên"; web đã đổi câu chữ
  thành Staff.

### A2. Giới hạn đăng ký của Đại diện (SRS §3.2.b)

- `RegistrationInputValidator`: roster từ **1 đến 10** dòng (hiện 1–1000).
  Web đã chặn 10 ở bước đọc file.
- Từ chối tạo, sửa, gửi lại đăng ký khi còn **dưới 48 giờ** trước
  `ScheduledStartAt`; trả 409 `errors.code = "REGISTRATION_CLOSED"`, và
  `register` / `allowedActions.edit` / `allowedActions.resubmit` có
  `allowed=false` cùng `reason`. Hủy đăng ký giữ quy tắc hiện tại.
- Một đại diện chỉ có một đăng ký cho mỗi Tour (SRS: one registration per
  representative per tour). Nếu đã có, `register.allowed=false`.

### A3. Hỏi đáp: trạng thái bận (SRS NFR Performance)

- Giới hạn toàn instance: tối đa 8 câu đang xử lý, tổng 20 (đang xử lý + chờ).
- Câu vượt giới hạn: trả **503**, `errors.code = "ASSISTANT_BUSY"`. Web đã
  hiển thị riêng thông báo bận, không coi là câu trả lời.
- Báo cáo benchmark tách thành công / bị từ chối (busy) / quá thời gian.

### A4. Quy tắc vận hành web đã thể hiện ở giao diện (server cần áp dụng)

- **Start chỉ từ giờ công bố**: `allowedActions.start.allowed=false` khi
  `now < scheduledAt`, `reason` nêu giờ.
- **Một lần phục hồi mỗi sự cố**: sau một trong `retryLeg`, `rerunPoi`,
  `retryFront` cho cùng một sự cố, các gate phục hồi trả `allowed=false`,
  `reason = "Đã thử phục hồi một lần, cần Kết thúc sớm nếu chưa an toàn"`.
  Web hiện chỉ nhớ trong trang; tải lại trang là mất.
- **Tín hiệu fallback**: thêm vào `TourOperation`
  `fallback: { active: boolean, since: string | null }` để bước 2 của panel
  sự cố hiển thị trạng thái thật.
- **Ngưỡng telemetry**: stale sau 2 s, disconnected sau 5 s (web đã dùng hai
  ngưỡng này cho `poseAgeSeconds`). `connectionState` do server tính nên dùng
  cùng ngưỡng.

---

## B. API mới

### B5. Vận hành tour cho Staff

Web đã có contract và giao diện chạy trên dữ liệu mẫu
(`web/src/api/contracts/staff.ts`, `staff-realtime.ts`). Đề xuất backend làm
**đúng contract này** để web chỉ đổi nguồn dữ liệu.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/staff/tours?date=yyyy-mm-dd&history=true` | Danh sách `TourOperation` trong ngày, hoặc lịch sử |
| GET | `/api/staff/tours/{id}` | `TourOperationDetail` (kèm `events`) |
| POST | `/api/staff/tours/{id}/start` | Body `StartConfirmation { robotPlaced, areaClear, previewChecked }` |
| POST | `/api/staff/tours/{id}/commands/{command}` | `command` ∈ `hold, next, endEarly, retryLeg, rerunPoi, retryFront, confirmComplete`; body `{ reason? }`. `endEarly` bắt buộc `reason` |
| GET | `/api/staff/robots` | `AmrStatus[]` |
| POST | `/api/staff/robots/{id}/confirm-ready` | Xác nhận sẵn sàng sau tour, body `{ note? }` |
| GET | `/api/staff/alerts` | `StaffAlert[]` |

SignalR hub `/hubs/operations` (đã có, mở rộng sự kiện):
`FleetUpdated(robots)`, `TourUpdated(tourId, revision)`,
`AssistanceRequired(tourId, tourCode, reason, detail?)`.

Ghi chú:

- `TourOperation.revision` tăng đơn điệu; web bỏ snapshot cũ hơn.
- Start gán robot nguyên tử, từ chối nếu robot đang phục vụ Tour khác.
- `startChecks` gồm robot kết nối, đã định vị, rảnh, đầu xoay FRONT, pin, stream.
- Admin gọi các lệnh này: 403 (Admin chỉ xem, ADR-0013).

### B3. Sửa từng dòng mời sau khi duyệt

Mục tiêu demo (2): thêm hoặc xóa một dòng **không đổi mã** của các dòng khác.
Hiện `RegistrationDraftWriter` thay cả roster, nên mọi dòng đổi ID và mã.

Đại diện (trước khi khóa 48 giờ):

| Method | Path | Body |
|---|---|---|
| POST | `/api/representative/registrations/{id}/row-changes` | `{ kind: "ADD", row: { rowType, displayName, email, className }, expectedRowVersion }` |
| POST | `/api/representative/registrations/{id}/row-changes` | `{ kind: "REMOVE", rowId, expectedRowVersion }` |
| POST | `/api/representative/registrations/{id}/row-changes` | `{ kind: "CHANGE_EMAIL", rowId, email, expectedRowVersion }` |
| GET | `/api/representative/registrations/{id}` | Thêm `pendingRowChanges[]` |

Staff (trong 2 ngày làm việc):

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/staff/row-changes?state=PENDING` | Hàng chờ, kèm tên trường, đoàn, Tour, thời điểm gửi |
| POST | `/api/staff/row-changes/{id}/approve` | Áp dụng thay đổi |
| POST | `/api/staff/row-changes/{id}/reject` | Body `{ reason }` |

Quy tắc:

- ADD được duyệt: tạo `RosterRow` và `Invitation` mới; dòng khác giữ nguyên.
- REMOVE được duyệt: thu hồi lời mời của dòng đó (đóng phiên), dòng khác giữ nguyên.
- CHANGE_EMAIL được duyệt: giữ mã nếu SRS cho phép, gửi lại email.
- Tổng dòng đang hoạt động không vượt 10.
- Resend / Reissue / Revoke của Đại diện vẫn dùng được cả khi Tour đang chạy
  (API hiện có).

### B6. Rẽ nhánh

Bảng `BranchRequest`, `TourAllowedBranch`, `RouteVariant` đã có trong schema.

Đại diện:

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/representative/tours/{id}` | Thêm `branches[] { id, name, description }` (chỉ nhánh đã test) và `branchRequest` của đoàn mình |
| POST | `/api/representative/registrations/{id}/branch-request` | `{ tourAllowedBranchId }`; chỉ trước khi Tour khởi hành; một yêu cầu mỗi đoàn |

Staff:

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/staff/tours/{id}/branch-requests` | Theo thứ tự đến; kèm gate `accept` |
| POST | `/api/staff/branch-requests/{id}/accept` | Chỉ khi robot đang chờ tại điểm rẽ; tối đa một yêu cầu được nhận mỗi Tour |
| POST | `/api/staff/branch-requests/{id}/reject` | `{ reason }` |

Khi một yêu cầu được nhận, các yêu cầu còn lại chuyển `EXPIRED` với lý do.
Phát `TourUpdated` để web cập nhật.

### B7. Technical Staff, version và xác nhận kỹ thuật (demo 6)

Role mới `TechnicalStaff` (một role mỗi tài khoản, ADR-0013); Admin tạo được
tài khoản role này.

| Method | Path | Mô tả |
|---|---|---|
| GET/POST | `/api/technical/maps` | Danh sách / upload package map (multipart), tạo version mới |
| POST | `/api/technical/maps/{versionId}/deployments` | Ghi nhận đã deploy map tương ứng lên robot |
| POST | `/api/technical/maps/{versionId}/localization-checks` | `{ passed, note }` |
| POST | `/api/technical/maps/{versionId}/pois/import?dryRun=true` | YAML theo template dự án; `dryRun` trả lỗi theo dòng, không ghi |
| POST | `/api/technical/confirmations` | `{ mapVersionId, routeId, routeVersion }` sau khi kiểm tra POI và tuyến thực tế |
| POST | `/api/technical/confirmations/{id}/revoke` | `{ reason }`; ghi audit |

Mở rộng phản hồi Route/Tour cho Staff:

```
route.version: number
route.confirmation: { state: "CONFIRMED" | "UNCONFIRMED" | "NEEDS_RECONFIRM", confirmedAt, confirmedBy }
```

Quy tắc server:

- Staff gọi `/api/technical/*`: 403.
- Tạo hoặc xếp lịch Tour với route chưa xác nhận: 409
  `errors.code = "ROUTE_NOT_CONFIRMED"`.
- Version mới có ảnh hưởng di chuyển: không thừa hưởng xác nhận; version cũ
  đã xác nhận vẫn dùng được.
- Sửa chỉ narration: không bắt kiểm tra lại navigation.
- Staff đề xuất POI bằng click trên map: POI ở trạng thái `PROPOSED`, chưa
  phải xác nhận kỹ thuật.

### B8. Duyệt nội dung (narration, câu trả lời Q&A)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/staff/content?state=DRAFT` | Hàng chờ duyệt, kèm `submittedAt` |
| POST | `/api/staff/content/{id}/draft` | Nhờ Gemini soạn nháp từ nội dung Staff nhập; không gửi dữ liệu học sinh |
| PUT | `/api/staff/content/{id}` | Sửa nháp |
| POST | `/api/staff/content/{id}/approve` | Chỉ nội dung `APPROVED` được dùng cho thuyết minh và Q&A |

### B9. Trang học sinh

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/student/tours/{id}/stream` | `{ whepUrl, expiresAt }` cấp theo phiên cookie; thay biến cố định `VITE_QUEST_WHEP_URL` |
| POST | `/api/student/tours/{id}/questions/voice` | Multipart audio; trả `{ transcript, answer }` cùng dạng `StudentAiAnswer` |

Yêu cầu:

- Media server kiểm tra phiên cho cả live và video dự phòng, kể cả khi URL bị
  copy; revoke hoặc reissue phải dừng phát trong ≤10 s. Web đã kiểm tra phiên
  mỗi 5 s khi Tour chạy, nhưng không chặn được URL bị copy.
- Câu hỏi giọng nói chịu cùng giới hạn A3. Cần xác nhận vị trí xử lý
  speech-to-text trước pilot (mục 4 của Register).

### B10. Audit cho Admin

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/admin/audit?type=&from=&to=&page=&size=` | Xác nhận/thu hồi version, End Early (ai, lý do, thời điểm), thay đổi tài khoản |

End Early của Admin khi người vận hành mất kết nối: **chưa làm**, chờ GVHD
duyệt (F-14).

---

## Câu hỏi cần backend trả lời

1. Giữ đường dẫn `/api/admin/*` cho các API chuẩn bị Tour hay đổi sang
   `/api/staff/*`?
2. Đổi email một dòng mời: giữ mã cũ hay cấp mã mới?
3. Fallback do server tự bật hay do Staff bấm? (ảnh hưởng A4 và panel sự cố)
4. Mốc thời gian dự kiến cho B5, vì demo (1) phụ thuộc vào mục này.
