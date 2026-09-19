/*

CAMPUS TOUR DT-AMR — BẢN PHÁC THẢO BẢNG VÀ CỘT

Theo scope: CampusTour-demo-first-scope-2026-09-18.md.



Chọn database trống trước khi chạy. File này chỉ tạo bảng, không chuyển dữ liệu cũ.

Giữ tên cột, kiểu dữ liệu, NULL/NOT NULL và thuộc tính tự sinh IDENTITY/ROWVERSION.

Bản này khai báo khóa chính và khóa ngoại; các ràng buộc UNIQUE, CHECK, DEFAULT và index bổ sung sau.

Các giá trị trạng thái bên cạnh cột là ghi chú thiết kế, chưa được DB kiểm tra.

Quy tắc nghiệp vụ chi tiết nằm trong file scope; các ràng buộc sẽ bổ sung sau.

*/


-- 01. Users — Tài khoản Admin, Staff và đại diện trường.

CREATE TABLE dbo.Users
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Mã định danh của bản ghi.
    Username                 NVARCHAR(100)             NOT NULL, -- Tên đăng nhập của Admin, Staff hoặc đại diện trường.
    NormalizedUsername       NVARCHAR(100)             NOT NULL, -- Tên đăng nhập đã chuẩn hóa để tra cứu và chống trùng khi bổ sung ràng buộc.
    PasswordHash             NVARCHAR(MAX)             NOT NULL, -- Mật khẩu đã băm bằng thư viện xác thực; không lưu mật khẩu gốc.
    FullName                 NVARCHAR(150)             NOT NULL, -- Họ tên hiển thị của người dùng; học sinh không có tài khoản riêng.
    IsActive                 BIT                       NOT NULL, -- Cho phép sử dụng bản ghi; tắt không đồng nghĩa xóa lịch sử.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, lưu UTC; chưa cập nhật thì để trống.

    CONSTRAINT PK_Users PRIMARY KEY (Id)
);

GO



-- 02. UserRoles — Vai trò của từng tài khoản.

CREATE TABLE dbo.UserRoles
(
    UserId                   UNIQUEIDENTIFIER          NOT NULL, -- Tài khoản liên quan, tham chiếu Users.Id.
    Role                     VARCHAR(32)               NOT NULL, -- Vai trò: ADMIN, STAFF hoặc SCHOOL_REPRESENTATIVE; một tài khoản có thể có nhiều vai trò.

    CONSTRAINT PK_UserRoles PRIMARY KEY (UserId, Role),
    CONSTRAINT FK_UserRoles_UserId FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
);

GO



-- 03. RefreshTokens — Mã làm mới phiên đăng nhập của tài khoản.

CREATE TABLE dbo.RefreshTokens
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Mã định danh của bản ghi.
    UserId                   UNIQUEIDENTIFIER          NOT NULL, -- Tài khoản liên quan, tham chiếu Users.Id.
    TokenHash                BINARY(32)                NOT NULL, -- Giá trị SHA-256 của mã làm mới phiên đăng nhập; không lưu mã gốc.
    ExpiresAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm hết hạn, lưu UTC.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC.
    RevokedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm thu hồi, lưu UTC; để trống nếu chưa thu hồi.

    CONSTRAINT PK_RefreshTokens PRIMARY KEY (Id),
    CONSTRAINT FK_RefreshTokens_UserId FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
);

GO



-- 04. Routes — Tuyến tham quan được chuẩn bị sẵn.

CREATE TABLE dbo.Routes
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Mã định danh của bản ghi.
    Name                     NVARCHAR(150)             NOT NULL, -- Tên hiển thị.
    Description              NVARCHAR(1000)            NULL,     -- Mô tả bổ sung.
    MapKey                   NVARCHAR(100)             NOT NULL, -- Mã bản đồ cụ thể đang sử dụng.
    MapFrame                 NVARCHAR(100)             NOT NULL, -- Tên hệ tọa độ ROS, ví dụ map.
    StartX                   DECIMAL(10,4)             NOT NULL, -- Tọa độ X điểm xuất phát, đơn vị mét.
    StartY                   DECIMAL(10,4)             NOT NULL, -- Tọa độ Y điểm xuất phát, đơn vị mét.
    StartYaw                 DECIMAL(9,6)              NOT NULL, -- Góc hướng thân robot tại điểm xuất phát, đơn vị radian.
    EndMode                  VARCHAR(20)               NOT NULL, -- Cách kết thúc tuyến: LAST_POI tại điểm cuối hoặc POSE có chặng về riêng.
    EndX                     DECIMAL(10,4)             NULL,     -- Tọa độ X điểm kết thúc khi EndMode = POSE; LAST_POI để trống.
    EndY                     DECIMAL(10,4)             NULL,     -- Tọa độ Y điểm kết thúc khi EndMode = POSE; LAST_POI để trống.
    EndYaw                   DECIMAL(9,6)              NULL,     -- Góc hướng tại điểm kết thúc khi EndMode = POSE, đơn vị radian.
    IsActive                 BIT                       NOT NULL, -- Cho phép sử dụng bản ghi; tắt không đồng nghĩa xóa lịch sử.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, lưu UTC; chưa cập nhật thì để trống.

    CONSTRAINT PK_Routes PRIMARY KEY (Id)
);

GO



-- 05. Pois — Điểm tham quan, tọa độ và nội dung thuyết minh.

CREATE TABLE dbo.Pois
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Mã định danh của bản ghi.
    Name                     NVARCHAR(150)             NOT NULL, -- Tên hiển thị.
    Description              NVARCHAR(2000)            NULL,     -- Mô tả bổ sung.
    MapKey                   NVARCHAR(100)             NOT NULL, -- Mã bản đồ cụ thể đang sử dụng.
    MapFrame                 NVARCHAR(100)             NOT NULL, -- Tên hệ tọa độ ROS, ví dụ map.
    X                        DECIMAL(10,4)             NOT NULL, -- Tọa độ X đích di chuyển tại POI, đơn vị mét.
    Y                        DECIMAL(10,4)             NOT NULL, -- Tọa độ Y đích di chuyển tại POI, đơn vị mét.
    Yaw                      DECIMAL(9,6)              NOT NULL, -- Góc hướng thân robot tại POI, đơn vị radian.
    NarrationText            NVARCHAR(MAX)             NULL,     -- Nội dung thuyết minh chuẩn bị sẵn, dùng một ngôn ngữ đã chọn.
    AudioUrl                 NVARCHAR(1000)            NULL,     -- Đường dẫn âm thanh thuyết minh phát trên trình duyệt.
    NarrationSeconds         INT                       NULL,     -- Thời lượng âm thanh tính bằng giây; cần xác định trước khi chốt buổi.
    IsActive                 BIT                       NOT NULL, -- Cho phép sử dụng bản ghi; tắt không đồng nghĩa xóa lịch sử.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, lưu UTC; chưa cập nhật thì để trống.

    CONSTRAINT PK_Pois PRIMARY KEY (Id)
);

GO



-- 06. RouteStops — Thứ tự POI, thời gian dừng và góc quan sát trong tuyến.

CREATE TABLE dbo.RouteStops
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Mã định danh của bản ghi.
    RouteId                  UNIQUEIDENTIFIER          NOT NULL, -- Tuyến tham quan, tham chiếu Routes.Id.
    PoiId                    UNIQUEIDENTIFIER          NOT NULL, -- Điểm tham quan, tham chiếu Pois.Id.
    StopOrder                INT                       NOT NULL, -- Thứ tự POI trong tuyến, bắt đầu từ 1.
    DwellSeconds             INT                       NOT NULL, -- Thời gian dừng tại POI, tính bằng giây; cần đủ cho âm thanh và chuỗi góc.
    HeadStepsJson            NVARCHAR(MAX)             NOT NULL, -- Danh sách góc quan sát và thời gian giữ, ví dụ [{"preset":"RIGHT","holdSeconds":35}].

    CONSTRAINT PK_RouteStops PRIMARY KEY (Id),
    CONSTRAINT FK_RouteStops_RouteId FOREIGN KEY (RouteId) REFERENCES dbo.Routes(Id),
    CONSTRAINT FK_RouteStops_PoiId FOREIGN KEY (PoiId) REFERENCES dbo.Pois(Id)
);

GO



-- 07. Robots — Thông tin robot và buổi đang giữ quyền sử dụng robot.

CREATE TABLE dbo.Robots
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Mã định danh của bản ghi.
    RobotCode                NVARCHAR(100)             NOT NULL, -- Mã nhận diện robot trong hệ thống.
    SourceType               VARCHAR(20)               NOT NULL, -- Nguồn robot: PHYSICAL (thật), GAZEBO (mô phỏng) hoặc EMULATOR (giả lập).
    DisplayName              NVARCHAR(150)             NULL,     -- Tên robot hiển thị trên giao diện.
    CredentialHash           VARBINARY(256)            NOT NULL, -- Giá trị băm thông tin xác thực thiết bị; không lưu bí mật gốc.
    IsDispatchEnabled        BIT                       NOT NULL, -- Cho phép chọn robot để chạy buổi tham quan.
    NeedsInspection          BIT                       NOT NULL, -- Đánh dấu robot cần kiểm tra; chưa kiểm tra xong thì chưa được nhận buổi mới.
    CurrentTourId            UNIQUEIDENTIFIER          NULL,     -- Buổi đang giữ robot; chỉ xóa sau xác nhận giải phóng, kể cả buổi đã CANCELLED.
    LastAssignedAt           DATETIMEOFFSET(3)         NULL,     -- Thời điểm gán robot gần nhất, lưu UTC.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, lưu UTC; chưa cập nhật thì để trống.
    RowVersion               ROWVERSION                NOT NULL, -- Phiên bản SQL Server tự sinh khi ghi, dùng phát hiện cập nhật đồng thời; không phải thời gian.

    CONSTRAINT PK_Robots PRIMARY KEY (Id)
);

GO



-- 08. Tours — Buổi tham quan và tiến độ vận hành; mỗi buổi chạy một lần.

CREATE TABLE dbo.Tours
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Mã định danh của bản ghi.
    Name                     NVARCHAR(150)             NOT NULL, -- Tên hiển thị.
    Description              NVARCHAR(1000)            NULL,     -- Mô tả bổ sung.
    RouteId                  UNIQUEIDENTIFIER          NOT NULL, -- Tuyến tham quan, tham chiếu Routes.Id.
    ScheduledStartAt         DATETIMEOFFSET(3)         NOT NULL, -- Giờ bắt đầu dự kiến, lưu UTC; không tự khởi động robot theo giờ này.
    State                    VARCHAR(20)               NOT NULL, -- Trạng thái buổi: SCHEDULED, READY, RUNNING, COMPLETED hoặc CANCELLED.
    AssignedRobotId          UNIQUEIDENTIFIER          NULL,     -- Robot được gán, tham chiếu Robots.Id; giữ lại sau khi buổi kết thúc.
    OperationalStatus        VARCHAR(30)               NULL,     -- Khi RUNNING: NORMAL hoặc NEEDS_ASSISTANCE; ngoài RUNNING để trống.
    AssistanceReason         VARCHAR(100)              NULL,     -- Mã nguyên nhân cần hỗ trợ, ví dụ HEAD_FAILURE hoặc BACKEND_RESTART.
    CurrentStep              VARCHAR(30)               NULL,     -- Bước hiện tại: INITIALIZING, NAVIGATING, PREPARING_VIEW, OBSERVING, RETURNING_FRONT hoặc RETURNING_TO_END.
    CurrentLegId             UNIQUEIDENTIFIER          NULL,     -- Mã lần thực hiện chặng hiện tại, dùng đối chiếu kết quả và bỏ phản hồi cũ.
    CurrentLegKind           VARCHAR(30)               NULL,     -- Loại chặng: TO_POI tới điểm tham quan hoặc TO_END về điểm kết thúc.
    CurrentStopOrder         INT                       NULL,     -- Thứ tự POI đích/đang xử lý trong tuyến; chặng về điểm kết thúc để trống.
    LastArrivedStopOrder     INT                       NULL,     -- Thứ tự POI cuối đã tới hợp lệ; không đại diện vị trí robot hiện tại.
    CurrentStopVisitId       UNIQUEIDENTIFIER          NULL,     -- Mã lượt dừng hiện tại; thực hiện lại cùng POI phải dùng mã lượt mới.
    StopVisitClosedAt        DATETIMEOFFSET(3)         NULL,     -- Thời điểm đóng lượt dừng, lưu UTC; giúp nhận biết lượt đã xử lý Next.
    CurrentHeadCommandId     UNIQUEIDENTIFIER          NULL,     -- Mã lệnh đầu xoay đang theo dõi, dùng đối chiếu kết quả quay.
    IsHeld                   BIT                       NOT NULL, -- Staff đang giữ tại POI để ngăn tự chuyển chặng; không đồng nghĩa robot đang di chuyển đã dừng.
    DwellDeadlineAt          DATETIMEOFFSET(3)         NULL,     -- Mốc hết thời gian dừng, lưu UTC; không tự khôi phục bộ đếm sau khi backend khởi động lại.
    StartedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm Staff bắt đầu buổi thành công, lưu UTC.
    EndedAt                  DATETIMEOFFSET(3)         NULL,     -- Thời điểm hoàn thành hoặc kết thúc sớm, lưu UTC.
    EndReason                NVARCHAR(1000)            NULL,     -- Lý do kết thúc buổi, nhất là khi hủy hoặc dừng sớm.
    CreatedByUserId          UNIQUEIDENTIFIER          NOT NULL, -- Người tạo buổi, tham chiếu Users.Id.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, lưu UTC; chưa cập nhật thì để trống.
    RowVersion               ROWVERSION                NOT NULL, -- Phiên bản SQL Server tự sinh khi ghi, dùng phát hiện cập nhật đồng thời; không phải thời gian.

    CONSTRAINT PK_Tours PRIMARY KEY (Id),
    CONSTRAINT FK_Tours_RouteId FOREIGN KEY (RouteId) REFERENCES dbo.Routes(Id),
    CONSTRAINT FK_Tours_AssignedRobotId FOREIGN KEY (AssignedRobotId) REFERENCES dbo.Robots(Id),
    CONSTRAINT FK_Tours_CreatedByUserId FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id)
);

GO



-- 09. GroupRegistrations — Đăng ký đoàn, kết quả duyệt và thông tin mời tham gia.

CREATE TABLE dbo.GroupRegistrations
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Mã định danh của bản ghi.
    TourId                   UNIQUEIDENTIFIER          NOT NULL, -- Buổi tham quan liên quan, tham chiếu Tours.Id.
    RepresentativeUserId     UNIQUEIDENTIFIER          NOT NULL, -- Tài khoản đại diện trường, tham chiếu Users.Id; một đăng ký/người/buổi.
    SchoolName               NVARCHAR(200)             NOT NULL, -- Tên trường hoặc đoàn đăng ký.
    ContactName              NVARCHAR(150)             NOT NULL, -- Họ tên người đại diện liên hệ.
    ContactEmail             NVARCHAR(254)             NOT NULL, -- Email người đại diện để gửi thông tin tham gia.
    State                    VARCHAR(20)               NOT NULL, -- Trạng thái đăng ký: SUBMITTED, APPROVED, REJECTED hoặc CANCELLED.
    ReviewedByUserId         UNIQUEIDENTIFIER          NULL,     -- Admin đã duyệt hoặc từ chối, tham chiếu Users.Id.
    ReviewedAt               DATETIMEOFFSET(3)         NULL,     -- Thời điểm duyệt hoặc từ chối, lưu UTC.
    RejectionReason          NVARCHAR(1000)            NULL,     -- Lý do từ chối đăng ký; dùng khi REJECTED.
    GroupCodeHash            BINARY(32)                NOT NULL, -- Giá trị HMAC-SHA-256 của mã đoàn để đối chiếu cùng TourId.
    GroupCodeProtected       VARBINARY(MAX)            NOT NULL, -- Mã đoàn đã mã hóa để gửi lại email; khóa bảo vệ đặt ngoài database.
    InvitationSentAt         DATETIMEOFFSET(3)         NULL,     -- Lần gần nhất dịch vụ email chấp nhận gửi thành công; không chứng minh người nhận đã đọc.
    AccessVersion            INT                       NOT NULL, -- Phiên bản thu hồi quyền; tăng khi từ chối/hủy, không tăng chỉ vì sửa roster chờ duyệt lại.
    SubmittedAt              DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm gửi đăng ký gần nhất, lưu UTC.
    CancelledAt              DATETIMEOFFSET(3)         NULL,     -- Thời điểm hủy đăng ký, lưu UTC; để trống nếu chưa hủy.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, lưu UTC; chưa cập nhật thì để trống.
    RowVersion               ROWVERSION                NOT NULL, -- Phiên bản SQL Server tự sinh khi ghi, dùng phát hiện cập nhật đồng thời; không phải thời gian.

    CONSTRAINT PK_GroupRegistrations PRIMARY KEY (Id),
    CONSTRAINT FK_GroupRegistrations_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_GroupRegistrations_RepresentativeUserId FOREIGN KEY (RepresentativeUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_GroupRegistrations_ReviewedByUserId FOREIGN KEY (ReviewedByUserId) REFERENCES dbo.Users(Id)
);

GO



-- 10. RosterRows — Danh sách học sinh của đăng ký, nhập từ Excel.

CREATE TABLE dbo.RosterRows
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Mã định danh của bản ghi.
    RegistrationId           UNIQUEIDENTIFIER          NOT NULL, -- Đăng ký sở hữu dòng danh sách, tham chiếu GroupRegistrations.Id.
    RowNumber                INT                       NOT NULL, -- Thứ tự dòng đã nhập từ Excel; không phải mã học sinh.
    FullName                 NVARCHAR(150)             NOT NULL, -- Họ tên gốc có dấu để hiển thị; cho phép các học sinh trùng tên.
    ClassName                NVARCHAR(100)             NULL,     -- Tên lớp gốc; không cung cấp thì để trống.
    NormalizedFullName       NVARCHAR(150)             NOT NULL, -- Tên để so khớp: chuẩn hóa khoảng trắng/hoa-thường, NFD bỏ dấu kết hợp, đ -> d.
    NormalizedClassName      NVARCHAR(100)             NULL,     -- Lớp đã chuẩn hóa khoảng trắng/hoa-thường, giữ ký tự phân cách; không có lớp thì để trống.

    CONSTRAINT PK_RosterRows PRIMARY KEY (Id),
    CONSTRAINT FK_RosterRows_RegistrationId FOREIGN KEY (RegistrationId) REFERENCES dbo.GroupRegistrations(Id)
);

GO



-- 11. TourEvents — Nhật ký vận hành buổi tham quan.

CREATE TABLE dbo.TourEvents
(
    Id                       BIGINT IDENTITY(1,1)      NOT NULL, -- Số định danh sự kiện tự tăng.
    TourId                   UNIQUEIDENTIFIER          NOT NULL, -- Buổi tham quan liên quan, tham chiếu Tours.Id.
    EventType                NVARCHAR(80)              NOT NULL, -- Loại sự kiện vận hành: bắt đầu, kết quả chặng/đầu xoay, cần hỗ trợ hoặc kết thúc.
    OccurredAt               DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm xảy ra sự kiện, lưu UTC.
    RobotId                  UNIQUEIDENTIFIER          NULL,     -- Robot liên quan, tham chiếu Robots.Id.
    LegId                    UNIQUEIDENTIFIER        NULL,     -- Mã lần thực hiện chặng liên quan; không có bảng TourLeg riêng.
    LegKind                  VARCHAR(30)               NULL,     -- Loại chặng TO_POI hoặc TO_END; không gắn chặng thì để trống.
    StopVisitId              UNIQUEIDENTIFIER          NULL,     -- Mã lượt dừng liên quan; không tạo bảng lượt dừng riêng.
    CommandId                UNIQUEIDENTIFIER          NULL,     -- Mã lệnh liên quan; nhiều sự kiện nhận lệnh/hoàn tất có thể dùng cùng mã.
    TargetPoiId              UNIQUEIDENTIFIER          NULL,     -- POI đích nếu có, tham chiếu Pois.Id.
    TargetStopOrder          INT                       NULL,     -- Thứ tự POI đích lúc phát lệnh; chặng về điểm kết thúc để trống.
    TargetMapKey             NVARCHAR(100)             NULL,     -- Mã bản đồ chụp lại tại thời điểm phát lệnh.
    TargetMapFrame           NVARCHAR(100)             NULL,     -- Hệ tọa độ chụp lại tại thời điểm phát lệnh.
    TargetX                  DECIMAL(10,4)             NULL,     -- Tọa độ X đích lúc phát lệnh, đơn vị mét; giữ đúng lịch sử khi sửa POI.
    TargetY                  DECIMAL(10,4)             NULL,     -- Tọa độ Y đích lúc phát lệnh, đơn vị mét.
    TargetYaw                DECIMAL(9,6)              NULL,     -- Góc hướng đích lúc phát lệnh, đơn vị radian.
    ActorUserId              UNIQUEIDENTIFIER          NULL,     -- Người thao tác, tham chiếu Users.Id; tự động thì để trống.
    ReasonCode               NVARCHAR(100)             NULL,     -- Mã lý do của sự kiện hoặc lỗi.
    ReasonNote               NVARCHAR(2000)            NULL,     -- Giải thích ngắn cho sự kiện hoặc lỗi.
    DataJson                 NVARCHAR(MAX)             NULL,     -- Dữ liệu bổ sung theo loại sự kiện; không chép toàn bộ danh sách học sinh hoặc bí mật.

    CONSTRAINT PK_TourEvents PRIMARY KEY (Id),
    CONSTRAINT FK_TourEvents_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_TourEvents_RobotId FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
    CONSTRAINT FK_TourEvents_TargetPoiId FOREIGN KEY (TargetPoiId) REFERENCES dbo.Pois(Id),
    CONSTRAINT FK_TourEvents_ActorUserId FOREIGN KEY (ActorUserId) REFERENCES dbo.Users(Id)
);

GO



-- 12. AuditLogs — Nhật ký thao tác quản trị và đăng ký đoàn.

CREATE TABLE dbo.AuditLogs
(
    Id                       BIGINT IDENTITY(1,1)      NOT NULL, -- Số định danh nhật ký tự tăng.
    ActorUserId              UNIQUEIDENTIFIER          NOT NULL, -- Người thực hiện thao tác quản trị/đăng ký, tham chiếu Users.Id.
    [Action]                 NVARCHAR(50)              NOT NULL, -- Thao tác đã thực hiện, ví dụ tạo, sửa, duyệt, từ chối hoặc gửi email.
    EntityType               NVARCHAR(50)              NOT NULL, -- Loại đối tượng bị tác động, ví dụ TOUR hoặc GROUP_REGISTRATION.
    EntityId                 NVARCHAR(100)             NOT NULL, -- Mã đối tượng dưới dạng chuỗi để tra cứu; có thể thuộc nhiều loại bảng.
    ChangesJson              NVARCHAR(MAX)             NULL,     -- Các thay đổi được phép ghi; không lưu danh sách học sinh, email, mật khẩu, mã đoàn hoặc token.
    OccurredAt               DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm xảy ra sự kiện, lưu UTC.

    CONSTRAINT PK_AuditLogs PRIMARY KEY (Id),
    CONSTRAINT FK_AuditLogs_ActorUserId FOREIGN KEY (ActorUserId) REFERENCES dbo.Users(Id)
);

GO



-- Hai bảng tham chiếu lẫn nhau nên thêm FK này sau khi đã tạo Tours.
ALTER TABLE dbo.Robots
ADD CONSTRAINT FK_Robots_CurrentTourId
    FOREIGN KEY (CurrentTourId) REFERENCES dbo.Tours(Id);
GO

-- FK trên chỉ kiểm tra Tour tồn tại; backend vẫn phải giữ assignment hai chiều nhất quán.
-- CurrentStopOrder/LastArrivedStopOrder là thứ tự trong tuyến, chưa khai báo FK theo thứ tự.
-- Ràng buộc duy nhất theo tuyến và các kiểm tra nghiệp vụ sẽ bổ sung ở bước sau.
