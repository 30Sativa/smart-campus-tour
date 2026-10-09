# Bootstrap account và POI fixture dev/demo

Trạng thái: Initial Admin bootstrap và lệnh POI fixture dev/demo đã triển khai.
Hai lệnh độc lập; bootstrap chỉ khởi tạo account nền mà use case bình thường
không thể tự tạo. POI fixture phục vụ phát triển dữ liệu trước khảo sát waypoint.

## 1. Phân biệt phạm vi

| Khái niệm | Mục đích | Phạm vi |
|---|---|---|
| Bootstrap seed | Account/role bắt buộc để bắt đầu quản trị | 1 Admin + role ADMIN |
| Catalog import | Nạp cấu hình kỹ thuật đã khảo sát/kiểm chứng | Tác vụ riêng sau này |
| Test/demo fixtures | Automated tests hoặc kịch bản demo riêng | Không chạy ngầm vào DB ứng dụng |

Không seed dữ liệu nghiệp vụ ngầm vào DB ứng dụng. Ngoại lệ explicit của task
POI baseline là bốn POI fixture trong DB demo riêng, mô tả ở mục 8; không phải
catalog đã kiểm chứng và không chạy trong production.

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

Initial Admin bootstrap không seed Tours, TourAllowedBranches, GroupRegistrations, RosterRows,
Invitations, BrowserSessions, BranchRequests, RefreshTokens, TourEvents,
AuditLogs, Robots, Routes, Pois, RouteStops hoặc RouteVariants. Các bảng này
được tạo từ flow nghiệp vụ thật hoặc catalog import riêng.

## 5. Catalog sau này

Routes/POIs/stops/variants chỉ được nạp riêng khi có manifest map/tuyến thật đã
khảo sát và kiểm chứng. Không tạo dữ liệu vận hành giả. Catalog import chưa
được implement. POI fixture dev/demo bên dưới không thay quy trình này.

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

## 8. POI baseline dev/demo

Lệnh chạy riêng từ repo root, sau khi DB demo trống đã được provision và apply
`backend/database/smart-campus-tour-schema-v1.1.sql`:

```powershell
$env:DOTNET_ENVIRONMENT = 'Development'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ConnectionStrings__DefaultConnection = 'Server=localhost,1433;Database=SmartCampusTourPoiDemo;Integrated Security=true;TrustServerCertificate=true'
dotnet run --no-launch-profile --project backend/src/SmartCampus.Api -- --seed-demo-pois
```

Ví dụ dùng SQL Server local/Windows Integrated Security, không chứa credential.
Các biến trên chỉ áp dụng cho shell này; kết thúc shell demo trước khi dùng lại
cấu hình API thường. Không đổi User Secrets đang trỏ `SmartCampusTourV11`.
Lệnh không tạo DB, apply schema, cấp quyền, mở HTTP hoặc yêu cầu JWT. Không ghép
hai flag `--seed-demo-pois` và `--seed-initial-admin` trong một invocation.

Guard kiểm tra Development và tên catalog trước khi kết nối, kiểm tra lại
`DB_NAME()` sau kết nối, trước mọi DML. Chỉ chấp nhận `SmartCampusTourPoiDemo`
hoặc `SmartCampusTourPoiDemo_<32-hex-guid>` (bản sao demo/test dùng một lần).
`SmartCampusTourV11`, Production/Staging và tên có hậu tố tùy ý bị từ chối.
DB principal cần SELECT/INSERT trên Pois và quyền lấy transaction application
lock; command không cấp quyền. API startup thường không gọi seeder.

Fixture dùng `MapKey=demo-poi-baseline-v1`, `MapFrame=map`, mét/radian. X/Y dựa
trên mock FE hiện tại, yaw=0 là placeholder; không phải tọa độ tầng 6 NVH hoặc
các map ROS đã lưu. Nguồn fixture ở
`backend/src/SmartCampus.Infrastructure/Persistence/Seeding/DemoPoiFixture.cs`.

| Poi.Id cố định | Name | X | Y | Yaw |
|---|---|---:|---:|---:|
| `8fd832a5-7e3b-4e6d-a101-000000000001` | [DEMO] AI Lab | -1.5 | -5.5 | 0 |
| `8fd832a5-7e3b-4e6d-a101-000000000002` | [DEMO] Thư viện trung tâm | 4.8 | -2.2 | 0 |
| `8fd832a5-7e3b-4e6d-a101-000000000003` | [DEMO] Innovation Space | 3.5 | 4.2 | 0 |
| `8fd832a5-7e3b-4e6d-a101-000000000004` | [DEMO] Hội trường A | -3.5 | 3.8 | 0 |

Description ghi rõ chưa khảo sát/không điều hướng robot thật. `IsActive=true`
cho phép dùng trong phát triển Route ở DB demo; không có nghĩa đã kiểm chứng.
NarrationText/AudioUrl/NarrationSeconds/FallbackVideoUrl để NULL; không dựng
asset giả nhằm vượt READY. CreatedAt là UTC; UpdatedAt là NULL khi INSERT.
Lệnh chỉ tạo Pois; không tạo Route/RouteStop/Tour/Robot hoặc nạp YAML robot.
Không thêm field/table, HasData hoặc migration.

### Idempotency và atomicity

- GUID chưa có: INSERT; payload đã khớp: skip, không đổi timestamps.
- Cùng GUID nhưng khác bất kỳ field payload nào (kể cả map, audio, IsActive):
  conflict. CreatedAt/UpdatedAt không phải payload so khớp và được giữ nguyên.
- Cùng tên trim/case-insensitive trong cùng map demo nhưng khác GUID: conflict,
  không tự merge theo tên. Đây là quy tắc fixture, không thêm UNIQUE toàn DB.
- Tất cả kiểm tra và INSERT trong một transaction. `sp_getapplock` exclusive,
  transaction-owned tuần tự hóa các command seed cạnh tranh trong cùng DB.
  Nó không khóa thay cho các use case chỉnh catalog khác.
- Conflict hoặc ghi lỗi rollback batch, exit khác 0; không reset/upsert ghi đè.
  Output thành công báo số created/skipped; SQL/connection diagnostics không
  được in ra từ runner. Không có chế độ tự downgrade dữ liệu đã cập nhật.

### Thay bằng waypoint thật ở task sau

Khi cùng điểm nghiệp vụ được khảo sát, giữ Poi.Id và cập nhật map/frame/pose
bằng script/import kỹ thuật được review, có diff, transaction và kiểm tra
Tour READY/RUNNING cùng route/nhánh liên quan. RouteStop.PoiId giữ nguyên.
Chuyển từ map demo sang map thật phải cập nhật Route.MapKey/MapFrame và Start/End
nhất quán; không chỉ sửa POI. Chạy lại seed lúc đó báo conflict, không ghi đè.
Điểm nghiệp vụ khác hẳn thì cần identity mới/ánh xạ có chủ đích.

Chốt map revision và asset trước khi đo; frame `map` không tự xác định map.
RViz Publish Point chỉ lấy vị trí, yaw cần pose có orientation và chạy thử.
Scan lại map với hệ tọa độ mới cần map key mới và kiểm chứng lại tuyến.
Tọa độ từng POI hợp lệ chưa chứng minh thứ tự/đường nối/Start/End đã thử.
Không dùng DB fixture cho robot thật. Trước physical dispatch, task tích hợp
phải từ chối demo/unapproved map và kiểm tra map/frame thực robot đang load
theo ADR-0005; command seed này không triển khai dispatch guard hoặc bridge.

### Verification

`backend/tests/SmartCampus.IntegrationTests/DemoPoiSeederTests.cs` kiểm tra
create-only-Pois, payload/GUID, rerun giữ timestamps, bổ sung fixture thiếu,
conflict/không ghi đè, duplicate tên khác ID, rollback khi INSERT lỗi, hai
connection seed đồng thời, RouteStop FK giữ nguyên sau update pose, command
thoát không mở HTTP/không cần JWT, guard Production/sai DB/ghép lệnh, và startup
thường không seed. SQL tests dùng database demo GUID riêng rồi dọn đúng DB đó.
Chạy `bash scripts/verify backend` với `SMARTCAMPUS_SCHEMA_TEST_CONNECTION`
theo `backend/database/README.md`; SKIPPED không phải kiểm chứng persistence.


