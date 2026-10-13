/*
CAMPUS TOUR DT-AMR — DATABASE SCHEMA SNAPSHOT v1.1

Baseline trước: backend/database/smart-campus-tour-schema-v1.0.sql
Nguồn nghiệp vụ hiện hành:
- docs/requirements/campus-tour-scope.md
- docs/decisions/0009-review-1-tour-business-scope.md
- docs/decisions/0010-personal-access-code-entry.md
- docs/decisions/0011-student-data-use-for-tour.md
- docs/decisions/0012-v1-1-schema-and-operation-scope.md

Mục tiêu của v1.1:
- Thay flow group-code + matching tên/lớp bằng invitation + mã truy cập + browser session.
- Hỗ trợ dòng Excel cá nhân / điểm xem chung.
- Hỗ trợ nhánh đã chuẩn bị, bật theo Tour và yêu cầu đổi nhánh có Staff quyết định.
- Khép kín release robot sau End Early/lỗi và giữ audit đủ để debug.
- Giữ dữ liệu học sinh trong phạm vi đăng ký/lời mời/thống kê Tour; không CRM/tuyển sinh.

Đây là FULL SNAPSHOT tạo mới database trống, KHÔNG phải migration từ v1.0.
Giữ file v1.0 để đối chiếu/debug; không ghi đè file cũ.

Bản này chốt TABLE / COLUMN / PK / FK, UNIQUE/index và thuộc tính IDENTITY/ROWVERSION theo ADR-0012.
CHECK và DEFAULT chưa bổ sung; ứng dụng phải cấp đủ giá trị và kiểm tra miền trạng thái.
Các giá trị trạng thái trong comment là hợp đồng thiết kế, chưa được DB CHECK ở bản này.
PK tự tạo unique clustered index trong SQL Server; các index nghiệp vụ bổ sung nằm cuối file.
Review fields/ID/PK/FK/index: backend/database/schema-v1.1-review.md.
Comment mô tả ý nghĩa dự kiến; không thay thế constraint hoặc validation đã triển khai.
*/


-- SET options cần cho filtered indexes, áp dụng cả connection thực hiện DML.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- 01. Users — Tài khoản Admin, Staff và đại diện trường. Student không có account riêng.
CREATE TABLE dbo.Users
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    Username                 NVARCHAR(100)             NOT NULL, -- Tên đăng nhập của Admin, Staff hoặc đại diện trường.
    NormalizedUsername       NVARCHAR(100)             NOT NULL, -- Tên đăng nhập đã chuẩn hóa; UNIQUE ngăn trùng theo collation của DB.
    PasswordHash             NVARCHAR(MAX)             NOT NULL, -- Mật khẩu đã băm; không lưu mật khẩu gốc.
    FullName                 NVARCHAR(150)             NOT NULL, -- Họ tên hiển thị.
    IsActive                 BIT                       NOT NULL, -- Cho phép sử dụng account; tắt không xóa lịch sử.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.

    CONSTRAINT UQ_Users_NormalizedUsername UNIQUE (NormalizedUsername),
    CONSTRAINT PK_Users PRIMARY KEY (Id)
);
GO


-- 02. UserRoles — V1 auth yêu cầu đúng một role được hỗ trợ trên mỗi account; PK ghép hiện có giữ nguyên.
CREATE TABLE dbo.UserRoles
(
    UserId                   UNIQUEIDENTIFIER          NOT NULL, -- Tham chiếu Users.Id.
    Role                     VARCHAR(32)               NOT NULL, -- ADMIN, STAFF, SCHOOL_REPRESENTATIVE.

    CONSTRAINT PK_UserRoles PRIMARY KEY (UserId, Role),
    CONSTRAINT FK_UserRoles_UserId FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
);
GO


-- 03. RefreshTokens — Refresh token cho account đăng nhập; không dùng cho Student invitation session.
CREATE TABLE dbo.RefreshTokens
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    UserId                   UNIQUEIDENTIFIER          NOT NULL, -- FK tới Users.Id.
    TokenHash                BINARY(32)                NOT NULL, -- SHA-256 của refresh token; không lưu token gốc.
    ExpiresAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm hết hạn refresh token, UTC; quá hạn phải từ chối sử dụng.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    RevokedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm thu hồi, UTC; NULL là chưa thu hồi, vẫn phải kiểm tra ExpiresAt.

    CONSTRAINT UQ_RefreshTokens_Token UNIQUE (TokenHash),
    CONSTRAINT PK_RefreshTokens PRIMARY KEY (Id),
    CONSTRAINT FK_RefreshTokens_UserId FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
);
GO


-- 04. Routes — Tuyến hoàn chỉnh đã được đội kỹ thuật chuẩn bị/kiểm chứng.
CREATE TABLE dbo.Routes
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    Name                     NVARCHAR(150)             NOT NULL, -- Tên hiển thị; không dùng thay cho khóa định danh.
    Description              NVARCHAR(1000)            NULL,     -- Mô tả bổ sung; NULL nếu không có.
    MapKey                   NVARCHAR(100)             NOT NULL, -- Khóa bản đồ dùng diễn giải tọa độ; phải khớp map của robot, hiện không có bảng Maps để làm FK.
    MapFrame                 NVARCHAR(100)             NOT NULL, -- Tên frame tọa độ, ví dụ map; phải khớp ngữ cảnh bản đồ và contract robot.
    StartX                   DECIMAL(10,4)             NOT NULL, -- Tọa độ X điểm bắt đầu, đơn vị mét trong MapKey/MapFrame.
    StartY                   DECIMAL(10,4)             NOT NULL, -- Tọa độ Y điểm bắt đầu, đơn vị mét trong MapKey/MapFrame.
    StartYaw                 DECIMAL(9,6)              NOT NULL, -- Góc hướng thân tại điểm bắt đầu, radian; không phải góc camera.
    EndMode                  VARCHAR(20)               NOT NULL, -- LAST_POI: kết thúc tại POI cuối; POSE: dùng bộ EndX/EndY/EndYaw.
    EndX                     DECIMAL(10,4)             NULL,     -- Tọa độ X điểm kết thúc, mét; cần có khi EndMode = POSE.
    EndY                     DECIMAL(10,4)             NULL,     -- Tọa độ Y điểm kết thúc, mét; cần có khi EndMode = POSE.
    EndYaw                   DECIMAL(9,6)              NULL,     -- Góc hướng thân tại điểm kết thúc, radian; cần có khi EndMode = POSE.
    IsActive                 BIT                       NOT NULL, -- Cho phép dùng cấu hình cho lựa chọn mới; tắt không xóa bản ghi hay lịch sử.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.

    CONSTRAINT PK_Routes PRIMARY KEY (Id)
);
GO


-- 05. Pois — Điểm tham quan, pose đích và nội dung trình bày.
CREATE TABLE dbo.Pois
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    Name                     NVARCHAR(150)             NOT NULL, -- Tên hiển thị; không dùng thay cho khóa định danh.
    Description              NVARCHAR(2000)            NULL,     -- Mô tả bổ sung; NULL nếu không có.
    MapKey                   NVARCHAR(100)             NOT NULL, -- Khóa bản đồ dùng diễn giải tọa độ; phải khớp map của robot, hiện không có bảng Maps để làm FK.
    MapFrame                 NVARCHAR(100)             NOT NULL, -- Tên frame tọa độ, ví dụ map; phải khớp ngữ cảnh bản đồ và contract robot.
    X                        DECIMAL(10,4)             NOT NULL, -- Tọa độ X đích navigation tại POI, mét trong MapKey/MapFrame.
    Y                        DECIMAL(10,4)             NOT NULL, -- Tọa độ Y đích navigation tại POI, mét trong MapKey/MapFrame.
    Yaw                      DECIMAL(9,6)              NOT NULL, -- Góc hướng thân tại đích POI, radian; độc lập với preset đầu/camera.
    NarrationText            NVARCHAR(MAX)             NULL,     -- Nội dung thuyết minh đã chuẩn bị; NULL khi chưa cấu hình, cần kiểm tra trước READY.
    AudioUrl                 NVARCHAR(1000)            NULL,     -- Địa chỉ asset audio thuyết minh chuẩn bị sẵn; NULL khi chưa có.
    NarrationSeconds         INT                       NULL,     -- Thời lượng audio thuyết minh, giây; dùng đối chiếu dwell trước READY.
    FallbackVideoUrl         NVARCHAR(1000)            NULL,     -- Video ghi sẵn theo POI nếu có.
    IsActive                 BIT                       NOT NULL, -- Cho phép dùng cấu hình cho lựa chọn mới; tắt không xóa bản ghi hay lịch sử.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.
    RowVersion               ROWVERSION                NOT NULL, -- Token cạnh tranh do SQL Server cấp; ngăn ghi đè cập nhật POI.

    CONSTRAINT PK_Pois PRIMARY KEY (Id)
);
GO


-- 06. RouteStops — Thứ tự POI, dwell và chuỗi góc quan sát của một Route.
CREATE TABLE dbo.RouteStops
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    RouteId                  UNIQUEIDENTIFIER          NOT NULL, -- FK tới Routes.Id.
    PoiId                    UNIQUEIDENTIFIER          NOT NULL, -- FK tới Pois.Id.
    StopOrder                INT                       NOT NULL, -- Thứ tự điểm dừng trong Route, bắt đầu từ 1; UNIQUE(RouteId, StopOrder).
    DwellSeconds             INT                       NOT NULL, -- Thời gian quan sát cố định theo Route, giây; kỹ thuật seed/kiểm chứng, Admin không chỉnh riêng theo Tour.
    HeadStepsJson            NVARCHAR(MAX)             NOT NULL, -- Chuỗi preset đầu và thời gian giữ, ví dụ [{"preset":"RIGHT","holdSeconds":35}]; chưa có CHECK JSON.

    CONSTRAINT UQ_RouteStops_Order UNIQUE (RouteId, StopOrder),
    CONSTRAINT PK_RouteStops PRIMARY KEY (Id),
    CONSTRAINT FK_RouteStops_RouteId FOREIGN KEY (RouteId) REFERENCES dbo.Routes(Id),
    CONSTRAINT FK_RouteStops_PoiId FOREIGN KEY (PoiId) REFERENCES dbo.Pois(Id)
);
GO


-- 07. RouteVariants — Nhánh đã chuẩn bị: tại một stop của route gốc có thể chuyển sang route biến thể.
-- Route biến thể là một Route hoàn chỉnh đã được kiểm chứng; backend phải bảo đảm hai route khớp ngữ cảnh/map
-- và điểm phân nhánh tương ứng trước khi cho phép dùng.
CREATE TABLE dbo.RouteVariants
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    BaseRouteId              UNIQUEIDENTIFIER          NOT NULL, -- FK tới Routes.Id; tuyến gốc có điểm cho phép chọn nhánh.
    BranchPointRouteStopId   UNIQUEIDENTIFIER          NOT NULL, -- FK tới RouteStops.Id; cần thuộc BaseRouteId, FK hiện tại chưa ràng buộc cặp này.
    VariantRouteId           UNIQUEIDENTIFIER          NOT NULL, -- FK tới Routes.Id; tuyến hoàn chỉnh sẽ có hiệu lực khi nhánh được Accept.
    VariantBranchStopId      UNIQUEIDENTIFIER          NOT NULL, -- FK tới RouteStops.Id; cần thuộc VariantRouteId và tương ứng điểm phân nhánh, chưa được FK kép bảo đảm.
    Name                     NVARCHAR(150)             NOT NULL, -- Tên hiển thị; không dùng thay cho khóa định danh.
    Description              NVARCHAR(1000)            NULL,     -- Mô tả bổ sung; NULL nếu không có.
    IsActive                 BIT                       NOT NULL, -- Cho phép dùng cấu hình cho lựa chọn mới; tắt không xóa bản ghi hay lịch sử.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.

    CONSTRAINT PK_RouteVariants PRIMARY KEY (Id),
    CONSTRAINT FK_RouteVariants_BaseRouteId FOREIGN KEY (BaseRouteId) REFERENCES dbo.Routes(Id),
    CONSTRAINT FK_RouteVariants_BranchPointRouteStopId FOREIGN KEY (BranchPointRouteStopId) REFERENCES dbo.RouteStops(Id),
    CONSTRAINT FK_RouteVariants_VariantRouteId FOREIGN KEY (VariantRouteId) REFERENCES dbo.Routes(Id),
    CONSTRAINT FK_RouteVariants_VariantBranchStopId FOREIGN KEY (VariantBranchStopId) REFERENCES dbo.RouteStops(Id)
);
GO


-- 08. Robots — Physical/Gazebo/Emulator và quyền giữ Tour hiện tại.
CREATE TABLE dbo.Robots
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    RobotCode                NVARCHAR(100)             NOT NULL, -- Mã robot duy nhất dùng trên contract fleet, ví dụ robot_01; khác Id GUID nội bộ.
    SourceType               VARCHAR(20)               NOT NULL, -- PHYSICAL, GAZEBO, EMULATOR.
    DisplayName              NVARCHAR(150)             NULL,     -- Tên robot hiển thị trên dashboard; NULL nếu dùng RobotCode.
    CredentialHash           VARBINARY(256)            NOT NULL, -- Bản băm thông tin xác thực máy robot; không lưu credential gốc, thuật toán/định dạng cần thống nhất.
    IsDispatchEnabled        BIT                       NOT NULL, -- Cho phép xét robot khi chọn phân công; TRUE không thay thế kiểm tra readiness/NeedsInspection.
    NeedsInspection          BIT                       NOT NULL, -- TRUE sau lỗi/End Early cho tới khi Staff xác nhận và backend release hợp lệ.
    CurrentTourId            UNIQUEIDENTIFIER          NULL,     -- FK tới Tours.Id; Tour đang giữ robot, kể cả sau End Early cho đến release hợp lệ.
    LastAssignedAt           DATETIMEOFFSET(3)         NULL,     -- Thời điểm phân công gần nhất, UTC; NULL nếu chưa từng được phân công.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.
    RowVersion               ROWVERSION                NOT NULL, -- Token nhị phân 8 byte do SQL Server tự đổi khi ghi; dùng phát hiện cập nhật cạnh tranh, không phải thời gian.

    CONSTRAINT UQ_Robots_RobotCode UNIQUE (RobotCode),
    CONSTRAINT PK_Robots PRIMARY KEY (Id)
);
GO


-- 09. Tours — Buổi tham quan và tiến độ vận hành; mỗi Tour chạy một lần.
CREATE TABLE dbo.Tours
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    Name                     NVARCHAR(150)             NOT NULL, -- Tên hiển thị; không dùng thay cho khóa định danh.
    Description              NVARCHAR(1000)            NULL,     -- Mô tả bổ sung; NULL nếu không có.
    RouteId                  UNIQUEIDENTIFIER          NOT NULL, -- FK tới Routes.Id; tuyến cơ sở được khóa khi READY.
    ActiveRouteId            UNIQUEIDENTIFIER          NOT NULL, -- FK tới Routes.Id; ban đầu bằng RouteId, đổi sang tuyến biến thể khi nhánh được Accept.
    ScheduledStartAt         DATETIMEOFFSET(3)         NOT NULL, -- Giờ công bố của buổi, UTC; Staff không được Start trước mốc này.
    State                    VARCHAR(20)               NOT NULL, -- SCHEDULED, READY, RUNNING, COMPLETED, CANCELLED.
    AssignedRobotId          UNIQUEIDENTIFIER          NULL,     -- FK tới Robots.Id; NULL trước phân công, giữ ID sau kết thúc để truy vết, không đồng nghĩa robot còn bị giữ.
    OperationalStatus        VARCHAR(30)               NULL,     -- RUNNING: NORMAL hoặc NEEDS_ASSISTANCE.
    AssistanceReason         VARCHAR(100)              NULL,     -- Mã nguyên nhân cần hỗ trợ dùng cho logic; NULL khi không có, không phải mô tả tiếng Việt tự do.
    CurrentStep              VARCHAR(30)               NULL,     -- INITIALIZING, NAVIGATING, PREPARING_VIEW, OBSERVING, RETURNING_FRONT, RETURNING_TO_END.
    CurrentLegId             UNIQUEIDENTIFIER          NULL,     -- GUID tương quan lần thực thi chặng hiện tại; không phải FK vì không có bảng Leg.
    CurrentLegKind           VARCHAR(30)               NULL,     -- TO_POI hoặc TO_END.
    CurrentRouteStopId       UNIQUEIDENTIFIER          NULL,     -- FK tới RouteStops.Id; stop hiện tại/đích trên ActiveRouteId, chuyển sang stop tương ứng sau Accept hợp lệ.
    LastArrivedRouteStopId   UNIQUEIDENTIFIER          NULL,     -- FK tới RouteStops.Id; arrival thực tế gần nhất, giữ stop tuyến cũ sau Accept cho tới arrival mới.
    CurrentStopVisitId       UNIQUEIDENTIFIER          NULL,     -- GUID của lượt xử lý POI hiện tại; phân biệt chạy lại cùng POI, không có bảng Visit để làm FK.
    StopVisitClosedAt        DATETIMEOFFSET(3)         NULL,     -- Thời điểm đóng lượt POI hiện tại, UTC; NULL khi chưa đóng/chưa có lượt, dùng cùng CurrentStopVisitId.
    CurrentHeadCommandId     UNIQUEIDENTIFIER          NULL,     -- GUID tương quan lần ra lệnh đầu/camera hiện tại; không phải FK tới bảng lệnh.
    IsHeld                   BIT                       NOT NULL, -- Giữ quan sát tại POI; không phải dừng khẩn cấp hay tạm dừng robot giữa chặng.
    DwellDeadlineAt          DATETIMEOFFSET(3)         NULL,     -- Mốc hết thời gian quan sát, UTC; NULL khi chưa đặt/không áp dụng, không tự khôi phục timer sau restart.
    FallbackVideoUrl         NVARCHAR(1000)            NULL,     -- Video tổng quan dự phòng nếu Tour dùng một video chung.
    StartedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm buổi thực sự bắt đầu, UTC; NULL nếu chưa từng Start.
    EndedAt                  DATETIMEOFFSET(3)         NULL,     -- Thời điểm buổi chuyển COMPLETED/CANCELLED, UTC; không chứng minh robot đã dừng hoặc được release.
    EndReason                NVARCHAR(1000)            NULL,     -- Lý do kết thúc/hủy dạng mô tả; NULL khi chưa có, không dùng chuỗi tự do làm mã trạng thái.
    CreatedByUserId          UNIQUEIDENTIFIER          NOT NULL, -- FK tới Users.Id.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.
    RowVersion               ROWVERSION                NOT NULL, -- Token nhị phân 8 byte do SQL Server tự đổi khi ghi; dùng phát hiện cập nhật cạnh tranh, không phải thời gian.

    CONSTRAINT PK_Tours PRIMARY KEY (Id),
    CONSTRAINT FK_Tours_RouteId FOREIGN KEY (RouteId) REFERENCES dbo.Routes(Id),
    CONSTRAINT FK_Tours_ActiveRouteId FOREIGN KEY (ActiveRouteId) REFERENCES dbo.Routes(Id),
    CONSTRAINT FK_Tours_CurrentRouteStopId FOREIGN KEY (CurrentRouteStopId) REFERENCES dbo.RouteStops(Id),
    CONSTRAINT FK_Tours_LastArrivedRouteStopId FOREIGN KEY (LastArrivedRouteStopId) REFERENCES dbo.RouteStops(Id),
    CONSTRAINT FK_Tours_AssignedRobotId FOREIGN KEY (AssignedRobotId) REFERENCES dbo.Robots(Id),
    CONSTRAINT FK_Tours_CreatedByUserId FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id)
);
GO


-- 10. TourAllowedBranches — Các nhánh đã chuẩn bị mà Admin bật/tắt cho đúng Tour trước READY.
CREATE TABLE dbo.TourAllowedBranches
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    TourId                   UNIQUEIDENTIFIER          NOT NULL, -- FK tới Tours.Id.
    RouteVariantId           UNIQUEIDENTIFIER          NOT NULL, -- FK tới RouteVariants.Id.
    IsEnabled                BIT                       NOT NULL, -- Admin cho phép dùng nhánh cho Tour này; tập cấu hình phải khóa khi READY.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.
    RowVersion               ROWVERSION                NOT NULL, -- Token nhị phân 8 byte do SQL Server tự đổi khi ghi; dùng phát hiện cập nhật cạnh tranh, không phải thời gian.

    CONSTRAINT UQ_TourAllowedBranches_Variant UNIQUE (TourId, RouteVariantId),
    CONSTRAINT PK_TourAllowedBranches PRIMARY KEY (Id),
    CONSTRAINT FK_TourAllowedBranches_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_TourAllowedBranches_RouteVariantId FOREIGN KEY (RouteVariantId) REFERENCES dbo.RouteVariants(Id)
);
GO


-- 11. GroupRegistrations — Một đại diện có thể tạo nhiều nhóm/đăng ký cho cùng Tour.
CREATE TABLE dbo.GroupRegistrations
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    TourId                   UNIQUEIDENTIFIER          NOT NULL, -- FK tới Tours.Id.
    RepresentativeUserId     UNIQUEIDENTIFIER          NOT NULL, -- FK tới Users.Id.
    SchoolName               NVARCHAR(200)             NOT NULL, -- Tên trường đăng ký; dữ liệu của đoàn, không có bảng School riêng.
    GroupName                NVARCHAR(200)             NOT NULL, -- Tên nhóm/phòng/đoàn để phân biệt nhiều registration cùng Tour.
    ContactName              NVARCHAR(150)             NOT NULL, -- Họ tên người liên hệ của đoàn; không phải tên mọi người xem.
    ContactEmail             NVARCHAR(254)             NOT NULL, -- Email liên hệ đoàn; khác email nhận mã của từng RosterRow.
    State                    VARCHAR(20)               NOT NULL, -- SUBMITTED, APPROVED, REJECTED, CANCELLED.
    ReviewedByUserId         UNIQUEIDENTIFIER          NULL,     -- FK tới Users.Id.
    ReviewedAt               DATETIMEOFFSET(3)         NULL,     -- Thời điểm duyệt/từ chối gần nhất, UTC; NULL khi chưa xét.
    RejectionReason          NVARCHAR(1000)            NULL,     -- Lý do từ chối cho đại diện xem; NULL khi chưa có quyết định từ chối.
    SubmittedAt              DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm gửi đăng ký để xét duyệt, UTC; quy ước cập nhật khi gửi lại cần thống nhất ở use case.
    CancelledAt              DATETIMEOFFSET(3)         NULL,     -- Thời điểm hủy đăng ký, UTC; NULL nếu chưa hủy.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.
    RowVersion               ROWVERSION                NOT NULL, -- Token nhị phân 8 byte do SQL Server tự đổi khi ghi; dùng phát hiện cập nhật cạnh tranh, không phải thời gian.

    CONSTRAINT PK_GroupRegistrations PRIMARY KEY (Id),
    CONSTRAINT FK_GroupRegistrations_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_GroupRegistrations_RepresentativeUserId FOREIGN KEY (RepresentativeUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_GroupRegistrations_ReviewedByUserId FOREIGN KEY (ReviewedByUserId) REFERENCES dbo.Users(Id)
);
GO


-- 12. RosterRows — Dòng Excel đã import; có thể là cá nhân hoặc điểm xem chung.
CREATE TABLE dbo.RosterRows
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    RegistrationId           UNIQUEIDENTIFIER          NOT NULL, -- FK tới GroupRegistrations.Id.
    RowNumber                INT                       NOT NULL, -- Số dòng nguồn để báo lỗi/preview; không phải mã học sinh.
    RowType                  VARCHAR(30)               NOT NULL, -- INDIVIDUAL hoặc SHARED_VIEWING; import map từ CA_NHAN/DIEM_XEM_CHUNG.
    DisplayName              NVARCHAR(150)             NOT NULL, -- Họ tên cá nhân hoặc tên điểm xem chung.
    Email                    NVARCHAR(254)             NOT NULL, -- Email nhận link + Mã truy cập.
    ClassName                NVARCHAR(100)             NULL,     -- Tên lớp tùy chọn theo Excel; không dùng matching tên/lớp để cấp quyền.
    IsActive                 BIT                       NOT NULL, -- FALSE khi roster cũ bị thay; giữ tham chiếu lịch sử, không có nghĩa giữ PII vô thời hạn (ADR-0011).
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.
    RowVersion               ROWVERSION                NOT NULL, -- Token nhị phân 8 byte do SQL Server tự đổi khi ghi; dùng phát hiện cập nhật cạnh tranh, không phải thời gian.

    CONSTRAINT PK_RosterRows PRIMARY KEY (Id),
    CONSTRAINT FK_RosterRows_RegistrationId FOREIGN KEY (RegistrationId) REFERENCES dbo.GroupRegistrations(Id)
);
GO


-- 13. Invitations — Một lời mời hiện hành cho một dòng roster đã duyệt.
-- Mã truy cập phải vừa kiểm tra được vừa gửi lại được: hash để validate, bản mã hóa để resend cùng mã hiện hành.
-- Khóa mã hóa/bảo vệ đặt ngoài database.
CREATE TABLE dbo.Invitations
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    RosterRowId              UNIQUEIDENTIFIER          NOT NULL, -- FK tới RosterRows.Id.
    AccessCodeHash           BINARY(32)                NOT NULL, -- HMAC-SHA256 (32 byte) của mã đã chuẩn hóa; khóa ngoài DB, UNIQUE toàn cục; không log mã gốc.
    AccessCodeProtected      VARBINARY(MAX)            NOT NULL, -- Mã truy cập hiện hành đã bảo vệ để gửi lại cùng mã.
    AccessVersion            INT                       NOT NULL, -- Tăng khi thu hồi/cấp mã mới; không tăng khi chỉ resend email.
    CodeIssuedAt             DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm cấp mã hiện hành, UTC; đổi khi reissue, không đổi khi chỉ resend.
    ExpiresAt                DATETIMEOFFSET(3)         NOT NULL, -- Hạn lời mời/mã; cấp mới không tự kéo dài hạn.
    RevokedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm thu hồi, UTC; NULL chỉ là chưa thu hồi, còn phải kiểm tra hạn và quyền registration/Tour.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.
    RowVersion               ROWVERSION                NOT NULL, -- Token nhị phân 8 byte do SQL Server tự đổi khi ghi; dùng phát hiện cập nhật cạnh tranh, không phải thời gian.

    CONSTRAINT UQ_Invitations_RosterRow UNIQUE (RosterRowId),
    CONSTRAINT UQ_Invitations_CodeHash UNIQUE (AccessCodeHash),
    CONSTRAINT PK_Invitations PRIMARY KEY (Id),
    CONSTRAINT FK_Invitations_RosterRowId FOREIGN KEY (RosterRowId) REFERENCES dbo.RosterRows(Id)
);
GO


-- 14. BrowserSessions — Session Student/shared-viewing tạo sau khi nhập Mã truy cập hợp lệ.
-- UNIQUE lọc giữ tối đa một session chưa đóng/invitation; đóng phiên quá hạn trong transaction trước cấp mới.
CREATE TABLE dbo.BrowserSessions
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    InvitationId             UNIQUEIDENTIFIER          NOT NULL, -- FK tới Invitations.Id.
    SessionTokenHash         BINARY(32)                NOT NULL, -- Chỉ lưu hash của session token/cookie secret.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    LastSeenAt               DATETIMEOFFSET(3)         NULL,     -- Dùng cho giữ kết nối/reconnect hữu hạn; không phải attendance.
    ExpiresAt                DATETIMEOFFSET(3)         NOT NULL, -- Hạn session browser, UTC; backend vẫn phải kiểm tra hạn/quyền của invitation.
    EndedAt                  DATETIMEOFFSET(3)         NULL,     -- Thời điểm đóng session, UTC; NULL là chưa đóng trong DB, vẫn có thể đã hết ExpiresAt.
    EndReason                VARCHAR(30)               NULL,     -- LOGOUT, EXPIRED, REVOKED, REISSUED, IDLE_TIMEOUT (hết khoảng giữ kết nối; không phải không bấm nút).

    CONSTRAINT UQ_BrowserSessions_Token UNIQUE (SessionTokenHash),
    CONSTRAINT PK_BrowserSessions PRIMARY KEY (Id),
    CONSTRAINT FK_BrowserSessions_InvitationId FOREIGN KEY (InvitationId) REFERENCES dbo.Invitations(Id)
);
GO


-- 15. BranchRequests — Yêu cầu đổi nhánh của Representative hoặc lựa chọn trực tiếp của Staff.
-- Với REPRESENTATIVE, RegistrationId phải thuộc đúng Tour và user sở hữu registration đó; backend kiểm tra.
-- Với STAFF_DIRECT, RegistrationId có thể NULL và bản ghi có thể được tạo ACCEPTED ngay trong transaction quyết định.
-- Đóng lượt/NEEDS_ASSISTANCE phải hết hạn request cũ nguyên tử; recovery không hồi sinh request đã đóng.
CREATE TABLE dbo.BranchRequests
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    TourId                   UNIQUEIDENTIFIER          NOT NULL, -- FK tới Tours.Id.
    BranchPointRouteStopId   UNIQUEIDENTIFIER          NOT NULL, -- FK tới RouteStops.Id; backend lấy từ variant, phải khớp điểm phân nhánh và Tour; không tin ID client.
    TourAllowedBranchId      UNIQUEIDENTIFIER          NOT NULL, -- FK tới TourAllowedBranches.Id; nhánh phải thuộc TourId của yêu cầu, FK đơn hiện chưa bảo đảm.
    RegistrationId           UNIQUEIDENTIFIER          NULL,     -- FK tới GroupRegistrations.Id; đoàn gửi yêu cầu phải cùng Tour; STAFF_DIRECT có thể NULL.
    RequestedByUserId        UNIQUEIDENTIFIER          NOT NULL, -- FK tới Users.Id; người gửi, phải là chủ đoàn với REPRESENTATIVE hoặc Staff có quyền với STAFF_DIRECT.
    RequestSource            VARCHAR(20)               NOT NULL, -- REPRESENTATIVE hoặc STAFF_DIRECT.
    State                    VARCHAR(20)               NOT NULL, -- PENDING, ACCEPTED, REJECTED, EXPIRED.
    RequestedAt              DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm gửi yêu cầu, UTC; không thay thế định danh lượt phân nhánh.
    ResolvedByUserId         UNIQUEIDENTIFIER          NULL,     -- FK tới Users.Id; người quyết định, có thể NULL nếu chưa xử lý hoặc system cho hết hạn.
    ResolvedAt               DATETIMEOFFSET(3)         NULL,     -- Thời điểm chốt ACCEPTED/REJECTED/EXPIRED, UTC; NULL khi PENDING.
    DecisionReason           NVARCHAR(1000)            NULL,     -- Lý do quyết định cho người dùng đọc; NULL nếu chưa có.
    ExpiredReason            VARCHAR(100)              NULL,     -- Mã nguyên nhân hết hạn, ví dụ lượt đã đóng/quyền bị thu hồi; NULL nếu không áp dụng.
    RowVersion               ROWVERSION                NOT NULL, -- Token nhị phân 8 byte do SQL Server tự đổi khi ghi; dùng phát hiện cập nhật cạnh tranh, không phải thời gian.

    CONSTRAINT PK_BranchRequests PRIMARY KEY (Id),
    CONSTRAINT FK_BranchRequests_BranchPointRouteStopId FOREIGN KEY (BranchPointRouteStopId) REFERENCES dbo.RouteStops(Id),
    CONSTRAINT FK_BranchRequests_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_BranchRequests_TourAllowedBranchId FOREIGN KEY (TourAllowedBranchId) REFERENCES dbo.TourAllowedBranches(Id),
    CONSTRAINT FK_BranchRequests_RegistrationId FOREIGN KEY (RegistrationId) REFERENCES dbo.GroupRegistrations(Id),
    CONSTRAINT FK_BranchRequests_RequestedByUserId FOREIGN KEY (RequestedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_BranchRequests_ResolvedByUserId FOREIGN KEY (ResolvedByUserId) REFERENCES dbo.Users(Id)
);
GO


-- 16. TourEvents — Nhật ký vận hành; app và role DB chỉ append (backend/database/smart-campus-tour-permissions.sql).
CREATE TABLE dbo.TourEvents
(
    Id                       BIGINT IDENTITY(1,1)      NOT NULL, -- Khóa chính BIGINT tăng tự động do SQL Server cấp; không phải số thứ tự liên tục được bảo đảm.
    TourId                   UNIQUEIDENTIFIER          NOT NULL, -- FK tới Tours.Id.
    EventType                NVARCHAR(80)              NOT NULL, -- Loại sự kiện; cần phân biệt quyết định gửi, đã gửi và phản hồi, không suy thành công từ việc đã gửi.
    OccurredAt               DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm sự kiện được ghi nhận theo quy ước hệ thống, UTC; không dùng Id thay cho thời gian.
    RobotId                  UNIQUEIDENTIFIER          NULL,     -- FK tới Robots.Id.
    RouteId                  UNIQUEIDENTIFIER          NULL,     -- Route đang hiệu lực tại thời điểm event nếu liên quan.
    LegId                    UNIQUEIDENTIFIER          NULL,     -- GUID tương quan lần thực thi chặng liên quan; không phải FK, NULL nếu event không thuộc chặng.
    LegKind                  VARCHAR(30)               NULL,     -- Loại chặng TO_POI hoặc TO_END; NULL nếu event không thuộc chặng.
    StopVisitId              UNIQUEIDENTIFIER          NULL,     -- GUID lượt POI liên quan; không phải FK, dùng phân biệt callback của lượt cũ/chạy lại.
    CommandId                UNIQUEIDENTIFIER          NULL,     -- GUID tương quan các mốc của cùng lệnh; nhiều event có thể chung ID, không đặt UNIQUE đơn cột.
    TargetPoiId              UNIQUEIDENTIFIER          NULL,     -- FK tới Pois.Id.
    TargetStopOrder          INT                       NULL,     -- Thứ tự điểm đích trên RouteId tại thời điểm event; NULL nếu không nhắm một stop.
    TargetMapKey             NVARCHAR(100)             NULL,     -- Snapshot khóa bản đồ của đích tại thời điểm event; NULL nếu không áp dụng.
    TargetMapFrame           NVARCHAR(100)             NULL,     -- Snapshot frame tọa độ đích; dùng cùng TargetMapKey, NULL nếu không áp dụng.
    TargetX                  DECIMAL(10,4)             NULL,     -- Snapshot tọa độ X đích, mét; NULL nếu event không mang đích navigation.
    TargetY                  DECIMAL(10,4)             NULL,     -- Snapshot tọa độ Y đích, mét; NULL nếu event không mang đích navigation.
    TargetYaw                DECIMAL(9,6)              NULL,     -- Snapshot góc hướng thân ở đích, radian; NULL nếu không áp dụng.
    ActorUserId              UNIQUEIDENTIFIER          NULL,     -- NULL khi event tự động/system.
    ReasonCode               NVARCHAR(100)             NULL,     -- Mã nguyên nhân để lọc/đối chiếu; NULL nếu không có.
    ReasonNote               NVARCHAR(2000)            NULL,     -- Giải thích bổ sung đã loại dữ liệu nhạy cảm; NULL nếu không có.
    DataJson                 NVARCHAR(MAX)             NULL,     -- Snapshot narration: AudioUrl/NarrationText/NarrationSeconds đã dùng; hoặc dữ liệu event khác, không roster/email/mã/token.

    CONSTRAINT PK_TourEvents PRIMARY KEY (Id),
    CONSTRAINT FK_TourEvents_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_TourEvents_RobotId FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
    CONSTRAINT FK_TourEvents_RouteId FOREIGN KEY (RouteId) REFERENCES dbo.Routes(Id),
    CONSTRAINT FK_TourEvents_TargetPoiId FOREIGN KEY (TargetPoiId) REFERENCES dbo.Pois(Id),
    CONSTRAINT FK_TourEvents_ActorUserId FOREIGN KEY (ActorUserId) REFERENCES dbo.Users(Id)
);
GO


-- 17. AuditLogs — Audit nghiệp vụ/quản trị/email; không chứa PII nhạy cảm hay secret.
-- TourEvents giữ log vận hành robot chi tiết; AuditLogs giữ các thao tác business/admin và kết quả tích hợp.
-- Email: mỗi lần gửi có CorrelationId riêng; append EMAIL_SEND_REQUESTED/PENDING rồi EMAIL_SEND_RESULT.
-- Kết quả ACCEPTED/FAILED/UNKNOWN ghi dòng mới cùng CorrelationId; không UPDATE dòng PENDING.
-- Retry gửi là attempt mới; thống kê theo attempt có kết quả xác nhận, không đếm mọi dòng audit.
CREATE TABLE dbo.AuditLogs
(
    Id                       BIGINT IDENTITY(1,1)      NOT NULL, -- Khóa chính BIGINT tăng tự động do SQL Server cấp; không phải số thứ tự liên tục được bảo đảm.
    ActorUserId              UNIQUEIDENTIFIER          NULL,     -- NULL nếu thao tác do system/background process thực hiện.
    TourId                   UNIQUEIDENTIFIER          NULL,     -- FK tới Tours.Id.
    RobotId                  UNIQUEIDENTIFIER          NULL,     -- FK tới Robots.Id.
    CorrelationId            UNIQUEIDENTIFIER          NULL,     -- ID tương quan command/request; bắt buộc cho mỗi email attempt theo ADR-0012, retry gửi dùng ID mới.
    [Action]                 NVARCHAR(80)              NOT NULL, -- Tên thao tác nghiệp vụ/quản trị, ví dụ gửi email hoặc thu hồi quyền; thống nhất danh mục tại ứng dụng.
    EntityType               NVARCHAR(50)              NOT NULL, -- Loại đối tượng được audit; dùng cùng EntityId để xác định bản ghi liên quan.
    EntityId                 NVARCHAR(100)             NOT NULL, -- ID đối tượng dạng chuỗi vì có cả GUID/BIGINT; tham chiếu đa loại nên không khai báo FK trực tiếp.
    ResultCode               VARCHAR(30)               NULL,     -- Email: PENDING cho REQUESTED; ACCEPTED/FAILED/UNKNOWN cho RESULT; action khác theo contract riêng.
    DataJson                 NVARCHAR(MAX)             NULL,     -- Không lưu email, roster, password, access code, token.
    OccurredAt               DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm ghi nhận thao tác/kết quả, UTC.

    CONSTRAINT PK_AuditLogs PRIMARY KEY (Id),
    CONSTRAINT FK_AuditLogs_ActorUserId FOREIGN KEY (ActorUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_AuditLogs_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_AuditLogs_RobotId FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id)
);
GO


-- Robots và Tours tham chiếu lẫn nhau: thêm FK này sau khi Tours đã tồn tại.
ALTER TABLE dbo.Robots
ADD CONSTRAINT FK_Robots_CurrentTourId
    FOREIGN KEY (CurrentTourId) REFERENCES dbo.Tours(Id);
GO


-- Invariant nghiệp vụ: nhiều NULL/lịch sử được phép; chỉ khóa tập đang có hiệu lực.
CREATE UNIQUE INDEX UX_BrowserSessions_OneOpen
    ON dbo.BrowserSessions(InvitationId) WHERE EndedAt IS NULL;
GO
CREATE UNIQUE INDEX UX_BranchRequests_OneAccepted
    ON dbo.BranchRequests(TourId) WHERE State = 'ACCEPTED';
GO
CREATE UNIQUE INDEX UX_BranchRequests_OnePending
    ON dbo.BranchRequests(TourId, RequestedByUserId, BranchPointRouteStopId)
    WHERE State = 'PENDING';
GO
CREATE UNIQUE INDEX UX_Robots_CurrentTour
    ON dbo.Robots(CurrentTourId) WHERE CurrentTourId IS NOT NULL;
GO

-- Tra cứu lịch sử một lời mời và ghép các mốc trong cùng lần gửi.
CREATE INDEX IX_AuditLogs_EntityTime
    ON dbo.AuditLogs(EntityType, EntityId, OccurredAt, Id);
GO
CREATE INDEX IX_AuditLogs_Correlation
    ON dbo.AuditLogs(CorrelationId, OccurredAt, Id) WHERE CorrelationId IS NOT NULL;
GO

/*
Ranh giới còn cần backend triển khai theo ADR-0012:
- Chống trùng email trong Tour: mọi đường ghi roster/duyệt/sửa email lấy UPDLOCK
  trên cùng bản ghi Tour trước kiểm tra và ghi, giữ đến commit.
- Kiểm tra cùng Tour/route/điểm phân nhánh; FK đơn chưa kiểm tra quan hệ chéo.
- RowVersion cần được dùng trong UPDATE có điều kiện; chỉ quyết định thắng được phát lệnh.
- Reissue đóng session cũ nguyên tử; EndedAt NULL vẫn có thể đã hết ExpiresAt.
- Role STAFF được vận hành mọi Tour; không có OperatorUserId.
- Snapshot này chưa thay EF v1.0, không phải migration; chưa có CHECK/DEFAULT.
*/
