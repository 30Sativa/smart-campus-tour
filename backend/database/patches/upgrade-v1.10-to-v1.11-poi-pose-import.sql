-- POI pose-capture import for ADR-0038: source identity on proposals, an honest verification method and import receipts.
-- Existing verification rows become MANUAL_CHECK with their observations unchanged.
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRANSACTION;

DECLARE @schemaVersion nvarchar(32) = (SELECT CONVERT(nvarchar(32), value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion');
IF ISNULL(@schemaVersion, N'') NOT IN (N'1.10', N'1.11')
    THROW 51107, 'Expected a v1.10 schema before the v1.11 POI pose-import patch.', 1;
IF OBJECT_ID(N'dbo.PoiProposals', N'U') IS NULL OR OBJECT_ID(N'dbo.PoiVerificationRecords', N'U') IS NULL OR OBJECT_ID(N'dbo.MapAreas', N'U') IS NULL
    THROW 51108, 'dbo.PoiProposals, dbo.PoiVerificationRecords and dbo.MapAreas are required for the v1.11 patch.', 1;

IF COL_LENGTH(N'dbo.PoiProposals', N'SourcePoiId') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiProposals ADD SourceAreaKey NVARCHAR(100) NULL, SourcePoiId NVARCHAR(64) NULL;';
IF OBJECT_ID(N'dbo.FK_PoiProposals_SourceAreaKey', N'F') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiProposals WITH CHECK ADD CONSTRAINT FK_PoiProposals_SourceAreaKey FOREIGN KEY (SourceAreaKey) REFERENCES dbo.MapAreas(AreaKey);';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiProposals') AND name=N'CK_PoiProposals_Source_Complete')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiProposals WITH CHECK ADD CONSTRAINT CK_PoiProposals_Source_Complete CHECK
        ((SourceAreaKey IS NULL AND SourcePoiId IS NULL) OR (SourceAreaKey IS NOT NULL AND SourcePoiId IS NOT NULL));';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.PoiProposals') AND name=N'UX_PoiProposals_Source')
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_PoiProposals_Source ON dbo.PoiProposals(SourceAreaKey, SourcePoiId) WHERE SourcePoiId IS NOT NULL;';

IF COL_LENGTH(N'dbo.PoiVerificationRecords', N'VerificationMethod') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiVerificationRecords ADD
        VerificationMethod VARCHAR(20) NOT NULL CONSTRAINT DF_PoiVerificationRecords_Method DEFAULT (''MANUAL_CHECK'') WITH VALUES,
        SourceFileSha256 BINARY(32) NULL,
        SourceFileContent VARBINARY(MAX) NULL;';

-- SQL Server refuses a nullability change on a column used by a CHECK, so the two
-- result rules are replaced around it; both keep their MANUAL_CHECK meaning exactly.
IF COLUMNPROPERTY(OBJECT_ID(N'dbo.PoiVerificationRecords'), N'Reached', 'AllowsNull') = 0
BEGIN
    ALTER TABLE dbo.PoiVerificationRecords DROP CONSTRAINT CK_PoiVerificationRecords_Pass, CK_PoiVerificationRecords_Fail;
    ALTER TABLE dbo.PoiVerificationRecords ALTER COLUMN Reached BIT NULL;
    ALTER TABLE dbo.PoiVerificationRecords ALTER COLUMN Stopped BIT NULL;
    ALTER TABLE dbo.PoiVerificationRecords ALTER COLUMN LocalizationPassed BIT NULL;
    ALTER TABLE dbo.PoiVerificationRecords ALTER COLUMN CameraPresetConfirmed BIT NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiVerificationRecords') AND name=N'CK_PoiVerificationRecords_Pass')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiVerificationRecords WITH CHECK ADD CONSTRAINT CK_PoiVerificationRecords_Pass CHECK
        (VerificationMethod <> ''MANUAL_CHECK'' OR ResultCode <> ''PASS'' OR (Reached = 1 AND Stopped = 1 AND LocalizationPassed = 1 AND CameraPresetConfirmed = 1));';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiVerificationRecords') AND name=N'CK_PoiVerificationRecords_Fail')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiVerificationRecords WITH CHECK ADD CONSTRAINT CK_PoiVerificationRecords_Fail CHECK
        (VerificationMethod <> ''MANUAL_CHECK'' OR ResultCode <> ''FAIL'' OR (Reason IS NOT NULL AND LEN(LTRIM(RTRIM(Reason))) > 0 AND (Reached = 0 OR Stopped = 0 OR LocalizationPassed = 0 OR CameraPresetConfirmed = 0)));';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiVerificationRecords') AND name=N'CK_PoiVerificationRecords_MethodEvidence')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiVerificationRecords WITH CHECK ADD CONSTRAINT CK_PoiVerificationRecords_MethodEvidence CHECK (
        (VerificationMethod = ''MANUAL_CHECK'' AND Reached IS NOT NULL AND Stopped IS NOT NULL AND LocalizationPassed IS NOT NULL AND CameraPresetConfirmed IS NOT NULL
            AND SourceFileSha256 IS NULL AND SourceFileContent IS NULL)
        OR (VerificationMethod = ''POSE_CAPTURE'' AND ResultCode = ''PASS'' AND Reached IS NULL AND Stopped IS NULL AND LocalizationPassed IS NULL AND CameraPresetConfirmed IS NULL
            AND SourceFileSha256 IS NOT NULL AND SourceFileContent IS NOT NULL AND DATALENGTH(SourceFileContent) BETWEEN 1 AND 65536));';

IF OBJECT_ID(N'dbo.PoiImportReceipts', N'U') IS NULL
    EXEC sys.sp_executesql N'CREATE TABLE dbo.PoiImportReceipts
    (
        Id UNIQUEIDENTIFIER NOT NULL,
        RequestId UNIQUEIDENTIFIER NOT NULL,
        RequestHash BINARY(32) NOT NULL,
        ImportedByUserId UNIQUEIDENTIFIER NOT NULL,
        MapVersionId UNIQUEIDENTIFIER NOT NULL,
        RobotId UNIQUEIDENTIFIER NOT NULL,
        FileName NVARCHAR(255) NOT NULL,
        FileSha256 BINARY(32) NOT NULL,
        SourcePoiId NVARCHAR(64) NOT NULL,
        Action VARCHAR(20) NOT NULL,
        Verified BIT NOT NULL,
        ProposalId UNIQUEIDENTIFIER NOT NULL,
        ProposalRevisionId UNIQUEIDENTIFIER NOT NULL,
        ImportedAt DATETIMEOFFSET(3) NOT NULL,
        CONSTRAINT PK_PoiImportReceipts PRIMARY KEY (Id),
        CONSTRAINT FK_PoiImportReceipts_ImportedByUserId FOREIGN KEY (ImportedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT FK_PoiImportReceipts_MapVersionId FOREIGN KEY (MapVersionId) REFERENCES dbo.MapVersions(Id),
        CONSTRAINT FK_PoiImportReceipts_RobotId FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
        CONSTRAINT FK_PoiImportReceipts_ProposalId FOREIGN KEY (ProposalId) REFERENCES dbo.PoiProposals(Id),
        CONSTRAINT FK_PoiImportReceipts_ProposalRevisionId FOREIGN KEY (ProposalRevisionId) REFERENCES dbo.PoiProposalRevisions(Id),
        CONSTRAINT UQ_PoiImportReceipts_RequestFile UNIQUE (ImportedByUserId, RequestId, FileSha256),
        CONSTRAINT CK_PoiImportReceipts_Action CHECK (Action IN (''CREATE'',''NEW_REVISION'',''NO_CHANGE''))
    );';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.PoiImportReceipts') AND name=N'UX_PoiImportReceipts_MapFile')
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_PoiImportReceipts_MapFile ON dbo.PoiImportReceipts(MapVersionId, FileSha256) WHERE Action <> ''NO_CHANGE'';';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PoiProposals') AND name=N'SourcePoiId' AND is_nullable=1)
   OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.PoiProposals') AND name=N'UX_PoiProposals_Source' AND is_unique=1 AND has_filter=1)
   OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PoiVerificationRecords') AND name=N'VerificationMethod' AND is_nullable=0)
   OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PoiVerificationRecords') AND name=N'CameraPresetConfirmed' AND is_nullable=1)
   OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiVerificationRecords') AND name=N'CK_PoiVerificationRecords_MethodEvidence' AND is_disabled=0 AND is_not_trusted=0)
   OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiVerificationRecords') AND name=N'CK_PoiVerificationRecords_Pass' AND is_disabled=0 AND is_not_trusted=0)
   OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiVerificationRecords') AND name=N'CK_PoiVerificationRecords_Fail' AND is_disabled=0 AND is_not_trusted=0)
   OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.PoiImportReceipts') AND name=N'UX_PoiImportReceipts_MapFile' AND is_unique=1 AND has_filter=1)
    THROW 51109, 'Required v1.11 POI pose-import structure is incomplete.', 1;

IF @schemaVersion = N'1.10'
    EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.11';
COMMIT TRANSACTION;
