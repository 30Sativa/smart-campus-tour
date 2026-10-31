-- Scheduling inputs for ADR-0035: what a route test measured, and the seconds a reservation was sized from.
-- Existing rows keep NULL: an old run has no agreed basis, and an old reservation keeps the window it was given.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @schemaVersion nvarchar(32) = (SELECT CONVERT(nvarchar(32), value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion');
IF ISNULL(@schemaVersion, N'') NOT IN (N'1.9', N'1.10')
    THROW 51104, 'Expected a v1.9 schema before the v1.10 Tour scheduling patch.', 1;
IF OBJECT_ID(N'dbo.RouteTestRuns', N'U') IS NULL OR OBJECT_ID(N'dbo.TourRobotReservations', N'U') IS NULL
    THROW 51105, 'dbo.RouteTestRuns and dbo.TourRobotReservations are required for the v1.10 patch.', 1;

IF COL_LENGTH(N'dbo.RouteTestRuns', N'MeasurementBasis') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.RouteTestRuns ADD MeasurementBasis NVARCHAR(32) NULL;';
IF COL_LENGTH(N'dbo.TourRobotReservations', N'ExpectedDurationSeconds') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.TourRobotReservations ADD ExpectedDurationSeconds INT NULL;';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RouteTestRuns') AND name=N'CK_RouteTestRuns_MeasurementBasis')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.RouteTestRuns WITH CHECK ADD CONSTRAINT CK_RouteTestRuns_MeasurementBasis CHECK
        (MeasurementBasis IS NULL OR MeasurementBasis = N''TOTAL_WITH_DWELL'');';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.TourRobotReservations') AND name=N'CK_TourRobotReservations_ExpectedDuration')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.TourRobotReservations WITH CHECK ADD CONSTRAINT CK_TourRobotReservations_ExpectedDuration CHECK
        (ExpectedDurationSeconds IS NULL OR ExpectedDurationSeconds >= MeasuredDurationSeconds);';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.RouteTestRuns') AND name=N'MeasurementBasis' AND system_type_id=231 AND is_nullable=1)
   OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.TourRobotReservations') AND name=N'ExpectedDurationSeconds' AND system_type_id=56 AND is_nullable=1)
   OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RouteTestRuns') AND name=N'CK_RouteTestRuns_MeasurementBasis' AND is_disabled=0 AND is_not_trusted=0)
   OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.TourRobotReservations') AND name=N'CK_TourRobotReservations_ExpectedDuration' AND is_disabled=0 AND is_not_trusted=0)
    THROW 51106, 'Required v1.10 Tour scheduling structure is incomplete.', 1;

IF @schemaVersion = N'1.9'
    EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.10';
COMMIT TRANSACTION;
