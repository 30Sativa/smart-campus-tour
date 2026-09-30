# ADR-0012: Schema v1.1, dwell cố định và quyền vận hành Staff

- Ngày: 30/09/2026.
- Trạng thái: **nhóm chấp nhận; snapshot đã apply/scaffold trên SQL Server local 30/09/2026**; GVHD xem lại ở Review 2; các use case nghiệp vụ chưa triển khai.
- Phạm vi: snapshot SQL v1.1 và hợp đồng nghiệp vụ backend/web. Thay lựa chọn Admin chỉnh dwell theo Tour và cách diễn đạt Staff chỉ vận hành Tour được phân công. Không thay contract ROS/fleet.

## Context

Review `backend/database/smart-campus-tour-schema-v1.1.sql` xác định cần khóa duy nhất cho lời mời/phiên/nhánh, định danh stop ổn định khi đổi tuyến và quy ước audit. Nhóm chọn cấu hình vận hành gọn cho V1 thay vì thêm bảng dwell theo Tour hoặc phân công operator.

## Decision

### Cấu hình và quyền

- Dwell cố định ở `RouteStops.DwellSeconds`, do kỹ thuật seed và chạy thử cùng route/nhánh. Admin chọn tuyến/bật nhánh, xem dwell, chỉnh nội dung/audio cho phù hợp; không chọn dwell riêng cho Tour. Muốn đổi dwell phải qua kỹ thuật kiểm chứng lại, không sửa cấu hình dùng bởi Tour READY/RUNNING. Audio dài hơn dwell chặn READY; Hold không thay bước chuẩn bị này.
- Mọi tài khoản đang hoạt động có role STAFF được vận hành mọi Tour, kể cả demo hai Tour. Không có `OperatorUserId` hay màn phân công/tiếp quản Staff trong V1. Vẫn kiểm tra trạng thái, readiness, giờ Start và quyền giữ robot; Admin-only không có quyền vận hành, Staff-only không có quyền hỗ trợ mã truy cập.
- `RowVersion` chỉ là token. Backend phải dùng nó trong ghi có điều kiện, xử lý conflict và chỉ phát lệnh từ quyết định đã commit thắng cạnh tranh; không suy có cột này là đã chống phát lệnh trùng.

### Fields và khóa

- Giữ GUID cho các bảng nghiệp vụ, `BIGINT IDENTITY` cho log, PK ghép của UserRoles. Bên INSERT cấp GUID; chưa bắt buộc GUID tuần tự hay thêm DEFAULT/CHECK trong lượt này.
- Thêm UNIQUE cho username chuẩn hóa, mã robot, hash refresh/session/access code, thứ tự stop trong route, nhánh trong Tour và invitation theo roster row. Hash mã truy cập là HMAC-SHA256 với khóa ngoài DB, chuẩn hóa nhất quán trước HMAC, unique toàn cục; cấp mã trùng phải sinh lại. Vẫn xác nhận invitation thuộc Tour trong URL. Độ dài mã/hạn quyền là cấu hình cần chốt trước vận hành.
- Filtered UNIQUE: một session chưa đóng/invitation; một robot giữ một Tour qua CurrentTourId; một ACCEPTED/Tour; một PENDING/(Tour, người gửi, điểm phân nhánh). Không unique AssignedRobotId toàn bộ lịch sử.
- `BranchRequests.BranchPointRouteStopId` là FK tới RouteStops, được backend lấy từ variant đã chọn, không tin giá trị client gửi. Không thêm bảng Visit hay cấp GUID trước cho lượt tương lai. Cấu hình tuyến không quay lại cùng RouteStop trong một lượt chạy bình thường; NEEDS_ASSISTANCE và đóng lượt phải hết hạn yêu cầu cũ nguyên tử trước recovery. Request cũ không được hồi sinh; Accept dùng ID yêu cầu cụ thể và lượt đang mở. `CurrentStopVisitId` vẫn phân biệt lần thực thi/callback khi chạy lại POI.
- `Tours.CurrentRouteStopId` là stop hiện tại/đích đang xử lý trên ActiveRouteId. Khi Accept tại điểm đã xác nhận dừng, kiểm tra VariantBranchStopId tương ứng cùng POI/map/frame rồi đổi current stop sang stop đó. `LastArrivedRouteStopId` giữ stop của lần arrival thực tế gần nhất, không tự đổi chỉ vì Accept; có thể thuộc tuyến cũ cho đến arrival mới. TourEvents giữ RouteId/target snapshot để đọc lịch sử. Không giả lập arrival sau Accept.
- FK đơn chỉ bảo đảm tồn tại. Backend/seed validation chịu trách nhiệm cùng Tour/route/điểm phân nhánh và test các trường hợp lệch; không thêm FK kép trong snapshot này.
- Không thêm TourId/NormalizedEmail vào RosterRows. Mọi đường import/thay roster/duyệt/sửa email phải lấy UPDLOCK trên bản ghi Tour trước kiểm tra và ghi, giữ đến commit; dùng cùng quy ước chuẩn hóa email và cùng tập dòng còn hiệu lực. Transaction riêng không dùng khóa chung là chưa đủ. Đây là yêu cầu implementation, không phải invariant đã được SQL bảo đảm.

### Session, nội dung và audit

- Filter session dùng EndedAt IS NULL. Hết hạn/giữ kết nối phải đóng phiên cũ trong transaction cấp phiên mới; vẫn kiểm tra hạn invitation/registration/Tour. `IDLE_TIMEOUT` nghĩa hết khoảng giữ kết nối, không phải không tương tác chuột khi đang xem.
- Upload audio tạo asset/URL mới, giữ asset cũ cần cho lịch sử. Khi kích hoạt narration, TourEvents lưu snapshot AudioUrl, NarrationText và NarrationSeconds đã dùng trong DataJson, gắn Tour/POI/StopVisitId; không cần bảng phiên bản mới. Snapshot không chứa dữ liệu học sinh/mã/token.
- Mỗi lần gửi email có CorrelationId riêng. Ghi `EMAIL_SEND_REQUESTED`/PENDING rồi append `EMAIL_SEND_RESULT` với ACCEPTED, FAILED hoặc UNKNOWN khi có bằng chứng, cùng CorrelationId, EntityType=Invitation và EntityId tương ứng. Retry gửi thật là attempt mới; retry ghi cùng kết quả không được đếm thêm. Thống kê theo attempt, chỉ ACCEPTED/FAILED đã xác nhận; UNKNOWN không suy thành FAILED hay thành công. Không UPDATE dòng PENDING.
- Script `backend/database/smart-campus-tour-permissions.sql` tạo role DB `campus_tour_app`, cấp SELECT/INSERT và DENY UPDATE/DELETE trên hai bảng log. Tài khoản runtime phải thuộc role này, không là dbo/sysadmin/db_owner và không được quyền DDL/ownership hay column-level grant vượt hạn chế. Cấp quyền bảng nghiệp vụ tối thiểu theo feature riêng; không cấp quyền quản trị để chạy app.

### Vòng đời dữ liệu

Theo ADR-0011, lập danh sách xử lý thực tế: RosterRows.DisplayName/Email/ClassName; GroupRegistrations.ContactName/ContactEmail, và SchoolName/GroupName/RejectionReason nếu chứa dữ liệu nhận diện; thu hồi và dọn AccessCodeHash/AccessCodeProtected cùng session token/dữ liệu phiên khi hết mục đích giữ. Kiểm tra cả bản sao import/export và thông tin tự do, không chỉ hai field tên/email. Xử lý liên kết theo thứ tự FK hoặc khử định danh phù hợp, giữ thống kê tổng hợp không nhận diện cá nhân trước khi dọn. Không xóa/sửa audit để thay xử lý dữ liệu nguồn. Chưa đặt lịch retention hoặc xây use case khử định danh ở lượt sửa snapshot.

## Consequences

- v1.1 là full snapshot cho DB trống, hiện được apply vào `SmartCampusTourV11` trên `localhost,1433` và scaffold sang Domain/Infrastructure. Không apply đè lên DB có dữ liệu. Snapshot chưa migrate v1.0 data; runtime local dùng User Secrets trỏ vào SQL Server này.
- EF Scaffold suy ra BranchRequest→Tour một-một từ filtered unique index ACCEPTED, và BrowserSession→Invitation một-một từ index một session mở mỗi Invitation; hai mapping đã được chỉnh về một-nhiều vì nhiều request/session lịch sử được phép. Khi scaffold lại phải giữ và rà các mapping này.
- Không có bảng TourStopSettings, Operator assignment, Visit hay EmailAttempts mới. Quy tắc cấp session/đổi nhánh/email/locking/khử định danh vẫn cần use case và integration tests khi triển khai API.
- Bộ test SQL thực thi snapshot, kiểm tra ràng buộc và role log trên database kiểm thử dùng một lần. Không coi test schema là kiểm chứng robot, concurrency nghiệp vụ hoặc quyền HTTP đã triển khai.
