# Đề xuất API cho giao diện web (CampusTour DT-AMR)

Cập nhật: 27/10/2026, theo **SRS v0.2** (Report 3, khớp Phiếu v1.9) và
[gap register của backend](../requirements/srs-v02-backend-gap-register.md).
Người soạn: nhóm WP4 (web). Trạng thái: **đề xuất**, chờ người làm backend
xác nhận hoặc sửa. Quyết định liên quan: ADR-0020 (SRS v0.2, TechnicalStaff),
ADR-0021 (đường dẫn web).

Tài liệu này nói **web cần gì** từ backend, sắp theo các đợt W1–W6 của gap
register. Gap register là nguồn chính cho quy tắc server; ở đây chỉ thêm hình
dạng dữ liệu mà màn hình cần. Tên endpoint và trường là đề xuất; nếu backend
đổi, chỉ cần báo để web sửa contract trong `web/src/api/contracts/` hoặc
`features/*/api/`.

## Quy ước chung (giữ như API hiện có)

- Envelope `ApiResponse<T>` / `PagedApiResponse<T>`; lỗi nghiệp vụ trả
  `errors.code` dạng `UPPER_SNAKE` để web hiển thị đúng câu chữ.
- Thao tác có điều kiện trả kèm `ActionGate { allowed, reason }` trong
  `allowedActions`; web chỉ bật nút theo gate và in `reason` khi tắt. Server
  luôn kiểm tra lại (role, sở hữu, người được giao, trạng thái, version).
- Ghi có tương tranh dùng `expectedRowVersion` (409 khi lệch); tạo mới dùng
  header `Idempotency-Key`.
- Giờ là UTC ISO-8601; web hiển thị theo UTC+7.

## Hiện trạng web (đã merge, PR #84)

| Màn | Trạng thái | Chờ backend |
|---|---|---|
| Chuẩn bị Tour ở `/staff/manage/*` | Chạy API thật `/api/admin/*` | W1: đổi quyền sang Staff, hiện Staff nhận 403 |
| Đăng ký Đại diện: tối đa 10 dòng, khóa 48 giờ | Chặn ở giao diện | W4: server áp dụng cùng quy tắc |
| Vận hành Staff (Start, Hold/Next, sự cố, End Early) | Dữ liệu mẫu theo contract `StaffApi` | W6 |
| Khu Kỹ thuật `/technical/*` | Dữ liệu mẫu có nhãn; import POI chỉ kiểm tra | W2 |
| Tài khoản: tạo/liệt kê Technical Staff | Chạy API thật | Đã xong (ADR-0020) |
| Trang người xem: fallback trong player, dừng ≤10 s khi thu hồi, báo bận | Đã làm phía giao diện | W4/W5 |

---

## W1. Phân quyền và giao người vận hành

**Đổi quyền API chuẩn bị Tour sang Staff.** `AdminToursController`,
`AdminRoutesController`, `AdminPoisController`, `AdminRegistrationsController`
và phần hỗ trợ lời mời trong `InvitationsController`. `AdminAccountsController`
giữ Admin. Đổi đường dẫn sang `/api/staff/...` là tùy chọn; báo web nếu đổi.

**Người vận hành được giao (Operator).** SRS v0.2: chỉ Staff được giao cho
Tour mới điều khiển; `CreatedByUserId` không phải là giao việc.

- `TourOperation` và chi tiết Tour (phía chuẩn bị) thêm
  `operator: { userId, username } | null`.
- `PUT /api/staff/tours/{id}/operator` với `{ userId, expectedRowVersion }`.
- `GET /api/staff/operators` (danh sách Staff đang hoạt động, để chọn).
- Mọi gate vận hành trả `allowed=false` với
  `reason = "Chỉ người vận hành được giao cho buổi này"` khi người gọi không
  phải người được giao.

**Admin: cấu hình và audit.**

- `GET /api/admin/audit?type=&from=&to=&page=&size=`: xác nhận/thu hồi
  version, End Early (ai, lý do, thời điểm), thay đổi tài khoản.
- Cấu hình (ví dụ giới hạn nhập sai mã) chờ quyết định giá trị mặc định.
- End Early của Admin (F-14): **không làm**, chờ GVHD duyệt.

## W2. Version map, POI, tuyến và xác nhận kỹ thuật (demo 6)

Màn đã có: `/technical/maps`, `/technical/poi-import`,
`/technical/confirmations` (xem `web/src/features/technical/types.ts`).

| Method | Path | Mô tả |
|---|---|---|
| GET/POST | `/api/technical/maps` | Danh sách / upload package (multipart) tạo version bất biến, kèm checksum |
| POST | `/api/technical/maps/{versionId}/deployments` | Ghi đã deploy đúng version lên robot (khác với upload) |
| POST | `/api/technical/maps/{versionId}/localization-checks` | `{ passed, note }` |
| POST | `/api/technical/maps/{versionId}/pois/import?dryRun=true` | YAML theo template dự án; tạo POI **chưa xác minh**. Schema YAML và chuyển frame còn chờ người giữ template xác nhận |
| POST | `/api/technical/pois/{revisionId}/verifications` | `{ passed, cameraPreset, note }` (FR-49: một preset mỗi revision POI) |
| POST | `/api/technical/route-tests` | `{ routeRevisionId, operatorUserId, passed, note }`; pass ghi đúng bộ map–POI–route–cấu hình |
| POST | `/api/technical/route-tests/{id}/revoke` | `{ reason }`; ghi audit |

Phía Staff cần trong phản hồi Route/Tour:

```
route.revision: number
route.confirmation: { state: "CONFIRMED" | "UNCONFIRMED" | "NEEDS_RECONFIRM", confirmedAt, testedBy }
```

Quy tắc server: Staff gọi `/api/technical/*` → 403; xếp lịch route chưa xác
nhận → 409 `ROUTE_NOT_CONFIRMED`; revision mới ảnh hưởng di chuyển không thừa
hưởng xác nhận, revision cũ đã test vẫn dùng được; sửa chỉ nội dung tính lại
thời lượng, không bắt test lại navigation; Staff click đề xuất POI tạo POI
chưa xác minh.

## W3. Xếp lịch, giữ chỗ robot, READY

- Kiểm tra trùng lịch theo khoảng **15 phút + tuyến dài nhất được phép + 15 phút**
  (FR-15). Khi trùng: 409 `SCHEDULE_CONFLICT` kèm Tour bị trùng.
- Phản hồi Tour thêm `reservation: { from, to }` để màn lịch vẽ khoảng giữ chỗ.
- `POST /api/staff/tours/{id}/ready` và `/reopen`; gate `ready` tắt khi còn
  dòng mời hoặc yêu cầu đổi email chưa quyết, hoặc tuyến chưa xác nhận.
- Dời lịch Tour đã có đăng ký: luồng thông báo riêng (chưa làm).

## W4. Đăng ký theo từng dòng, đổi email, lời mời, phiên

**Giới hạn:** roster 1–10 dòng (hiện validator 1–1000); khóa tạo/sửa khi còn
dưới 48 giờ, 409 `REGISTRATION_CLOSED`; một đăng ký mỗi Đại diện mỗi Tour.

**Sửa từng dòng (demo 2).** Gap register ghi đây là một cụm phụ thuộc: policy,
writer, duyệt theo dòng và kiểm tra truy cập phải đổi cùng nhau. Web cần:

| Method | Path | Body / mô tả |
|---|---|---|
| POST | `/api/representative/registrations/{id}/rows` | Thêm dòng: `{ rowType, displayName, email, className, expectedRowVersion }`, dòng ở trạng thái chờ duyệt |
| DELETE | `/api/representative/registrations/{id}/rows/{rowId}` | Xóa dòng; chỉ thu hồi lời mời của dòng đó |
| POST | `/api/representative/registrations/{id}/rows/{rowId}/email-change` | `{ email }`; email và mã cũ vẫn dùng được tới khi Staff quyết định |
| GET | `/api/staff/review-queue` | Dòng chờ duyệt và yêu cầu đổi email, kèm thời điểm gửi (hạn 2 ngày làm việc) |
| POST | `/api/staff/review-queue/{itemId}/accept` / `reject` | `reject` cần `{ reason }`; nhận đổi email thì đổi mã của đúng dòng đó |

Mỗi dòng trong phản hồi đăng ký cần `rowState: PENDING | ACCEPTED | REJECTED | REMOVED`
và `pendingEmail`. Dòng đã nhận giữ nguyên ID, mã và phiên khi dòng khác đang
chờ. Web sẽ bỏ hộp thoại Staff sửa email trực tiếp (`EmailCorrectionDialog`)
khi luồng yêu cầu/duyệt có API.

**Phiên người xem:** vào lại cùng thiết bị trong 2 phút trả về đúng chỗ; trình
duyệt thứ hai nhận 409 `INVITATION_IN_USE` (backend dùng mã này, không phải
`SESSION_IN_USE`). Cùng trình duyệt nhưng mất kết nối quá 2 phút khi phiên cũ
còn hạn nhận 409 `RECONNECT_WINDOW_EXPIRED` kèm `errors.fields.retryAfterSeconds` (string array, like `remainingSeats`) (số
giây tới khi phiên cũ hết hạn). Tour đã COMPLETED, hoặc CANCELLED khi chưa từng
chạy, mà yêu cầu vẫn chứng minh được lời mời (mã đúng, cookie của phiên đang mở
hoặc cookie thiết bị của phiên đang mở; lời mời chưa thu hồi) nhận 409
`TOUR_ENDED` kèm `errors.fields.tourState` (string array: `COMPLETED` hoặc
`CANCELLED`) và câu "Buổi tham quan đã kết thúc." / "Buổi tham quan đã bị
hủy."; không mở lại quyền xem, không đặt cookie. Tour CANCELLED sau khi đã chạy
vẫn trả 200 (video dự phòng). Các trường hợp khác vẫn là 401 chung. GET
`/api/registrations/{registrationId}/invitations` trả thêm cho mỗi mã
`viewerPresence` (`NOT_ENTERED | CONNECTED | DISCONNECTED | LEFT`),
`firstEnteredAt`, `lastSeenAt`, `sessionExpiresAt`; ý nghĩa ở
`docs/architecture.md`. Giới hạn nhập sai mã: 429 kèm `retryAfterSeconds`.

## W5. Nội dung đã duyệt, hỏi đáp, media

**Nội dung:** narration, câu trả lời Q&A và video fallback có trạng thái
`DRAFT | APPROVED | WITHDRAWN`. AI chỉ soạn nháp, Staff duyệt.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/staff/content?state=DRAFT` | Hàng chờ duyệt |
| POST | `/api/staff/content/{id}/draft` | Nhờ AI soạn nháp; không gửi dữ liệu học sinh |
| PUT | `/api/staff/content/{id}` | Sửa nháp |
| POST | `/api/staff/content/{id}/approve` / `withdraw` | |

**Hỏi đáp người xem:** chỉ trả lời từ bộ câu đã duyệt, hoặc câu trả lời cố
định khi không khớp. Phản hồi thêm `outcome: "ANSWERED" | "NO_MATCH"` để web
phân biệt với lỗi. Vượt giới hạn toàn instance (8 đang xử lý, tổng 20): 503
`ASSISTANT_BUSY` (web đã hiển thị riêng thông báo bận).

**Hỏi bằng giọng nói: 2 bước** (FR-31: người xem xem lại bản chép lời trước khi gửi).

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/student/tours/{id}/transcriptions` | Multipart audio → `{ transcript }`; không trả lời |
| POST | `/api/student/tours/{id}/questions` | Gửi văn bản (đã sửa nếu cần) như câu hỏi gõ tay |

Nơi xử lý speech-to-text và điều khoản nhà cung cấp còn chờ quyết định.

**Media:** `GET /api/student/tours/{id}/stream` → `{ whepUrl, expiresAt }` cấp
theo phiên, thay biến cố định `VITE_QUEST_WHEP_URL`. Server kiểm tra phiên cho
cả live và fallback, kể cả URL bị copy; thu hồi/cấp lại phải dừng phát ≤10 s.
Sau End Early: không còn live, fallback hay Q&A (web đã chỉ hiện màn kết quả).

## W6. Vận hành, sự cố, chọn điểm tiếp theo, End Early

Web đã có contract và giao diện (`web/src/api/contracts/staff.ts`,
`staff-realtime.ts`). Đề xuất làm **đúng contract này**:

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/staff/tours?date=yyyy-mm-dd&history=true` | `TourOperation[]` |
| GET | `/api/staff/tours/{id}` | `TourOperationDetail` (kèm `events`) |
| POST | `/api/staff/tours/{id}/start` | `StartConfirmation { robotPlaced, areaClear, previewChecked }` |
| POST | `/api/staff/tours/{id}/commands/{command}` | `hold, next, endEarly, retryLeg, rerunPoi, retryFront, confirmComplete`; `endEarly` bắt buộc `reason` |
| GET | `/api/staff/robots` | `AmrStatus[]` |
| POST | `/api/staff/robots/{id}/confirm-ready` | Xác nhận sẵn sàng sau tour |
| GET | `/api/staff/alerts` | `StaffAlert[]` |

Hub `/hubs/operations`: `FleetUpdated`, `TourUpdated(tourId, revision)`,
`AssistanceRequired(tourId, tourCode, reason, detail?)`.

Quy tắc web đã thể hiện ở giao diện, server cần áp dụng:

- Start chỉ từ giờ công bố, chỉ người vận hành được giao.
- Start/Next/phục hồi di chuyển cần telemetry ≤2 s, không có sự cố hay lệnh
  chưa xong, console kết nối và có người phụ trách an toàn.
- Trình tự sự cố: dừng an toàn → fallback → **một** lần phục hồi phù hợp →
  End Early. Gate phục hồi tắt sau một lần cho cùng sự cố.
- Thêm `fallback: { active: boolean, since: string | null }` vào
  `TourOperation`. Khi fallback: tắt tiếng live, tạm dừng thời gian dừng, bản đồ
  vẫn hiện robot thật; quay lại live tại POI đang chờ.
- End Early: CANCELLED kèm người, thời điểm, lý do; thu hồi media/Q&A của mọi
  phiên; đóng phiếu chọn điểm tiếp theo đang mở; không cho di chuyển tiếp.

**Người xem chọn điểm tiếp theo** ([ADR-0065](../decisions/0065-viewer-vote-next-poi.md),
đề xuất 21/11/2026, đang triển khai). Thay cho yêu cầu rẽ nhánh của Đại diện:
`BranchRequests`, `TourAllowedBranches` chỉ còn là bảng cũ, không có runtime;
các endpoint rẽ nhánh từng đề xuất ở đây bị bỏ. Hợp đồng chính thức ở
`docs/architecture.md` §3.2.z; bảng dưới chỉ tóm tắt.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/staff/routes/...revisions` | Thêm `viewerChoosesNextStop` (cờ "Cho Viewer chọn điểm tiếp theo"). Mọi lần lưu mới: kết thúc `LAST_POI` hoặc `POSE` trùng điểm bắt đầu, nếu không 409 `ROUTE_END_POSE_NOT_START`. Có cờ: 409 `ROUTE_VOTE_STOP_COUNT` (ngoài 3–4 POI), `ROUTE_VOTE_DWELL_TOO_SHORT` (dừng dưới 30 s), `ROUTE_VOTE_END_MUST_RETURN` |
| GET | `RouteRevisionView`, danh sách tuyến | Thêm `viewerChoosesNextStop`, `legCoverage { requiredCount, coveredCount, missingLegs[{ fromStopId, fromName, toStopId, toName }] }` (`fromStopId` null là điểm bắt đầu, `toStopId` null là điểm kết thúc); `VerificationStatus` có thể là `LEGS_INCOMPLETE` (chưa tạo Tour, chưa READY được) |
| POST | `/api/technical/routes/{routeId}/revisions/{revisionId}/test-runs` | Thêm `traversedStopIds` (thứ tự đã chạy), bắt buộc với tuyến có cờ: bắt đầu bằng POI đầu, mỗi POI đúng một lần; thiếu hoặc sai là 409 `ROUTE_TEST_ORDER_INVALID`. Trả lại trong `testRuns[].traversedStopIds` |
| PUT | `/api/student/tours/{tourId}/vote` | `{ stopVisitId, stopId }`, phiên Người xem (như Q&A). Trả `ballot`; 409 `VOTE_CLOSED` hoặc `VOTE_CANDIDATE_INVALID` |
| GET | `/api/student/tours/{tourId}/view` | Thêm `ballot`; mỗi stop thêm `stopId`, `progress` (`VISITED`, `SKIPPED`, `CURRENT`, `NEXT`, `REMAINING`), `lockReason` |
| GET | `/api/staff/manage/tours/{id}` | Thêm `ballot`, `leadingStopId`, `nextTarget { kind (POI/END), stopId, name }` cho nhãn nút Next ("Đi tới C"), `stopProgress[{ stopId, order, progress, lockReason }]`, và `retryTarget { kind, stopId, name }` (tuyến bình chọn, chặng hiện tại đã dừng: nơi nút "Tiếp tục tới …" / "Cho robot đi lại tới …" sẽ đi; null khi mọi điểm còn lại đều khóa, lúc đó `allowedActions.retryLeg` bị từ chối `ALL_REMAINING_STOPS_LOCKED`) |
| POST | `/api/staff/manage/tours/{id}/stops/{stopId}/lock` / `unlock` | `{ reason }`; chỉ người vận hành của Tour, Tour RUNNING, POI chưa đi, không phải POI đầu, không phải đích của chặng đang chạy thật (lệnh còn mở hoặc chưa rõ, kể cả đã xin dừng mà robot chưa báo); nếu không 409 `STOP_LOCK_INVALID`. Khóa đích của chặng đã dừng hẳn thì chọn lại điểm kế tiếp (`LOCKED_FALLBACK`) và Retry đi tới điểm đó |

`ballot` = `{ stopVisitId, open, closesAt, candidates[{ stopId, poiId, name, votes }], myVote, locked[{ stopId, name, reason }], decision{ stopId, name, reason, votes } | null }`;
`decision.reason` là `VOTE`, `TIE_DEFAULT`, `NO_VOTES`, `LOCKED_FALLBACK` hoặc
`SINGLE_CANDIDATE`; `ballot` null khi tuyến không bình chọn hoặc không có POI
hiện tại. Next/tự đi tiếp khi chỉ còn POI bị khóa: 409
`ALL_REMAINING_STOPS_LOCKED`; Skip ("Bỏ qua các điểm còn lại") khi còn POI chưa
khóa: 409 `SKIP_NOT_ALLOWED`. Cập nhật trực tiếp vẫn bằng polling như hiện nay.

---

## Câu hỏi cần backend trả lời

1. Giữ đường dẫn `/api/admin/*` cho API chuẩn bị Tour hay đổi sang `/api/staff/*`?
2. Mốc thời gian cho W1 (đang chặn Staff dùng các trang chuẩn bị) và W6 (demo 1).
3. Fallback do server tự bật hay do người vận hành bấm?
4. ~~Hạn chót rẽ nhánh chọn phương án nào?~~ Đã đóng: rẽ nhánh được thay bằng bình chọn của Người xem (ADR-0065).
