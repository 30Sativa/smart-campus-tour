/*
CAMPUS TOUR DT-AMR — DATABASE SCHEMA SNAPSHOT v1.10

Additive Database First baseline: backend/database/smart-campus-tour-schema-v1.3.sql
Decision: docs/decisions/0026-row-level-registration-and-email-change.md
Nguồn nghiệp vụ hiện hành:
- docs/requirements/campus-tour-scope.md
- docs/decisions/0009-review-1-tour-business-scope.md
- docs/decisions/0010-personal-access-code-entry.md
- docs/decisions/0011-student-data-use-for-tour.md
- docs/decisions/0026-row-level-registration-and-email-change.md

Mục tiêu của v1.1:
- Thay flow group-code + matching tên/lớp bằng invitation + mã truy cập + browser session.
- Hỗ trợ dòng Excel cá nhân / điểm xem chung.
- Hỗ trợ nhánh đã chuẩn bị, bật theo Tour và yêu cầu đổi nhánh có Staff quyết định.
- Khép kín release robot sau End Early/lỗi và giữ audit đủ để debug.
- Giữ dữ liệu học sinh trong phạm vi đăng ký/lời mời/thống kê Tour; không CRM/tuyển sinh.

Đây là FULL SNAPSHOT tạo mới database trống, KHÔNG phải migration từ v1.3.
Giữ các snapshot cũ và patch upgrade riêng để đối chiếu; không ghi đè file cũ.

Bản này chốt TABLE / COLUMN / PK / FK, UNIQUE/index và thuộc tính IDENTITY/ROWVERSION theo ADR-0012.
Schema v1.3 adds immutable fixed-route revisions and manual whole-route test evidence. Schema v1.2 added explicit CHECK constraints for the new map/POI records; the
older v1.1 business status values remain validated by their existing use cases.
Required values without SQL defaults must still be supplied by callers.
PK tự tạo unique clustered index trong SQL Server; các index nghiệp vụ bổ sung nằm cuối file.
- v1.2 adds versioned ROS map packages, manual deployment records, POI proposal
  revisions, submission receipts and per-revision technical verification evidence
  under ADR-0021. Existing v1.1 tables and rows remain represented.
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


-- 04. Routes — Cấu hình hành trình do Admin CRUD quản lý (ADR-0017); không tự chứng nhận kiểm chứng vật lý.
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
    DwellSeconds             INT                       NOT NULL, -- Thời gian quan sát cố định theo Route, giây; Admin CRUD trước khi có tham chiếu, kỹ thuật kiểm chứng; không chỉnh riêng theo Tour (ADR-0017).
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
    CredentialHash           VARBINARY(256)            NULL,     -- SHA-256 của khóa Fleet Sync đang hiệu lực; NULL khi chưa cấp/đã thu hồi.
    CredentialIssuedAt       DATETIMEOFFSET(3)         NULL,     -- Lần cấp gần nhất; NULL với hash legacy chưa có metadata.
    CredentialIssuedByUserId UNIQUEIDENTIFIER          NULL,     -- NULL khi cấp bằng CLI hoặc metadata legacy.
    CredentialHint           NVARCHAR(4)                NULL,     -- Bốn ký tự cuối để nhận diện; không phải khóa.
    CredentialRevokedAt      DATETIMEOFFSET(3)         NULL,     -- Lần thu hồi hiện tại, NULL khi chưa thu hồi/sau lần cấp mới.
    CredentialRevokedByUserId UNIQUEIDENTIFIER         NULL,     -- Actor TechnicalStaff/Admin thu hồi.
    FirstAcceptedSyncAt      DATETIMEOFFSET(3)         NULL,     -- BE time của báo cáo Fleet Sync mới đầu tiên được chấp nhận trong đợt cấp khóa hiện tại.
    FirstAcceptedMapKey      NVARCHAR(100)             NULL,     -- MapKey của báo cáo Fleet Sync đầu tiên được chấp nhận trong đợt cấp khóa hiện tại.
    FirstAcceptedFrameId     NVARCHAR(100)             NULL,     -- FrameId của báo cáo Fleet Sync đầu tiên được chấp nhận trong đợt cấp khóa hiện tại.
    AssignedMapVersionId    UNIQUEIDENTIFIER          NULL,     -- Phiên bản map được TechnicalStaff gán cho robot; NULL nếu chưa gán.
    MapAssignedAt           DATETIMEOFFSET(3)         NULL,     -- Lần gán gần nhất; NULL khi chưa gán.
    MapAssignedByUserId     UNIQUEIDENTIFIER          NULL,     -- TechnicalStaff thực hiện lần gán gần nhất.
    IsDispatchEnabled        BIT                       NOT NULL, -- Cho phép xét robot khi chọn phân công; TRUE không thay thế kiểm tra readiness/NeedsInspection.
    NeedsInspection          BIT                       NOT NULL, -- TRUE sau lỗi/End Early cho tới khi Staff xác nhận và backend release hợp lệ.
    CurrentTourId            UNIQUEIDENTIFIER          NULL,     -- FK tới Tours.Id; Tour đang giữ robot, kể cả sau End Early cho đến release hợp lệ.
    LastAssignedAt           DATETIMEOFFSET(3)         NULL,     -- Thời điểm phân công gần nhất, UTC; NULL nếu chưa từng được phân công.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.
    RowVersion               ROWVERSION                NOT NULL, -- Token nhị phân 8 byte do SQL Server tự đổi khi ghi; dùng phát hiện cập nhật cạnh tranh, không phải thời gian.

    CONSTRAINT UQ_Robots_RobotCode UNIQUE (RobotCode),
    CONSTRAINT CK_Robots_CredentialIssueMetadata CHECK
        ((CredentialIssuedAt IS NULL AND CredentialHint IS NULL) OR
         (CredentialIssuedAt IS NOT NULL AND CredentialHint IS NOT NULL)),
    CONSTRAINT CK_Robots_CredentialRevocationMetadata CHECK
        ((CredentialRevokedAt IS NULL AND CredentialRevokedByUserId IS NULL) OR
         (CredentialRevokedAt IS NOT NULL AND CredentialRevokedByUserId IS NOT NULL AND CredentialHash IS NULL)),
    CONSTRAINT FK_Robots_CredentialIssuedByUserId FOREIGN KEY (CredentialIssuedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_Robots_MapAssignedByUserId FOREIGN KEY (MapAssignedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_Robots_CredentialRevokedByUserId FOREIGN KEY (CredentialRevokedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT CK_Robots_MapAssignment_Complete CHECK
        ((AssignedMapVersionId IS NULL AND MapAssignedAt IS NULL AND MapAssignedByUserId IS NULL) OR
         (AssignedMapVersionId IS NOT NULL AND MapAssignedAt IS NOT NULL AND MapAssignedByUserId IS NOT NULL)),
    CONSTRAINT CK_Robots_FirstAcceptedSync_Complete CHECK
        ((FirstAcceptedSyncAt IS NULL AND FirstAcceptedMapKey IS NULL AND FirstAcceptedFrameId IS NULL) OR
         (FirstAcceptedSyncAt IS NOT NULL AND FirstAcceptedMapKey IS NOT NULL AND FirstAcceptedFrameId IS NOT NULL)),
    CONSTRAINT PK_Robots PRIMARY KEY (Id)
);
GO


CREATE INDEX IX_Robots_AssignedMapVersionId ON dbo.Robots(AssignedMapVersionId) WHERE AssignedMapVersionId IS NOT NULL;
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


-- 12. RosterRows — Dòng đăng ký cá nhân hoặc điểm xem chung, có trạng thái tham gia riêng.
CREATE TABLE dbo.RosterRows
(
    Id                       UNIQUEIDENTIFIER          NOT NULL, -- Khóa chính GUID của bản ghi; ứng dụng cấp khi INSERT vì chưa có DEFAULT.
    RegistrationId           UNIQUEIDENTIFIER          NOT NULL, -- FK tới GroupRegistrations.Id.
    RowNumber                INT                       NOT NULL, -- Số dòng nguồn để báo lỗi/preview; không phải mã học sinh.
    RowType                  VARCHAR(30)               NOT NULL, -- INDIVIDUAL hoặc SHARED_VIEWING; import map từ CA_NHAN/DIEM_XEM_CHUNG.
    DisplayName              NVARCHAR(150)             NOT NULL, -- Họ tên cá nhân hoặc tên điểm xem chung.
    Email                    NVARCHAR(254)             NOT NULL, -- Email nhận link + Mã truy cập.
    ClassName                NVARCHAR(100)             NULL,     -- Tên lớp tùy chọn theo Excel; không dùng matching tên/lớp để cấp quyền.
    ParticipationState       VARCHAR(20)               NOT NULL CONSTRAINT DF_RosterRows_ParticipationState DEFAULT ('PENDING'), -- PENDING, ACCEPTED, REJECTED, REMOVED; quyền hiệu lực theo dòng.
    ReviewedByUserId         UNIQUEIDENTIFIER          NULL,
    ReviewedAt               DATETIMEOFFSET(3)         NULL,
    ReviewReason             NVARCHAR(1000)            NULL,
    IsActive                 BIT                       NOT NULL, -- FALSE khi roster cũ bị thay; giữ tham chiếu lịch sử, không có nghĩa giữ PII vô thời hạn (ADR-0011).
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL, -- Thời điểm tạo bản ghi, lưu UTC (+00:00); ứng dụng phải cấp vì chưa có DEFAULT.
    UpdatedAt                DATETIMEOFFSET(3)         NULL,     -- Thời điểm cập nhật gần nhất, UTC; NULL khi chưa cập nhật.
    RowVersion               ROWVERSION                NOT NULL, -- Token nhị phân 8 byte do SQL Server tự đổi khi ghi; dùng phát hiện cập nhật cạnh tranh, không phải thời gian.

    CONSTRAINT PK_RosterRows PRIMARY KEY (Id),
    CONSTRAINT FK_RosterRows_RegistrationId FOREIGN KEY (RegistrationId) REFERENCES dbo.GroupRegistrations(Id),
    CONSTRAINT FK_RosterRows_ReviewedByUserId FOREIGN KEY (ReviewedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT CK_RosterRows_ParticipationState CHECK (ParticipationState IN ('PENDING','ACCEPTED','REJECTED','REMOVED'))
);
GO

-- 12a. RosterEmailChangeRequests — request/review lịch sử đổi email của một dòng đã được chấp nhận.
CREATE TABLE dbo.RosterEmailChangeRequests
(
    Id                       UNIQUEIDENTIFIER          NOT NULL,
    RosterRowId              UNIQUEIDENTIFIER          NOT NULL,
    RequestId                UNIQUEIDENTIFIER          NOT NULL,
    CurrentEmail             NVARCHAR(254)             NOT NULL,
    ProposedEmail            NVARCHAR(254)             NOT NULL,
    RequestedByUserId        UNIQUEIDENTIFIER          NOT NULL,
    State                    VARCHAR(20)               NOT NULL, -- PENDING, ACCEPTED, REJECTED.
    CreatedAt                DATETIMEOFFSET(3)         NOT NULL,
    ReviewedAt               DATETIMEOFFSET(3)         NULL,
    ReviewedByUserId         UNIQUEIDENTIFIER          NULL,
    ReviewReason             NVARCHAR(1000)            NULL,
    RowVersion               ROWVERSION                NOT NULL,
    CONSTRAINT PK_RosterEmailChangeRequests PRIMARY KEY (Id),
    CONSTRAINT FK_RosterEmailChangeRequests_RosterRow FOREIGN KEY (RosterRowId) REFERENCES dbo.RosterRows(Id),
    CONSTRAINT FK_RosterEmailChangeRequests_Requester FOREIGN KEY (RequestedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_RosterEmailChangeRequests_Reviewer FOREIGN KEY (ReviewedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT CK_RosterEmailChangeRequests_State CHECK (State IN ('PENDING','ACCEPTED','REJECTED')),
    CONSTRAINT CK_RosterEmailChangeRequests_DifferentEmail CHECK (CurrentEmail <> ProposedEmail),
    CONSTRAINT UQ_RosterEmailChangeRequests_Request UNIQUE (RequestedByUserId, RequestId)
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
    DeviceTokenHash          BINARY(32)                NULL,     -- Browser binding riêng để reconnect trong grace; không dùng IP.
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
CREATE UNIQUE INDEX UX_RosterEmailChangeRequests_OnePending
    ON dbo.RosterEmailChangeRequests(RosterRowId) WHERE State='PENDING';
GO
CREATE INDEX IX_RosterEmailChangeRequests_Review
    ON dbo.RosterEmailChangeRequests(State, CreatedAt, Id);
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
CREATE UNIQUE INDEX UX_AuditLogs_RobotCredentialRequest
    ON dbo.AuditLogs(RobotId, CorrelationId)
    WHERE RobotId IS NOT NULL AND CorrelationId IS NOT NULL AND
        [Action] IN (N'ROBOT_CREDENTIAL_ISSUED', N'ROBOT_CREDENTIAL_ROTATED', N'ROBOT_CREDENTIAL_REVOKED');
GO
CREATE UNIQUE INDEX UX_AuditLogs_RobotMapAssignmentRequest
    ON dbo.AuditLogs(ActorUserId, CorrelationId)
    WHERE ActorUserId IS NOT NULL AND CorrelationId IS NOT NULL AND
        [Action] IN (N'ROBOT_MAP_ASSIGNED', N'ROBOT_MAP_CLEARED');
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

-- ADR-0021 additions: immutable map packages, deployment checks, POI revisions and verification history.
IF OBJECT_ID(N'dbo.MapAreas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MapAreas
    (
        AreaKey             NVARCHAR(100)       NOT NULL,
        DisplayName         NVARCHAR(150)       NOT NULL,
        CreatedByUserId     UNIQUEIDENTIFIER    NOT NULL,
        CreatedAt           DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_MapAreas PRIMARY KEY (AreaKey),
        CONSTRAINT FK_MapAreas_CreatedByUserId FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id)
    );
END;

IF OBJECT_ID(N'dbo.MapVersions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MapVersions
    (
        Id                  UNIQUEIDENTIFIER    NOT NULL,
        AreaKey             NVARCHAR(100)       NOT NULL,
        VersionNumber       INT                 NOT NULL,
        MapKey              NVARCHAR(100)       NOT NULL,
        PackageFileName     NVARCHAR(255)       NOT NULL,
        PackageSha256       BINARY(32)          NOT NULL,
        RequestHash         BINARY(32)          NOT NULL,
        PackageBytes        VARBINARY(MAX)      NOT NULL,
        ImageFileName       NVARCHAR(255)       NOT NULL,
        ImageWidth          INT                 NOT NULL,
        ImageHeight         INT                 NOT NULL,
        Resolution          DECIMAL(12,6)       NOT NULL,
        OriginX             DECIMAL(10,4)       NOT NULL,
        OriginY             DECIMAL(10,4)       NOT NULL,
        OriginYaw           DECIMAL(9,6)        NOT NULL,
        Negate              BIT                 NOT NULL,
        OccupiedThreshold   DECIMAL(5,4)        NOT NULL,
        FreeThreshold       DECIMAL(5,4)        NOT NULL,
        FrameId             NVARCHAR(100)       NOT NULL,
        ValidationStatus    VARCHAR(20)         NOT NULL,
        UploadedByUserId    UNIQUEIDENTIFIER    NOT NULL,
        UploadRequestId     UNIQUEIDENTIFIER    NOT NULL,
        UploadedAt          DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_MapVersions PRIMARY KEY (Id),
        CONSTRAINT FK_MapVersions_AreaKey FOREIGN KEY (AreaKey) REFERENCES dbo.MapAreas(AreaKey),
        CONSTRAINT FK_MapVersions_UploadedByUserId FOREIGN KEY (UploadedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_MapVersions_AreaVersion UNIQUE (AreaKey, VersionNumber),
        CONSTRAINT UQ_MapVersions_MapKey UNIQUE (MapKey),
        CONSTRAINT UQ_MapVersions_UploaderRequest UNIQUE (UploadedByUserId, UploadRequestId),
        CONSTRAINT CK_MapVersions_VersionNumber CHECK (VersionNumber > 0),
        CONSTRAINT CK_MapVersions_PackageLength CHECK (DATALENGTH(PackageBytes) BETWEEN 1 AND 33554432),
        CONSTRAINT CK_MapVersions_Dimensions CHECK (ImageWidth BETWEEN 1 AND 8192 AND ImageHeight BETWEEN 1 AND 8192 AND CONVERT(BIGINT, ImageWidth) * ImageHeight <= 32000000),
        CONSTRAINT CK_MapVersions_Resolution CHECK (Resolution > 0),
        CONSTRAINT CK_MapVersions_OriginYaw CHECK (OriginYaw = 0),
        CONSTRAINT CK_MapVersions_Thresholds CHECK (FreeThreshold >= 0 AND OccupiedThreshold <= 1 AND FreeThreshold < OccupiedThreshold),
        CONSTRAINT CK_MapVersions_Frame CHECK (FrameId = N'map'),
        CONSTRAINT CK_MapVersions_ValidationStatus CHECK (ValidationStatus = 'VALID')
    );
    CREATE INDEX IX_MapVersions_AreaUploaded ON dbo.MapVersions(AreaKey, UploadedAt DESC, Id);
END;

ALTER TABLE dbo.Robots ADD CONSTRAINT FK_Robots_AssignedMapVersionId FOREIGN KEY (AssignedMapVersionId) REFERENCES dbo.MapVersions(Id);
GO

IF OBJECT_ID(N'dbo.MapDeploymentChecks', N'U') IS NULL
BEGIN
CREATE TABLE dbo.MapDeploymentChecks
    (
        Id                  UNIQUEIDENTIFIER    NOT NULL,
        MapVersionId        UNIQUEIDENTIFIER    NOT NULL,
        RobotId             UNIQUEIDENTIFIER    NOT NULL,
        PackageSha256       BINARY(32)          NOT NULL,
        LocalizationPassed  BIT                 NOT NULL,
        DisplayPassed       BIT                 NOT NULL,
        EvidenceNote        NVARCHAR(2000)      NOT NULL,
        CheckedByUserId     UNIQUEIDENTIFIER    NOT NULL,
        RequestId           UNIQUEIDENTIFIER    NOT NULL,
        RequestHash         BINARY(32)          NOT NULL,
        CheckedAt           DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_MapDeploymentChecks PRIMARY KEY (Id),
        CONSTRAINT FK_MapDeploymentChecks_MapVersionId FOREIGN KEY (MapVersionId) REFERENCES dbo.MapVersions(Id),
        CONSTRAINT FK_MapDeploymentChecks_RobotId FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
        CONSTRAINT FK_MapDeploymentChecks_CheckedByUserId FOREIGN KEY (CheckedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_MapDeploymentChecks_ActorRequest UNIQUE (CheckedByUserId, RequestId),
        CONSTRAINT CK_MapDeploymentChecks_Evidence CHECK (LEN(LTRIM(RTRIM(EvidenceNote))) > 0)
    );
    CREATE INDEX IX_MapDeploymentChecks_VersionTime ON dbo.MapDeploymentChecks(MapVersionId, CheckedAt DESC, Id);
END;

IF OBJECT_ID(N'dbo.PoiProposals', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PoiProposals
    (
        Id                  UNIQUEIDENTIFIER    NOT NULL,
        CreatedByUserId     UNIQUEIDENTIFIER    NOT NULL,
        CreateRequestId     UNIQUEIDENTIFIER    NOT NULL,
        CreateRequestHash   BINARY(32)          NOT NULL,
        CurrentRevision     INT                 NOT NULL,
        CreatedAt           DATETIMEOFFSET(3)   NOT NULL,
        UpdatedAt           DATETIMEOFFSET(3)   NULL,
        RowVersion          ROWVERSION          NOT NULL,
        CONSTRAINT PK_PoiProposals PRIMARY KEY (Id),
        CONSTRAINT FK_PoiProposals_CreatedByUserId FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_PoiProposals_OwnerRequest UNIQUE (CreatedByUserId, CreateRequestId),
        CONSTRAINT CK_PoiProposals_CurrentRevision CHECK (CurrentRevision > 0)
    );
END;

IF OBJECT_ID(N'dbo.PoiProposalRevisions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PoiProposalRevisions
    (
        Id                  UNIQUEIDENTIFIER    NOT NULL,
        ProposalId          UNIQUEIDENTIFIER    NOT NULL,
        RevisionNumber      INT                 NOT NULL,
        MapVersionId        UNIQUEIDENTIFIER    NOT NULL,
        Name                NVARCHAR(150)       NOT NULL,
        Purpose             NVARCHAR(500)       NOT NULL,
        Description         NVARCHAR(2000)      NULL,
        X                   DECIMAL(10,4)       NOT NULL,
        Y                   DECIMAL(10,4)       NOT NULL,
        Yaw                 DECIMAL(9,6)        NOT NULL,
        CameraPreset        NVARCHAR(80)        NOT NULL,
        NarrationText       NVARCHAR(4000)      NULL,
        FallbackVideoUrl    NVARCHAR(2048)      NULL,
        NavigationFingerprint BINARY(32)        NOT NULL,
        RequestId           UNIQUEIDENTIFIER    NOT NULL,
        RequestHash         BINARY(32)          NOT NULL,
        CreatedByUserId     UNIQUEIDENTIFIER    NOT NULL,
        CreatedAt           DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_PoiProposalRevisions PRIMARY KEY (Id),
        CONSTRAINT FK_PoiProposalRevisions_ProposalId FOREIGN KEY (ProposalId) REFERENCES dbo.PoiProposals(Id),
        CONSTRAINT FK_PoiProposalRevisions_MapVersionId FOREIGN KEY (MapVersionId) REFERENCES dbo.MapVersions(Id),
        CONSTRAINT FK_PoiProposalRevisions_CreatedByUserId FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_PoiProposalRevisions_Number UNIQUE (ProposalId, RevisionNumber),
        CONSTRAINT UQ_PoiProposalRevisions_Request UNIQUE (ProposalId, RequestId),
        CONSTRAINT CK_PoiProposalRevisions_Number CHECK (RevisionNumber > 0),
        CONSTRAINT CK_PoiProposalRevisions_FallbackVideoHttps CHECK (FallbackVideoUrl IS NULL OR FallbackVideoUrl LIKE N'https://%')
    );
    CREATE INDEX IX_PoiProposalRevisions_MapVersion ON dbo.PoiProposalRevisions(MapVersionId, CreatedAt, Id);
END;

IF OBJECT_ID(N'dbo.PoiProposalSubmissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PoiProposalSubmissions
    (
        Id                  UNIQUEIDENTIFIER    NOT NULL,
        ProposalRevisionId  UNIQUEIDENTIFIER    NOT NULL,
        SubmittedByUserId   UNIQUEIDENTIFIER    NOT NULL,
        RequestId           UNIQUEIDENTIFIER    NOT NULL,
        RequestHash         BINARY(32)          NOT NULL,
        SubmittedAt         DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_PoiProposalSubmissions PRIMARY KEY (Id),
        CONSTRAINT FK_PoiProposalSubmissions_RevisionId FOREIGN KEY (ProposalRevisionId) REFERENCES dbo.PoiProposalRevisions(Id),
        CONSTRAINT FK_PoiProposalSubmissions_SubmittedByUserId FOREIGN KEY (SubmittedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_PoiProposalSubmissions_Revision UNIQUE (ProposalRevisionId),
        CONSTRAINT UQ_PoiProposalSubmissions_ActorRequest UNIQUE (SubmittedByUserId, RequestId)
    );
    CREATE INDEX IX_PoiProposalSubmissions_SubmittedAt ON dbo.PoiProposalSubmissions(SubmittedAt, ProposalRevisionId);
END;

IF OBJECT_ID(N'dbo.PoiVerificationRecords', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PoiVerificationRecords
    (
        Id                      UNIQUEIDENTIFIER    NOT NULL,
        ProposalRevisionId      UNIQUEIDENTIFIER    NOT NULL,
        MapVersionId            UNIQUEIDENTIFIER    NOT NULL,
        RobotId                 UNIQUEIDENTIFIER    NOT NULL,
        NavigationFingerprint   BINARY(32)          NOT NULL,
        ResultCode              VARCHAR(10)         NOT NULL,
        Reached                 BIT                 NOT NULL,
        Stopped                 BIT                 NOT NULL,
        LocalizationPassed      BIT                 NOT NULL,
        CameraPresetConfirmed   BIT                 NOT NULL,
        Reason                  NVARCHAR(1000)      NULL,
        EvidenceNote            NVARCHAR(2000)      NOT NULL,
        CheckedByUserId         UNIQUEIDENTIFIER    NOT NULL,
        RequestId               UNIQUEIDENTIFIER    NOT NULL,
        RequestHash             BINARY(32)          NOT NULL,
        CheckedAt               DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_PoiVerificationRecords PRIMARY KEY (Id),
        CONSTRAINT FK_PoiVerificationRecords_RevisionId FOREIGN KEY (ProposalRevisionId) REFERENCES dbo.PoiProposalRevisions(Id),
        CONSTRAINT FK_PoiVerificationRecords_MapVersionId FOREIGN KEY (MapVersionId) REFERENCES dbo.MapVersions(Id),
        CONSTRAINT FK_PoiVerificationRecords_RobotId FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
        CONSTRAINT FK_PoiVerificationRecords_CheckedByUserId FOREIGN KEY (CheckedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_PoiVerificationRecords_Revision UNIQUE (ProposalRevisionId),
        CONSTRAINT UQ_PoiVerificationRecords_ActorRequest UNIQUE (CheckedByUserId, RequestId),
        CONSTRAINT CK_PoiVerificationRecords_Result CHECK (ResultCode IN ('PASS','FAIL')),
        CONSTRAINT CK_PoiVerificationRecords_Evidence CHECK (LEN(LTRIM(RTRIM(EvidenceNote))) > 0),
        CONSTRAINT CK_PoiVerificationRecords_Pass CHECK (ResultCode <> 'PASS' OR (Reached = 1 AND Stopped = 1 AND LocalizationPassed = 1 AND CameraPresetConfirmed = 1)),
        CONSTRAINT CK_PoiVerificationRecords_Fail CHECK (ResultCode <> 'FAIL' OR (Reason IS NOT NULL AND LEN(LTRIM(RTRIM(Reason))) > 0 AND (Reached = 0 OR Stopped = 0 OR LocalizationPassed = 0 OR CameraPresetConfirmed = 0)))
    );
    CREATE INDEX IX_PoiVerificationRecords_FingerprintTime ON dbo.PoiVerificationRecords(MapVersionId, NavigationFingerprint, CheckedAt DESC, Id);
END;

-- v1.3: immutable Route revisions and append-only manual route-test evidence (ADR-0023).
IF COL_LENGTH(N'dbo.Routes', N'AuthoringMode') IS NULL
BEGIN
    ALTER TABLE dbo.Routes ADD AuthoringMode VARCHAR(20) NOT NULL
        CONSTRAINT DF_Routes_AuthoringMode DEFAULT ('LEGACY') WITH VALUES;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_Routes_AuthoringMode')
    ALTER TABLE dbo.Routes ADD CONSTRAINT CK_Routes_AuthoringMode CHECK (AuthoringMode IN ('LEGACY','VERSIONED'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.PoiProposalRevisions') AND name=N'UQ_PoiProposalRevisions_ExactMapFingerprint')
    CREATE UNIQUE INDEX UQ_PoiProposalRevisions_ExactMapFingerprint ON dbo.PoiProposalRevisions(Id, MapVersionId, NavigationFingerprint);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.PoiVerificationRecords') AND name=N'UQ_PoiVerificationRecords_ExactEvidence')
    CREATE UNIQUE INDEX UQ_PoiVerificationRecords_ExactEvidence ON dbo.PoiVerificationRecords(Id, MapVersionId, NavigationFingerprint);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.MapDeploymentChecks') AND name=N'UQ_MapDeploymentChecks_ExactMap')
    CREATE UNIQUE INDEX UQ_MapDeploymentChecks_ExactMap ON dbo.MapDeploymentChecks(Id, MapVersionId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.MapDeploymentChecks') AND name=N'UQ_MapDeploymentChecks_ExactMapChecksum')
    CREATE UNIQUE INDEX UQ_MapDeploymentChecks_ExactMapChecksum ON dbo.MapDeploymentChecks(Id, MapVersionId, PackageSha256);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.MapVersions') AND name=N'UQ_MapVersions_ExactPackage')
    CREATE UNIQUE INDEX UQ_MapVersions_ExactPackage ON dbo.MapVersions(Id, PackageSha256);

IF OBJECT_ID(N'dbo.RouteRevisions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RouteRevisions
    (
        Id UNIQUEIDENTIFIER NOT NULL,
        RouteId UNIQUEIDENTIFIER NOT NULL,
        RevisionNumber INT NOT NULL,
        Name NVARCHAR(150) NOT NULL,
        Description NVARCHAR(1000) NULL,
        MapVersionId UNIQUEIDENTIFIER NOT NULL,
        MapPackageSha256 BINARY(32) NOT NULL,
        StartX DECIMAL(10,4) NOT NULL, StartY DECIMAL(10,4) NOT NULL, StartYaw DECIMAL(9,6) NOT NULL,
        EndMode VARCHAR(20) NOT NULL, EndX DECIMAL(10,4) NULL, EndY DECIMAL(10,4) NULL, EndYaw DECIMAL(9,6) NULL,
        NavigationFingerprint BINARY(32) NOT NULL,
        RequestId UNIQUEIDENTIFIER NOT NULL, RequestHash BINARY(32) NOT NULL,
        CreatedByUserId UNIQUEIDENTIFIER NOT NULL, CreatedAt DATETIMEOFFSET(3) NOT NULL,
        CONSTRAINT PK_RouteRevisions PRIMARY KEY (Id),
        CONSTRAINT FK_RouteRevisions_Route FOREIGN KEY (RouteId) REFERENCES dbo.Routes(Id),
        CONSTRAINT FK_RouteRevisions_Map FOREIGN KEY (MapVersionId) REFERENCES dbo.MapVersions(Id),
        CONSTRAINT FK_RouteRevisions_MapChecksum FOREIGN KEY (MapVersionId, MapPackageSha256) REFERENCES dbo.MapVersions(Id, PackageSha256),
        CONSTRAINT FK_RouteRevisions_CreatedBy FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_RouteRevisions_Number UNIQUE (RouteId, RevisionNumber),
        CONSTRAINT UQ_RouteRevisions_Request UNIQUE (CreatedByUserId, RequestId),
        CONSTRAINT UQ_RouteRevisions_IdMap UNIQUE (Id, MapVersionId),
        CONSTRAINT UQ_RouteRevisions_MapFingerprint UNIQUE (Id, MapVersionId, NavigationFingerprint),
        CONSTRAINT UQ_RouteRevisions_MapChecksumFingerprint UNIQUE (Id, MapVersionId, MapPackageSha256, NavigationFingerprint),
        CONSTRAINT CK_RouteRevisions_Number CHECK (RevisionNumber > 0),
        CONSTRAINT CK_RouteRevisions_EndMode CHECK ((EndMode='POSE' AND EndX IS NOT NULL AND EndY IS NOT NULL AND EndYaw IS NOT NULL) OR (EndMode='LAST_POI' AND EndX IS NULL AND EndY IS NULL AND EndYaw IS NULL))
    );
    CREATE INDEX IX_RouteRevisions_Map ON dbo.RouteRevisions(MapVersionId, CreatedAt, Id);
END;

IF OBJECT_ID(N'dbo.RouteRevisionSubmissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RouteRevisionSubmissions
    (
        Id UNIQUEIDENTIFIER NOT NULL,
        RouteRevisionId UNIQUEIDENTIFIER NOT NULL,
        RequestId UNIQUEIDENTIFIER NOT NULL,
        RequestHash BINARY(32) NOT NULL,
        SubmittedByUserId UNIQUEIDENTIFIER NOT NULL,
        SubmittedAt DATETIMEOFFSET(3) NOT NULL,
        CONSTRAINT PK_RouteRevisionSubmissions PRIMARY KEY (Id),
        CONSTRAINT FK_RouteRevisionSubmissions_Revision FOREIGN KEY (RouteRevisionId) REFERENCES dbo.RouteRevisions(Id),
        CONSTRAINT FK_RouteRevisionSubmissions_User FOREIGN KEY (SubmittedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_RouteRevisionSubmissions_Revision UNIQUE (RouteRevisionId),
        CONSTRAINT UQ_RouteRevisionSubmissions_Request UNIQUE (SubmittedByUserId, RequestId)
    );
END;

IF OBJECT_ID(N'dbo.RouteRevisionStops', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RouteRevisionStops
    (
        Id UNIQUEIDENTIFIER NOT NULL,
        RouteRevisionId UNIQUEIDENTIFIER NOT NULL,
        PoiProposalRevisionId UNIQUEIDENTIFIER NOT NULL,
        SourcePoiVerificationRecordId UNIQUEIDENTIFIER NOT NULL,
        MapVersionId UNIQUEIDENTIFIER NOT NULL,
        PoiNavigationFingerprint BINARY(32) NOT NULL,
        StopOrder INT NOT NULL,
        DwellSeconds INT NOT NULL,
        HeadStepsJson NVARCHAR(4000) NOT NULL,
        Name NVARCHAR(150) NOT NULL,
        X DECIMAL(10,4) NOT NULL, Y DECIMAL(10,4) NOT NULL, Yaw DECIMAL(9,6) NOT NULL,
        CameraPreset NVARCHAR(80) NOT NULL,
        NarrationText NVARCHAR(4000) NULL,
        FallbackVideoUrl NVARCHAR(2048) NULL,
        CONSTRAINT PK_RouteRevisionStops PRIMARY KEY (Id),
        CONSTRAINT FK_RouteRevisionStops_RevisionMap FOREIGN KEY (RouteRevisionId, MapVersionId) REFERENCES dbo.RouteRevisions(Id, MapVersionId),
        CONSTRAINT FK_RouteRevisionStops_PoiMapFingerprint FOREIGN KEY (PoiProposalRevisionId, MapVersionId, PoiNavigationFingerprint) REFERENCES dbo.PoiProposalRevisions(Id, MapVersionId, NavigationFingerprint),
        CONSTRAINT FK_RouteRevisionStops_SourceEvidence FOREIGN KEY (SourcePoiVerificationRecordId, MapVersionId, PoiNavigationFingerprint) REFERENCES dbo.PoiVerificationRecords(Id, MapVersionId, NavigationFingerprint),
        CONSTRAINT UQ_RouteRevisionStops_Order UNIQUE (RouteRevisionId, StopOrder),
        CONSTRAINT UQ_RouteRevisionStops_Poi UNIQUE (RouteRevisionId, PoiProposalRevisionId),
        CONSTRAINT CK_RouteRevisionStops_Order CHECK (StopOrder > 0),
        CONSTRAINT CK_RouteRevisionStops_Dwell CHECK (DwellSeconds BETWEEN 1 AND 3600),
        CONSTRAINT CK_RouteRevisionStops_FallbackVideoHttps CHECK (FallbackVideoUrl IS NULL OR FallbackVideoUrl LIKE N'https://%')
    );
END;

IF OBJECT_ID(N'dbo.RouteTestRuns', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RouteTestRuns
    (
        Id UNIQUEIDENTIFIER NOT NULL,
        RouteRevisionId UNIQUEIDENTIFIER NOT NULL,
        NavigationFingerprint BINARY(32) NOT NULL,
        MapVersionId UNIQUEIDENTIFIER NOT NULL,
        MapDeploymentCheckId UNIQUEIDENTIFIER NOT NULL,
        MapPackageSha256 BINARY(32) NOT NULL,
        RobotId UNIQUEIDENTIFIER NOT NULL,
        CheckedByUserId UNIQUEIDENTIFIER NOT NULL,
        ParticipatingStaffUserId UNIQUEIDENTIFIER NOT NULL,
        ResultCode VARCHAR(10) NOT NULL,
        AllStopsReached BIT NOT NULL, SafelyStopped BIT NOT NULL, LocalizationPassed BIT NOT NULL,
        MeasuredDurationSeconds INT NOT NULL,
        FailureReason NVARCHAR(1000) NULL,
        EvidenceNote NVARCHAR(2000) NOT NULL,
        RequestId UNIQUEIDENTIFIER NOT NULL, RequestHash BINARY(32) NOT NULL,
        CheckedAt DATETIMEOFFSET(3) NOT NULL,
        MeasurementBasis NVARCHAR(32) NULL,
        CONSTRAINT PK_RouteTestRuns PRIMARY KEY (Id),
        CONSTRAINT FK_RouteTestRuns_ExactRevision FOREIGN KEY (RouteRevisionId, MapVersionId, NavigationFingerprint) REFERENCES dbo.RouteRevisions(Id, MapVersionId, NavigationFingerprint),
        CONSTRAINT FK_RouteTestRuns_Deployment FOREIGN KEY (MapDeploymentCheckId, MapVersionId, MapPackageSha256) REFERENCES dbo.MapDeploymentChecks(Id, MapVersionId, PackageSha256),
        CONSTRAINT FK_RouteTestRuns_Robot FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
        CONSTRAINT FK_RouteTestRuns_Checker FOREIGN KEY (CheckedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT FK_RouteTestRuns_Staff FOREIGN KEY (ParticipatingStaffUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_RouteTestRuns_Request UNIQUE (CheckedByUserId, RequestId),
        CONSTRAINT CK_RouteTestRuns_Result CHECK (ResultCode IN ('PASS','FAIL')),
        CONSTRAINT CK_RouteTestRuns_Duration CHECK (MeasuredDurationSeconds BETWEEN 1 AND 86400),
        CONSTRAINT CK_RouteTestRuns_MeasurementBasis CHECK (MeasurementBasis IS NULL OR MeasurementBasis = N'TOTAL_WITH_DWELL'),
        CONSTRAINT CK_RouteTestRuns_Evidence CHECK (LEN(LTRIM(RTRIM(EvidenceNote))) > 0),
        CONSTRAINT CK_RouteTestRuns_Pass CHECK (ResultCode <> 'PASS' OR (AllStopsReached=1 AND SafelyStopped=1 AND LocalizationPassed=1)),
        CONSTRAINT CK_RouteTestRuns_Fail CHECK (ResultCode <> 'FAIL' OR (FailureReason IS NOT NULL AND LEN(LTRIM(RTRIM(FailureReason)))>0 AND (AllStopsReached=0 OR SafelyStopped=0 OR LocalizationPassed=0)))
    );
    CREATE INDEX IX_RouteTestRuns_Effective ON dbo.RouteTestRuns(RouteRevisionId, NavigationFingerprint, CheckedAt DESC, Id);
END;
GO

-- v1.9: a Tour scheduled from one exact tested RouteRevision (ADR-0034).
ALTER TABLE dbo.Tours ADD
    RouteRevisionId UNIQUEIDENTIFIER NULL, -- Phiên bản tuyến đã kiểm chứng; NULL ở Tour kiểu cũ.
    OperatorUserId UNIQUEIDENTIFIER NULL; -- Staff vận hành được gán; NULL ở Tour kiểu cũ.
GO
ALTER TABLE dbo.Tours WITH CHECK ADD
    CONSTRAINT CK_Tours_VersionedTarget_Complete CHECK
        ((RouteRevisionId IS NULL AND OperatorUserId IS NULL) OR (RouteRevisionId IS NOT NULL AND OperatorUserId IS NOT NULL)),
    CONSTRAINT FK_Tours_RouteRevisionId FOREIGN KEY (RouteRevisionId) REFERENCES dbo.RouteRevisions(Id),
    CONSTRAINT FK_Tours_OperatorUserId FOREIGN KEY (OperatorUserId) REFERENCES dbo.Users(Id);
GO
CREATE INDEX IX_Tours_RouteRevisionId ON dbo.Tours(RouteRevisionId) WHERE RouteRevisionId IS NOT NULL;
GO
CREATE TABLE dbo.TourRobotReservations
(
    Id UNIQUEIDENTIFIER NOT NULL,
    TourId UNIQUEIDENTIFIER NOT NULL,
    RobotId UNIQUEIDENTIFIER NOT NULL,
    RouteTestRunId UNIQUEIDENTIFIER NOT NULL, -- Lần chạy đạt dùng để tính độ dài giữ chỗ.
    MeasuredDurationSeconds INT NOT NULL,
    StartsAt DATETIMEOFFSET(3) NOT NULL,
    EndsAt DATETIMEOFFSET(3) NOT NULL,
    ReservedByUserId UNIQUEIDENTIFIER NOT NULL,
    ReservedAt DATETIMEOFFSET(3) NOT NULL,
    ReleasedAt DATETIMEOFFSET(3) NULL,
    ReleasedByUserId UNIQUEIDENTIFIER NULL,
    ExpectedDurationSeconds INT NULL,
    CONSTRAINT PK_TourRobotReservations PRIMARY KEY (Id),
    CONSTRAINT FK_TourRobotReservations_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_TourRobotReservations_RobotId FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
    CONSTRAINT FK_TourRobotReservations_RouteTestRunId FOREIGN KEY (RouteTestRunId) REFERENCES dbo.RouteTestRuns(Id),
    CONSTRAINT FK_TourRobotReservations_ReservedByUserId FOREIGN KEY (ReservedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_TourRobotReservations_ReleasedByUserId FOREIGN KEY (ReleasedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT CK_TourRobotReservations_Window CHECK (EndsAt > StartsAt),
    CONSTRAINT CK_TourRobotReservations_Duration CHECK (MeasuredDurationSeconds BETWEEN 1 AND 86400),
    CONSTRAINT CK_TourRobotReservations_ExpectedDuration CHECK (ExpectedDurationSeconds IS NULL OR ExpectedDurationSeconds >= MeasuredDurationSeconds),
    CONSTRAINT CK_TourRobotReservations_Release_Complete CHECK
        ((ReleasedAt IS NULL AND ReleasedByUserId IS NULL) OR (ReleasedAt IS NOT NULL AND ReleasedByUserId IS NOT NULL))
);
GO
CREATE UNIQUE INDEX UX_TourRobotReservations_ActiveTour ON dbo.TourRobotReservations(TourId) WHERE ReleasedAt IS NULL;
GO
CREATE INDEX IX_TourRobotReservations_ActiveRobot ON dbo.TourRobotReservations(RobotId, StartsAt, EndsAt) WHERE ReleasedAt IS NULL;
GO
