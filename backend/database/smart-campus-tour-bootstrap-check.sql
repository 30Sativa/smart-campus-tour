-- SQLCMD input: SchemaHash is the SHA-256 of the mounted, CRLF-normalized snapshot.
-- Only these two audited snapshots differ by comments. Preserve the existing marker and data.
-- Do not extend this compatibility pair for executable schema changes or unknown database markers.
SET NOCOUNT ON;
DECLARE @hash nvarchar(64) = (
    SELECT CONVERT(nvarchar(64), value) FROM sys.extended_properties
    WHERE class = 0 AND name = N'CampusTourBootstrapHash');
DECLARE @current nvarchar(64) = N'$(SchemaHash)';
DECLARE @v14 nvarchar(64) = N'$(SchemaHashV14)';
DECLARE @schemaVersion nvarchar(32) = (
    SELECT CONVERT(nvarchar(32), value) FROM sys.extended_properties
    WHERE class = 0 AND name = N'CampusTourSchemaVersion');
DECLARE @v14ObjectsPresent bit = CASE WHEN
    OBJECT_ID(N'dbo.MapVersions', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.MapDeploymentChecks', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.PoiProposals', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.PoiProposalRevisions', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.PoiVerificationRecords', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.RouteRevisions', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.RouteTestRuns', N'U') IS NOT NULL AND
    OBJECT_ID(N'dbo.RosterEmailChangeRequests', N'U') IS NOT NULL AND
    COL_LENGTH(N'dbo.Pois', N'RowVersion') IS NOT NULL AND
    COL_LENGTH(N'dbo.Routes', N'AuthoringMode') IS NOT NULL AND
    COL_LENGTH(N'dbo.RosterRows', N'ParticipationState') IS NOT NULL AND
    COL_LENGTH(N'dbo.BrowserSessions', N'DeviceTokenHash') IS NOT NULL
    THEN 1 ELSE 0 END;
IF @hash = @current AND @current = @v14 AND @schemaVersion = N'1.4' AND @v14ObjectsPresent = 1
    SELECT 'READY';
ELSE IF @schemaVersion = N'1.4' AND @v14ObjectsPresent = 1
    SELECT 'READY';
ELSE IF @schemaVersion = N'1.4'
    THROW 51001, 'Database schema version marker is 1.4 but required structure is incomplete; inspect and repair from a verified backup.', 1;
ELSE IF @hash IN (
    N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68',
    N'2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67',
    N'b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43')
    SELECT 'UPGRADE_REQUIRED';
ELSE IF @hash IS NULL AND NOT EXISTS (SELECT 1 FROM sys.tables WHERE is_ms_shipped = 0)
    SELECT 'EMPTY';
ELSE
    THROW 51000, 'Existing database is unmarked or has a different schema snapshot. Review it manually; automatic migration is disabled.', 1;
