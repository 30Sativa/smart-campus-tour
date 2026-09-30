/*
Chạy sau snapshot trong đúng database bằng tài khoản triển khai có quyền quản lý role.
Role cố định để không cần chèn tên user hoặc connection secret vào source.
Gán user runtime đã provision vào campus_tour_app bằng quy trình triển khai riêng.
User runtime không được là dbo/sysadmin/db_owner, sở hữu schema/bảng, có quyền DDL
hoặc column-level UPDATE grant. Không cấp db_owner để tránh cấu hình quyền chi tiết.
Script này chỉ cấp quyền log; quyền bảng nghiệp vụ cấp tối thiểu theo use case.
Không thay đổi membership hay thu hồi quyền của tài khoản hiện có.
*/
SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.TourEvents', N'U') IS NULL OR OBJECT_ID(N'dbo.AuditLogs', N'U') IS NULL
    THROW 51000, 'Apply the CampusTour schema in the selected database first.', 1;

IF DATABASE_PRINCIPAL_ID(N'campus_tour_app') IS NULL
    EXEC(N'CREATE ROLE campus_tour_app AUTHORIZATION dbo;');

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'campus_tour_app' AND type = 'R')
    THROW 51001, 'campus_tour_app exists but is not a database role.', 1;

GRANT SELECT, INSERT ON OBJECT::dbo.TourEvents TO campus_tour_app;
GRANT SELECT, INSERT ON OBJECT::dbo.AuditLogs TO campus_tour_app;
DENY UPDATE, DELETE ON OBJECT::dbo.TourEvents TO campus_tour_app;
DENY UPDATE, DELETE ON OBJECT::dbo.AuditLogs TO campus_tour_app;
GO
