-- Persist the authoritative Fleet Sync map context on each physical robot.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @schemaVersion nvarchar(32) = (SELECT CONVERT(nvarchar(32), value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion');
IF ISNULL(@schemaVersion, N'') NOT IN (N'1.7', N'1.8')
    THROW 51090, 'Expected a v1.7 schema before the v1.8 robot map assignment patch.', 1;
IF OBJECT_ID(N'dbo.Robots', N'U') IS NULL OR OBJECT_ID(N'dbo.MapVersions', N'U') IS NULL
    THROW 51091, 'dbo.Robots and dbo.MapVersions are required for the v1.8 patch.', 1;

IF COL_LENGTH(N'dbo.Robots', N'AssignedMapVersionId') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots ADD AssignedMapVersionId UNIQUEIDENTIFIER NULL;';
IF COL_LENGTH(N'dbo.Robots', N'MapAssignedAt') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots ADD MapAssignedAt DATETIMEOFFSET(3) NULL;';
IF COL_LENGTH(N'dbo.Robots', N'MapAssignedByUserId') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots ADD MapAssignedByUserId UNIQUEIDENTIFIER NULL;';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_MapAssignment_Complete')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots WITH CHECK ADD CONSTRAINT CK_Robots_MapAssignment_Complete CHECK
        ((AssignedMapVersionId IS NULL AND MapAssignedAt IS NULL AND MapAssignedByUserId IS NULL) OR
         (AssignedMapVersionId IS NOT NULL AND MapAssignedAt IS NOT NULL AND MapAssignedByUserId IS NOT NULL));';
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_AssignedMapVersionId')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots WITH CHECK ADD CONSTRAINT FK_Robots_AssignedMapVersionId FOREIGN KEY (AssignedMapVersionId) REFERENCES dbo.MapVersions(Id);';
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_MapAssignedByUserId')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots WITH CHECK ADD CONSTRAINT FK_Robots_MapAssignedByUserId FOREIGN KEY (MapAssignedByUserId) REFERENCES dbo.Users(Id);';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name=N'IX_Robots_AssignedMapVersionId')
    CREATE INDEX IX_Robots_AssignedMapVersionId ON dbo.Robots(AssignedMapVersionId) WHERE AssignedMapVersionId IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.AuditLogs') AND name=N'UX_AuditLogs_RobotMapAssignmentRequest')
    CREATE UNIQUE INDEX UX_AuditLogs_RobotMapAssignmentRequest ON dbo.AuditLogs(ActorUserId, CorrelationId)
        WHERE ActorUserId IS NOT NULL AND CorrelationId IS NOT NULL AND [Action] IN (N'ROBOT_MAP_ASSIGNED', N'ROBOT_MAP_CLEARED');

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name=N'AssignedMapVersionId' AND system_type_id=36 AND is_nullable=1)
    THROW 51092, 'AssignedMapVersionId has an invalid type or nullability.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name=N'MapAssignedAt' AND system_type_id=43 AND scale=3 AND is_nullable=1)
    THROW 51093, 'MapAssignedAt has an invalid type or nullability.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name=N'MapAssignedByUserId' AND system_type_id=36 AND is_nullable=1)
    THROW 51094, 'MapAssignedByUserId has an invalid type or nullability.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_MapAssignment_Complete' AND is_disabled=0 AND is_not_trusted=0)
   OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_AssignedMapVersionId' AND is_disabled=0 AND is_not_trusted=0)
   OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_MapAssignedByUserId' AND is_disabled=0 AND is_not_trusted=0)
   OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name=N'IX_Robots_AssignedMapVersionId')
   OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.AuditLogs') AND name=N'UX_AuditLogs_RobotMapAssignmentRequest' AND is_unique=1)
    THROW 51095, 'Required v1.8 robot map assignment structure is incomplete.', 1;

IF @schemaVersion = N'1.7'
    EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.8';
COMMIT TRANSACTION;
