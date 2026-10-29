-- Robot credential issue/rotate/revoke metadata and request-id audit uniqueness (ADR-0030).
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @schemaVersion nvarchar(32) = CONVERT(nvarchar(32),
    (SELECT value FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion'));
IF ISNULL(@schemaVersion, N'') NOT IN (N'1.5', N'1.6')
    THROW 51070, 'Expected a v1.5 schema before the v1.6 robot credential lifecycle patch.', 1;
IF OBJECT_ID(N'dbo.Robots', N'U') IS NULL OR OBJECT_ID(N'dbo.AuditLogs', N'U') IS NULL
    THROW 51071, 'dbo.Robots and dbo.AuditLogs are required for the v1.6 patch.', 1;

IF COL_LENGTH(N'dbo.Robots', N'FirstAcceptedSyncAt') IS NULL OR
   COL_LENGTH(N'dbo.Robots', N'FirstAcceptedMapKey') IS NULL OR
   COL_LENGTH(N'dbo.Robots', N'FirstAcceptedFrameId') IS NULL
    THROW 51072, 'Required v1.5 robot confirmation structure is incomplete.', 1;

IF COL_LENGTH(N'dbo.Robots', N'CredentialIssuedAt') IS NULL
    ALTER TABLE dbo.Robots ADD CredentialIssuedAt DATETIMEOFFSET(3) NULL;
IF COL_LENGTH(N'dbo.Robots', N'CredentialIssuedByUserId') IS NULL
    ALTER TABLE dbo.Robots ADD CredentialIssuedByUserId UNIQUEIDENTIFIER NULL;
IF COL_LENGTH(N'dbo.Robots', N'CredentialHint') IS NULL
    ALTER TABLE dbo.Robots ADD CredentialHint NVARCHAR(4) NULL;
IF COL_LENGTH(N'dbo.Robots', N'CredentialRevokedAt') IS NULL
    ALTER TABLE dbo.Robots ADD CredentialRevokedAt DATETIMEOFFSET(3) NULL;
IF COL_LENGTH(N'dbo.Robots', N'CredentialRevokedByUserId') IS NULL
    ALTER TABLE dbo.Robots ADD CredentialRevokedByUserId UNIQUEIDENTIFIER NULL;

-- Earlier registration stored an empty varbinary for an unissued key.
UPDATE dbo.Robots SET CredentialHash = NULL WHERE DATALENGTH(CredentialHash) = 0;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CredentialHash' AND is_nullable=0)
    ALTER TABLE dbo.Robots ALTER COLUMN CredentialHash VARBINARY(256) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_CredentialIssueMetadata')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots ADD CONSTRAINT CK_Robots_CredentialIssueMetadata CHECK
        ((CredentialIssuedAt IS NULL AND CredentialHint IS NULL) OR
         (CredentialIssuedAt IS NOT NULL AND CredentialHint IS NOT NULL));';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_CredentialRevocationMetadata')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots ADD CONSTRAINT CK_Robots_CredentialRevocationMetadata CHECK
        ((CredentialRevokedAt IS NULL AND CredentialRevokedByUserId IS NULL) OR
         (CredentialRevokedAt IS NOT NULL AND CredentialRevokedByUserId IS NOT NULL AND CredentialHash IS NULL));';
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_CredentialIssuedByUserId')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots WITH CHECK ADD CONSTRAINT FK_Robots_CredentialIssuedByUserId
        FOREIGN KEY (CredentialIssuedByUserId) REFERENCES dbo.Users(Id);';
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_CredentialRevokedByUserId')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Robots WITH CHECK ADD CONSTRAINT FK_Robots_CredentialRevokedByUserId
        FOREIGN KEY (CredentialRevokedByUserId) REFERENCES dbo.Users(Id);';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.AuditLogs') AND name=N'UX_AuditLogs_RobotCredentialRequest')
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_AuditLogs_RobotCredentialRequest
        ON dbo.AuditLogs(RobotId, CorrelationId)
        WHERE RobotId IS NOT NULL AND CorrelationId IS NOT NULL AND
            [Action] IN (N''ROBOT_CREDENTIAL_ISSUED'', N''ROBOT_CREDENTIAL_ROTATED'', N''ROBOT_CREDENTIAL_REVOKED'');';

IF COL_LENGTH(N'dbo.Robots', N'CredentialHash') IS NULL OR
   NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CredentialHash' AND is_nullable=1) OR
   COL_LENGTH(N'dbo.Robots', N'CredentialIssuedAt') IS NULL OR
   COL_LENGTH(N'dbo.Robots', N'CredentialIssuedByUserId') IS NULL OR
   COL_LENGTH(N'dbo.Robots', N'CredentialHint') IS NULL OR
   COL_LENGTH(N'dbo.Robots', N'CredentialRevokedAt') IS NULL OR
   COL_LENGTH(N'dbo.Robots', N'CredentialRevokedByUserId') IS NULL OR
   NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_CredentialIssueMetadata') OR
   NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'CK_Robots_CredentialRevocationMetadata') OR
   NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_CredentialIssuedByUserId') OR
   NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Robots') AND name=N'FK_Robots_CredentialRevokedByUserId') OR
   NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.AuditLogs') AND name=N'UX_AuditLogs_RobotCredentialRequest' AND is_unique=1)
    THROW 51073, 'Required v1.6 robot credential lifecycle structure is incomplete.', 1;

IF @schemaVersion = N'1.5'
    EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.6';

COMMIT TRANSACTION;
