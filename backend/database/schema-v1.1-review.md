# Schema v1.1 — kết quả xử lý review

Ngày: 30/09/2026. Phạm vi: fields, ID, PK/FK, UNIQUE/index, comment và quyền ghi log.
Quyết định hiện hành: docs/decisions/0012-v1-1-schema-and-operation-scope.md.
Báo cáo này cập nhật kết luận review ban đầu sau khi nhóm chốt phương án V1.

## Đã sửa trong snapshot

| Hạng mục | Kết quả |
|---|---|
| GUID / PK | Giữ GUID nghiệp vụ, BIGINT IDENTITY cho hai bảng log, PK ghép UserRoles. Chưa cần GUID tuần tự ở quy mô V1. |
| UNIQUE thông thường | NormalizedUsername; RobotCode; RouteStops(RouteId, StopOrder); TourAllowedBranches(TourId, RouteVariantId); Invitations.RosterRowId/AccessCodeHash; RefreshTokens.TokenHash; BrowserSessions.SessionTokenHash. |
| Filtered UNIQUE | Một session chưa đóng/invitation; một ACCEPTED/Tour; một PENDING/Tour/người gửi/điểm phân nhánh; một Tour được giữ bởi tối đa một robot. |
| BranchRequests | Thêm BranchPointRouteStopId NOT NULL và FK tới RouteStops. Backend phải lấy từ variant và bảo đảm khớp; không cần thêm GUID cho lượt tương lai. |
| Tours | CurrentRouteStopId/LastArrivedRouteStopId thay hai StopOrder, có FK. LastArrived giữ arrival thực tế, có thể còn thuộc route cũ sau Accept. |
| AccessCodeHash | Comment chốt HMAC-SHA256, khóa ngoài DB; unique toàn cục và vẫn kiểm tra đúng Tour. |
| Session | EndReason có IDLE_TIMEOUT; index dựa EndedAt IS NULL, cần transaction đóng phiên hết hạn trước cấp mới. |
| Audit email | Mỗi attempt có CorrelationId; request/kết quả là các dòng riêng, không UPDATE. Thêm index EntityType/EntityId/OccurredAt/Id và CorrelationId/OccurredAt/Id. |
| Quyền log | Script role campus_tour_app: SELECT/INSERT, DENY UPDATE/DELETE trên TourEvents/AuditLogs; không provision tài khoản runtime. |
| Chú thích | Mọi field có comment về ý nghĩa, đơn vị hoặc tham chiếu; comment không thay validation. |

## Các lựa chọn đơn giản đã chốt

- **Dwell cố định trong seed:** Admin xem dwell/chỉnh audio, không chỉnh dwell theo Tour. Kỹ thuật kiểm chứng lại nếu thay cấu hình, khóa dữ liệu đang được READY/RUNNING sử dụng. Không có bảng TourStopSettings.
- **Mọi Staff vận hành mọi Tour:** tài khoản phải đang hoạt động và có role STAFF; vẫn kiểm tra state/readiness/giờ/robot claim. Không có OperatorUserId. RowVersion cần được sử dụng trong conditional write, không tự chống lệnh trùng.
- **Không thêm FK kép:** seed validation và backend chịu trách nhiệm cùng Tour/route/branch point. Đây là phần còn phải test khi có use case, không phải DB đã bảo đảm.
- **Không lặp TourId vào RosterRows:** mọi đường import/thay roster/duyệt/sửa email khóa Tour bằng UPDLOCK trước kiểm tra/ghi trong cùng transaction.
- **Không thêm bảng phiên bản audio:** URL/asset mới, giữ asset cũ; snapshot AudioUrl/NarrationText/NarrationSeconds khi kích hoạt narration vào TourEvents.
- **Không thêm bảng EmailAttempts:** dùng các mốc append-only trong AuditLogs, thống kê theo CorrelationId của attempt.
- **Không đổi hàng loạt kiểu dữ liệu:** NVARCHAR cho tiếng Việt, VARCHAR cho mã trạng thái, DATETIMEOFFSET(3), ROWVERSION, BINARY(32), DECIMAL tọa độ vẫn phù hợp. Giới hạn PasswordHash và định dạng CredentialHash chốt theo thuật toán khi triển khai; chưa là blocker của snapshot.

## Phạm vi còn lại

Schema vẫn không có CHECK/DEFAULT. Miền state/nullable theo lifecycle, cùng route/Tour, HMAC thật, session revoke, phát lệnh sau commit, snapshot audio, gửi email, chuẩn hóa/khóa email và khử định danh là trách nhiệm backend chưa triển khai. Không nói đã hoàn thành các use case chỉ vì SQL có cột/index.

Khử định danh phải xét roster, lớp, thông tin liên hệ đoàn, free text có nhận diện, invitation/session secret và bản sao import/export; giữ thống kê tổng hợp không nhận diện theo ADR-0011. Không chỉ ghi đè tên/email hoặc xóa audit.

Chi tiết chạy test và adoption: backend/database/README.md. EF/runtime hiện vẫn theo v1.0; v1.1 là snapshot database trống, không migration dữ liệu và không tự re-scaffold app. Các tài liệu scope/UI/architecture đã cập nhật theo ADR-0012; không thay contract ROS/fleet.

## Kiểm chứng

`scripts/verify backend` với SMARTCAMPUS_SCHEMA_TEST_CONNECTION trỏ LocalDB: PASS,
7 unit tests + 17 integration tests, không skip; build không warning/error.
Năm test mới thực thi v1.1 trên SQL Server thật trong các database tạm, gồm race
hai kết nối cấp session và kiểm tra quyền log bằng user không có quyền quản trị.
Database tạm đã dọn sau test. Toàn bộ 201 fields có comment.
