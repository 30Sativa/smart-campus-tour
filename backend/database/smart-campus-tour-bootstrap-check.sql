-- SQLCMD input: SchemaHash is the current v1.9 snapshot hash; prior hashes are used only for controlled upgrades.
-- Upgrade paths preserve the original bootstrap hash and advance only CampusTourSchemaVersion.
SET NOCOUNT ON;
DECLARE @hash nvarchar(64) = (
    SELECT CONVERT(nvarchar(64), value) FROM sys.extended_properties
    WHERE class = 0 AND name = N'CampusTourBootstrapHash');
DECLARE @current nvarchar(64) = N'$(SchemaHash)';
DECLARE @v15 nvarchar(64) = N'$(SchemaHashV15)';
DECLARE @v14 nvarchar(64) = N'$(SchemaHashV14)';
DECLARE @v16 nvarchar(64) = N'$(SchemaHashV16)';
DECLARE @v17 nvarchar(64) = N'$(SchemaHashV17)';
DECLARE @v18 nvarchar(64) = N'$(SchemaHashV18)';
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
DECLARE @v15ObjectsPresent bit = CASE WHEN @v14ObjectsPresent = 1 AND
    COL_LENGTH(N'dbo.Robots', N'FirstAcceptedSyncAt') IS NOT NULL AND
    COL_LENGTH(N'dbo.Robots', N'FirstAcceptedMapKey') IS NOT NULL AND
    COL_LENGTH(N'dbo.Robots', N'FirstAcceptedFrameId') IS NOT NULL AND
    EXISTS (SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_FirstAcceptedSync_Complete')
    THEN 1 ELSE 0 END;
DECLARE @v16ObjectsPresent bit = CASE WHEN @v15ObjectsPresent = 1 AND
    EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CredentialHash' AND is_nullable=1) AND
    COL_LENGTH(N'dbo.Robots', N'CredentialIssuedAt') IS NOT NULL AND
    COL_LENGTH(N'dbo.Robots', N'CredentialIssuedByUserId') IS NOT NULL AND
    COL_LENGTH(N'dbo.Robots', N'CredentialHint') IS NOT NULL AND
    COL_LENGTH(N'dbo.Robots', N'CredentialRevokedAt') IS NOT NULL AND
    COL_LENGTH(N'dbo.Robots', N'CredentialRevokedByUserId') IS NOT NULL AND
    EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_CredentialIssueMetadata') AND
    EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_CredentialRevocationMetadata') AND
    EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_CredentialIssuedByUserId') AND
    EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_CredentialRevokedByUserId') AND
    EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.AuditLogs') AND name=N'UX_AuditLogs_RobotCredentialRequest' AND is_unique=1)
    THEN 1 ELSE 0 END;
DECLARE @knownPriorHash bit = CASE WHEN @hash IN (
    @v18,
    @v17,
    @v16,
    @v14,
    @v15,
    N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68',
    N'2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67',
    N'b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43')
    THEN 1 ELSE 0 END;

DECLARE @v17ObjectsPresent bit = CASE WHEN @v16ObjectsPresent = 1 AND
    EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PoiProposalRevisions') AND name=N'NarrationText' AND system_type_id=231 AND max_length=8000 AND is_nullable=1) AND
    EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PoiProposalRevisions') AND name=N'FallbackVideoUrl' AND system_type_id=231 AND max_length=4096 AND is_nullable=1) AND
    EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.RouteRevisionStops') AND name=N'NarrationText' AND system_type_id=231 AND max_length=8000 AND is_nullable=1) AND
    EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.RouteRevisionStops') AND name=N'FallbackVideoUrl' AND system_type_id=231 AND max_length=4096 AND is_nullable=1) AND
    EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiProposalRevisions') AND name=N'CK_PoiProposalRevisions_FallbackVideoHttps' AND is_disabled=0 AND is_not_trusted=0) AND
    EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RouteRevisionStops') AND name=N'CK_RouteRevisionStops_FallbackVideoHttps' AND is_disabled=0 AND is_not_trusted=0)
    THEN 1 ELSE 0 END;

DECLARE @v18ObjectsPresent bit = CASE WHEN @v17ObjectsPresent = 1 AND
    COL_LENGTH(N'dbo.Robots', N'AssignedMapVersionId') IS NOT NULL AND
    COL_LENGTH(N'dbo.Robots', N'MapAssignedAt') IS NOT NULL AND
    COL_LENGTH(N'dbo.Robots', N'MapAssignedByUserId') IS NOT NULL AND
    EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_MapAssignment_Complete' AND is_disabled=0 AND is_not_trusted=0) AND
    EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_AssignedMapVersionId' AND is_disabled=0 AND is_not_trusted=0) AND
    EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_MapAssignedByUserId' AND is_disabled=0 AND is_not_trusted=0) AND
    EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name=N'IX_Robots_AssignedMapVersionId')
    AND EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.AuditLogs') AND name=N'UX_AuditLogs_RobotMapAssignmentRequest' AND is_unique=1)
    THEN 1 ELSE 0 END;

DECLARE @v19ObjectsPresent bit = CASE WHEN @v18ObjectsPresent = 1 AND
    OBJECT_ID(N'dbo.TourRobotReservations', N'U') IS NOT NULL AND
    COL_LENGTH(N'dbo.Tours', N'RouteRevisionId') IS NOT NULL AND
    COL_LENGTH(N'dbo.Tours', N'OperatorUserId') IS NOT NULL AND
    EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Tours') AND name=N'CK_Tours_VersionedTarget_Complete' AND is_disabled=0 AND is_not_trusted=0) AND
    EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Tours') AND name=N'FK_Tours_RouteRevisionId' AND is_disabled=0 AND is_not_trusted=0) AND
    EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Tours') AND name=N'FK_Tours_OperatorUserId' AND is_disabled=0 AND is_not_trusted=0) AND
    EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TourRobotReservations') AND name=N'UX_TourRobotReservations_ActiveTour' AND is_unique=1)
    THEN 1 ELSE 0 END;

IF @schemaVersion = N'1.9' AND @v19ObjectsPresent = 1 AND (@hash = @current OR @knownPriorHash = 1)
    SELECT 'READY';
ELSE IF @schemaVersion = N'1.9'
    THROW 51001, 'Database schema version marker is 1.9 but the snapshot marker or required structure is invalid; inspect and repair from a verified backup.', 1;
ELSE IF @schemaVersion = N'1.8' AND @v18ObjectsPresent = 1 AND (@hash = @v18 OR @knownPriorHash = 1)
    SELECT 'UPGRADE_REQUIRED';
ELSE IF @schemaVersion = N'1.8'
    THROW 51006, 'Database schema version marker is 1.8 but the snapshot marker or required structure is invalid; inspect and repair from a verified backup.', 1;
ELSE IF @schemaVersion = N'1.7' AND @v17ObjectsPresent = 1 AND (@hash = @v17 OR @knownPriorHash = 1)
    SELECT 'UPGRADE_REQUIRED';
ELSE IF @schemaVersion = N'1.7'
    THROW 51005, 'Database schema version marker is 1.7 but the snapshot marker or required structure is invalid; inspect and repair from a verified backup.', 1;
ELSE IF @schemaVersion = N'1.6' AND @v16ObjectsPresent = 1 AND (@hash = @v16 OR @knownPriorHash = 1)
    SELECT 'UPGRADE_REQUIRED';
ELSE IF @schemaVersion = N'1.6'
    THROW 51004, 'Database schema version marker is 1.6 but the snapshot marker or required structure is invalid; inspect and repair from a verified backup.', 1;
ELSE IF @schemaVersion = N'1.5' AND @v15ObjectsPresent = 1 AND (@hash = @v15 OR @knownPriorHash = 1)
    SELECT 'UPGRADE_REQUIRED';
ELSE IF @schemaVersion = N'1.5'
    THROW 51003, 'Database schema version marker is 1.5 but its snapshot marker or required structure is invalid; inspect and repair from a verified backup.', 1;
ELSE IF @schemaVersion = N'1.4' AND @v14ObjectsPresent = 1 AND @knownPriorHash = 1
    SELECT 'UPGRADE_REQUIRED';
ELSE IF @schemaVersion = N'1.4'
    THROW 51002, 'Database schema version marker is 1.4 but its prior snapshot marker or required structure is invalid; inspect and repair from a verified backup.', 1;
ELSE IF @hash IN (
    N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68',
    N'2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67',
    N'b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43')
    SELECT 'UPGRADE_REQUIRED';
ELSE IF @hash IS NULL AND NOT EXISTS (SELECT 1 FROM sys.tables WHERE is_ms_shipped = 0)
    SELECT 'EMPTY';
ELSE
    THROW 51000, 'Existing database is unmarked or has a different schema snapshot. Review it manually; automatic migration is disabled.', 1;
