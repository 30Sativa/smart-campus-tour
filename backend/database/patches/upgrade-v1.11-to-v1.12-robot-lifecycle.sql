-- Robot integrity for ADR-0039: one robot per map area, and a deactivation record that leaves IsDispatchEnabled alone.
-- Existing assignments get their area backfilled. Existing data that already breaks the rule stops the patch.
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRANSACTION;

DECLARE @schemaVersion nvarchar(32) = (SELECT CONVERT(nvarchar(32), value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion');
IF ISNULL(@schemaVersion, N'') NOT IN (N'1.11', N'1.12')
    THROW 51110, 'Expected a v1.11 schema before the v1.12 robot lifecycle patch.', 1;
IF OBJECT_ID(N'dbo.Robots', N'U') IS NULL OR OBJECT_ID(N'dbo.MapVersions', N'U') IS NULL OR OBJECT_ID(N'dbo.MapAreas', N'U') IS NULL
    THROW 51111, 'dbo.Robots, dbo.MapVersions and dbo.MapAreas are required for the v1.12 patch.', 1;

-- Nothing is unassigned silently: an operator decides which robot keeps the area.
DECLARE @violations nvarchar(1800) = (
    SELECT STRING_AGG(CONVERT(nvarchar(max), CONCAT(shared.AreaKey, N' (', shared.RobotCodes, N')')), N'; ')
    FROM (
        SELECT m.AreaKey, STRING_AGG(CONVERT(nvarchar(max), r.RobotCode), N', ') AS RobotCodes
        FROM dbo.Robots r JOIN dbo.MapVersions m ON m.Id = r.AssignedMapVersionId
        GROUP BY m.AreaKey HAVING COUNT(*) > 1
    ) shared);
IF @violations IS NOT NULL
BEGIN
    DECLARE @message nvarchar(2048) = CONCAT(N'More than one robot is assigned to the same map area: ', @violations, N'. Clear the extra assignments, then rerun this patch.');
    ;THROW 51112, @message, 1;
END;

IF COL_LENGTH(N'dbo.Robots', N'AssignedAreaKey') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots ADD
        AssignedAreaKey NVARCHAR(100) NULL,
        DeactivatedAt DATETIMEOFFSET(3) NULL,
        DeactivatedByUserId UNIQUEIDENTIFIER NULL,
        DeactivationReason NVARCHAR(500) NULL;';

EXEC sys.sp_executesql N'UPDATE r SET AssignedAreaKey = m.AreaKey
    FROM dbo.Robots r JOIN dbo.MapVersions m ON m.Id = r.AssignedMapVersionId
    WHERE r.AssignedAreaKey IS NULL OR r.AssignedAreaKey <> m.AreaKey;';

IF OBJECT_ID(N'dbo.FK_Robots_AssignedAreaKey', N'F') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots WITH CHECK ADD CONSTRAINT FK_Robots_AssignedAreaKey FOREIGN KEY (AssignedAreaKey) REFERENCES dbo.MapAreas(AreaKey);';
IF OBJECT_ID(N'dbo.FK_Robots_DeactivatedByUserId', N'F') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots WITH CHECK ADD CONSTRAINT FK_Robots_DeactivatedByUserId FOREIGN KEY (DeactivatedByUserId) REFERENCES dbo.Users(Id);';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_AssignedArea_Complete')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots WITH CHECK ADD CONSTRAINT CK_Robots_AssignedArea_Complete CHECK
        ((AssignedMapVersionId IS NULL AND AssignedAreaKey IS NULL) OR (AssignedMapVersionId IS NOT NULL AND AssignedAreaKey IS NOT NULL));';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_Deactivation_Complete')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots WITH CHECK ADD CONSTRAINT CK_Robots_Deactivation_Complete CHECK
        ((DeactivatedAt IS NULL AND DeactivatedByUserId IS NULL AND DeactivationReason IS NULL)
         OR (DeactivatedAt IS NOT NULL AND DeactivatedByUserId IS NOT NULL AND DeactivationReason IS NOT NULL));';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name=N'UX_Robots_AssignedArea')
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_Robots_AssignedArea ON dbo.Robots(AssignedAreaKey) WHERE AssignedAreaKey IS NOT NULL;';

IF COL_LENGTH(N'dbo.Robots', N'DeactivatedAt') IS NULL
   OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name=N'UX_Robots_AssignedArea' AND is_unique=1 AND has_filter=1)
   OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_AssignedArea_Complete' AND is_disabled=0 AND is_not_trusted=0)
   OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_Deactivation_Complete' AND is_disabled=0 AND is_not_trusted=0)
    THROW 51113, 'Required v1.12 robot lifecycle structure is incomplete.', 1;

IF @schemaVersion = N'1.11'
    EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.12';
COMMIT TRANSACTION;
