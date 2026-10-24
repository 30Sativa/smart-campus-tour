-- Explicit, one-time registration UI fixture. Only for an isolated POI demo DB.
-- Apply schema, bootstrap rep.demo.admin, and run --seed-demo-pois first.
-- Does not create registrations, invitations, sessions, robots or runtime states.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;

DECLARE @db sysname = DB_NAME();
DECLARE @prefix nvarchar(100) = N'SmartCampusTourPoiDemo_';
IF @db <> N'SmartCampusTourPoiDemo' AND NOT
   (LEFT(@db, LEN(@prefix)) = @prefix AND LEN(@db) = LEN(@prefix) + 32
    AND RIGHT(@db, 32) COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9a-f]%')
    THROW 51030, 'Representative demo fixture requires an isolated SmartCampusTourPoiDemo database.', 1;

BEGIN TRANSACTION;
DECLARE @lock int;
EXEC @lock = sys.sp_getapplock @Resource = N'CampusTour.RepresentativeDemo.v1',
    @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
IF @lock < 0 THROW 51031, 'Could not lock demo fixture.', 1;
DECLARE @admin uniqueidentifier = (
    SELECT u.Id FROM dbo.Users u JOIN dbo.UserRoles ur ON ur.UserId = u.Id
    WHERE u.NormalizedUsername = N'REP.DEMO.ADMIN' AND u.IsActive = 1 AND ur.Role = 'ADMIN'
);
IF @admin IS NULL THROW 51032, 'Bootstrap the active rep.demo.admin account first.', 1;
IF (SELECT COUNT(*) FROM dbo.Pois WHERE Id IN (
    '8fd832a5-7e3b-4e6d-a101-000000000001', '8fd832a5-7e3b-4e6d-a101-000000000002')) <> 2
    THROW 51033, 'Seed the demo POI baseline first.', 1;
DECLARE @route uniqueidentifier = '8fd832a5-7e3b-4e6d-b101-000000000001';
DECLARE @tour uniqueidentifier = '8fd832a5-7e3b-4e6d-c101-000000000001';
IF EXISTS (SELECT 1 FROM dbo.Routes WHERE Id = @route) OR EXISTS (SELECT 1 FROM dbo.Tours WHERE Id = @tour)
    THROW 51034, 'One-time fixture already exists. Existing data is never overwritten.', 1;
DECLARE @now datetimeoffset(3) = SYSDATETIMEOFFSET();
INSERT dbo.Routes (Id, Name, Description, MapKey, MapFrame, StartX, StartY, StartYaw, EndMode, IsActive, CreatedAt)
VALUES (@route, N'[DEMO] Representative registration route', N'Registration UI fixture only.',
    N'demo-poi-baseline-v1', N'map', -1.5, -5.5, 0, 'LAST_POI', 1, @now);
INSERT dbo.RouteStops (Id, RouteId, PoiId, StopOrder, DwellSeconds, HeadStepsJson) VALUES
    ('8fd832a5-7e3b-4e6d-d101-000000000001', @route, '8fd832a5-7e3b-4e6d-a101-000000000001', 1, 30, N'[]'),
    ('8fd832a5-7e3b-4e6d-d101-000000000002', @route, '8fd832a5-7e3b-4e6d-a101-000000000002', 2, 30, N'[]');
INSERT dbo.Tours (Id, Name, Description, RouteId, ActiveRouteId, ScheduledStartAt, State, IsHeld, CreatedByUserId, CreatedAt)
VALUES (@tour, N'[DEMO] Representative registration Tour', N'Buổi thử luồng đăng ký, không vận hành robot.',
    @route, @route, DATEADD(day, 30, @now), 'SCHEDULED', 0, @admin, @now);
COMMIT;
