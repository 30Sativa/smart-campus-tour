# Kế hoạch bootstrap account

Trạng thái: Initial Admin seeder đã triển khai trong working tree. Mục tiêu chỉ là
khởi tạo account nền mà use case bình thường không thể tự tạo.

## 1. Phân biệt phạm vi

| Khái niệm | Mục đích | Phạm vi |
|---|---|---|
| Bootstrap seed | Account/role bắt buộc để bắt đầu quản trị | 1 Admin + role ADMIN |
| Catalog import | Nạp cấu hình kỹ thuật đã khảo sát/kiểm chứng | Tác vụ riêng sau này |
| Test/demo fixtures | Automated tests hoặc kịch bản demo riêng | Không chạy ngầm vào DB ứng dụng |

Không seed dữ liệu nghiệp vụ để DB có sẵn dữ liệu.

## 2. Password và username

- `IdentityPasswordHasher` bọc ASP.NET Core Identity `PasswordHasher<object>`
  (Identity V3); hash có salt/metadata tự chứa, Verify dùng cùng cơ chế. Primitive
  được đăng ký qua `IPasswordHasher` và dùng chung bởi initial-admin seeder và auth login.
- `InvariantUsernameNormalizer` trim khoảng trắng đầu/cuối, rồi dùng
  `ToUpperInvariant()`. Initial-admin seeder và auth dùng cùng
  `IUsernameNormalizer`.
- Plaintext password chỉ đi từ configuration tới hasher; chỉ hash được lưu ở
  `Users.PasswordHash`. Không ghi password/hash vào log.

## 3. Cách chạy

Command đã triển khai, chạy từ repo root:

```bash
dotnet run --project backend/src/SmartCampus.Api -- --seed-initial-admin
```

Cần cung cấp:

```text
InitialAdminSeed__Username
InitialAdminSeed__Password
InitialAdminSeed__FullName
ConnectionStrings__DefaultConnection
```

Dùng environment variables hoặc .NET User Secrets trong Development. Command
line password bị từ chối; chỉ flag `--seed-initial-admin` kích hoạt thao tác.
Lệnh tạo service host, thực hiện bootstrap rồi thoát trước khi map hoặc mở HTTP
server. API startup bình thường không gọi bootstrap. DB principal cần quyền đọc/ghi Users và UserRoles; bootstrap không tự cấp quyền DB.

Runner nhỏ ở `backend/src/SmartCampus.Api/InitialAdminSeedCommand.cs` và
`Program.cs`; password/username primitive đặt sau Application abstractions, còn
implementation và Users/UserRoles persistence nằm trong Infrastructure.
Seeder không có HTTP endpoint hoặc project riêng; auth endpoints là use case
độc lập.

## 4. Record, idempotency và lỗi

Lần đầu tạo đúng một `Users` và một `UserRoles` có `Role=ADMIN`: GUID do app
cấp, username đã trim/normalize, password hash, `IsActive=true`,
`CreatedAt=DateTimeOffset.UtcNow`, và FullName đã trim. Hai record được lưu
trong cùng transaction.

Chạy lại skip mà không đổi password/hash, FullName, role hoặc trạng thái khi
username đã normalize khớp, account active, dữ liệu account cần thiết hiện diện
và account đã có ADMIN. Nếu normalized username sai/không nhất quán, username
đã có nhưng inactive, thiếu ADMIN, hoặc dữ liệu account không phù hợp thì lệnh
báo conflict và trả exit code khác 0. Lệnh không sửa/reset account hiện có hay
thêm role; lỗi lúc ghi role rollback cả User.

Không seed Tours, TourAllowedBranches, GroupRegistrations, RosterRows,
Invitations, BrowserSessions, BranchRequests, RefreshTokens, TourEvents,
AuditLogs, Robots, Routes, Pois, RouteStops hoặc RouteVariants. Các bảng này
được tạo từ flow nghiệp vụ thật hoặc catalog import riêng.

## 5. Catalog sau này

Routes/POIs/stops/variants chỉ được nạp riêng khi có manifest map/tuyến thật đã
khảo sát và kiểm chứng. Không tạo dữ liệu vận hành giả. Catalog import chưa
được implement trong task này.

## 6. Schema/runtime

Local state (01/10/2026):
`backend/database/smart-campus-tour-schema-v1.1.sql` là snapshot hiện tại đã
review; generated EF local đã được scaffold theo model v1.1.
`backend/src/SmartCampus.Domain/Entities/Tour.cs` dùng
`CurrentRouteStopId` / `LastArrivedRouteStopId`, và
`backend/src/SmartCampus.Infrastructure/Persistence/ApplicationDbContext.cs` có
`Invitation`, `BrowserSession`, `BranchRequest`.

Initial Admin seeder chỉ dùng `Users` và `UserRoles`. Các bảng/cột/liên kết cần cho
bootstrap tương thích giữa v1.0 và v1.1; integration tests tạo Admin trên cả
hai snapshot. Bootstrap không phải schema/data migration và không chứng minh
mọi runtime feature v1.1 đã implement. Giữ cả
`backend/database/smart-campus-tour-schema-v1.0.sql` và
`backend/database/smart-campus-tour-schema-v1.1.sql` trong repo để trace/debug.

## 7. Tests

Integration tests xác nhận tạo đúng hai record và không tạo dữ liệu ở bảng khác,
rerun giữ nguyên hash/thông tin account, conflict với role thiếu/account
inactive/username không nhất quán, rollback khi role insert lỗi, command explicit
thoát mà không mở HTTP, startup thường không bootstrap, không nhận password
trên command line, và bootstrap dùng được cả hai snapshot. Primitive tests xác
nhận verify đúng/sai, salt ngẫu nhiên và username normalization deterministic.
Chạy `scripts/verify backend` để xác nhận build/test.


