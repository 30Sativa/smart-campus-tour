-- Add durable first accepted Fleet Sync context. This is evidence only; it is not robot readiness.
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

DECLARE @schemaVersion nvarchar(32) = CONVERT(nvarchar(32),
    (SELECT value FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion'));
IF ISNULL(@schemaVersion, N'') NOT IN (N'1.4', N'1.5')
    THROW 51060, 'Expected a complete v1.4 schema before the v1.5 robot connection confirmation patch.', 1;

IF OBJECT_ID(N'dbo.Robots', N'U') IS NULL
    THROW 51061, 'dbo.Robots is required for the v1.5 robot connection confirmation patch.', 1;

IF COL_LENGTH(N'dbo.Robots', N'FirstAcceptedSyncAt') IS NULL
    ALTER TABLE dbo.Robots ADD FirstAcceptedSyncAt DATETIMEOFFSET(3) NULL;
IF COL_LENGTH(N'dbo.Robots', N'FirstAcceptedMapKey') IS NULL
    ALTER TABLE dbo.Robots ADD FirstAcceptedMapKey NVARCHAR(100) NULL;
IF COL_LENGTH(N'dbo.Robots', N'FirstAcceptedFrameId') IS NULL
    ALTER TABLE dbo.Robots ADD FirstAcceptedFrameId NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_FirstAcceptedSync_Complete')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots ADD CONSTRAINT CK_Robots_FirstAcceptedSync_Complete CHECK
        ((FirstAcceptedSyncAt IS NULL AND FirstAcceptedMapKey IS NULL AND FirstAcceptedFrameId IS NULL) OR
         (FirstAcceptedSyncAt IS NOT NULL AND FirstAcceptedMapKey IS NOT NULL AND FirstAcceptedFrameId IS NOT NULL));';

IF COL_LENGTH(N'dbo.Robots', N'FirstAcceptedSyncAt') IS NULL
    OR COL_LENGTH(N'dbo.Robots', N'FirstAcceptedMapKey') IS NULL
    OR COL_LENGTH(N'dbo.Robots', N'FirstAcceptedFrameId') IS NULL
    OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_FirstAcceptedSync_Complete')
    THROW 51062, 'Required v1.5 robot connection confirmation structure is incomplete.', 1;

SET @schemaVersion = CONVERT(nvarchar(32),
    (SELECT value FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion'));
IF @schemaVersion = N'1.4'
    EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.5';
GO

COMMIT TRANSACTION;
GO
