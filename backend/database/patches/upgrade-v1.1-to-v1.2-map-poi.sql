-- Additive Database First upgrade for ADR-0021.
-- Apply only after verifying the database is a backed-up v1.1 database.
-- This script never modifies or deletes existing account, POI, route or tour rows.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.MapAreas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MapAreas
    (
        AreaKey             NVARCHAR(100)       NOT NULL,
        DisplayName         NVARCHAR(150)       NOT NULL,
        CreatedByUserId     UNIQUEIDENTIFIER    NOT NULL,
        CreatedAt           DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_MapAreas PRIMARY KEY (AreaKey),
        CONSTRAINT FK_MapAreas_CreatedByUserId FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id)
    );
END;

IF OBJECT_ID(N'dbo.MapVersions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MapVersions
    (
        Id                  UNIQUEIDENTIFIER    NOT NULL,
        AreaKey             NVARCHAR(100)       NOT NULL,
        VersionNumber       INT                 NOT NULL,
        MapKey              NVARCHAR(100)       NOT NULL,
        PackageFileName     NVARCHAR(255)       NOT NULL,
        PackageSha256       BINARY(32)          NOT NULL,
        RequestHash         BINARY(32)          NOT NULL,
        PackageBytes        VARBINARY(MAX)      NOT NULL,
        ImageFileName       NVARCHAR(255)       NOT NULL,
        ImageWidth          INT                 NOT NULL,
        ImageHeight         INT                 NOT NULL,
        Resolution          DECIMAL(12,6)       NOT NULL,
        OriginX             DECIMAL(10,4)       NOT NULL,
        OriginY             DECIMAL(10,4)       NOT NULL,
        OriginYaw           DECIMAL(9,6)        NOT NULL,
        Negate              BIT                 NOT NULL,
        OccupiedThreshold   DECIMAL(5,4)        NOT NULL,
        FreeThreshold       DECIMAL(5,4)        NOT NULL,
        FrameId             NVARCHAR(100)       NOT NULL,
        ValidationStatus    VARCHAR(20)         NOT NULL,
        UploadedByUserId    UNIQUEIDENTIFIER    NOT NULL,
        UploadRequestId     UNIQUEIDENTIFIER    NOT NULL,
        UploadedAt          DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_MapVersions PRIMARY KEY (Id),
        CONSTRAINT FK_MapVersions_AreaKey FOREIGN KEY (AreaKey) REFERENCES dbo.MapAreas(AreaKey),
        CONSTRAINT FK_MapVersions_UploadedByUserId FOREIGN KEY (UploadedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_MapVersions_AreaVersion UNIQUE (AreaKey, VersionNumber),
        CONSTRAINT UQ_MapVersions_MapKey UNIQUE (MapKey),
        CONSTRAINT UQ_MapVersions_UploaderRequest UNIQUE (UploadedByUserId, UploadRequestId),
        CONSTRAINT CK_MapVersions_VersionNumber CHECK (VersionNumber > 0),
        CONSTRAINT CK_MapVersions_PackageLength CHECK (DATALENGTH(PackageBytes) BETWEEN 1 AND 33554432),
        CONSTRAINT CK_MapVersions_Dimensions CHECK (ImageWidth BETWEEN 1 AND 8192 AND ImageHeight BETWEEN 1 AND 8192 AND CONVERT(BIGINT, ImageWidth) * ImageHeight <= 32000000),
        CONSTRAINT CK_MapVersions_Resolution CHECK (Resolution > 0),
        CONSTRAINT CK_MapVersions_OriginYaw CHECK (OriginYaw = 0),
        CONSTRAINT CK_MapVersions_Thresholds CHECK (FreeThreshold >= 0 AND OccupiedThreshold <= 1 AND FreeThreshold < OccupiedThreshold),
        CONSTRAINT CK_MapVersions_Frame CHECK (FrameId = N'map'),
        CONSTRAINT CK_MapVersions_ValidationStatus CHECK (ValidationStatus = 'VALID')
    );
    CREATE INDEX IX_MapVersions_AreaUploaded ON dbo.MapVersions(AreaKey, UploadedAt DESC, Id);
END;

IF OBJECT_ID(N'dbo.MapDeploymentChecks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MapDeploymentChecks
    (
        Id                  UNIQUEIDENTIFIER    NOT NULL,
        MapVersionId        UNIQUEIDENTIFIER    NOT NULL,
        RobotId             UNIQUEIDENTIFIER    NOT NULL,
        PackageSha256       BINARY(32)          NOT NULL,
        LocalizationPassed  BIT                 NOT NULL,
        DisplayPassed       BIT                 NOT NULL,
        EvidenceNote        NVARCHAR(2000)      NOT NULL,
        CheckedByUserId     UNIQUEIDENTIFIER    NOT NULL,
        RequestId           UNIQUEIDENTIFIER    NOT NULL,
        RequestHash         BINARY(32)          NOT NULL,
        CheckedAt           DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_MapDeploymentChecks PRIMARY KEY (Id),
        CONSTRAINT FK_MapDeploymentChecks_MapVersionId FOREIGN KEY (MapVersionId) REFERENCES dbo.MapVersions(Id),
        CONSTRAINT FK_MapDeploymentChecks_RobotId FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
        CONSTRAINT FK_MapDeploymentChecks_CheckedByUserId FOREIGN KEY (CheckedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_MapDeploymentChecks_ActorRequest UNIQUE (CheckedByUserId, RequestId),
        CONSTRAINT CK_MapDeploymentChecks_Evidence CHECK (LEN(LTRIM(RTRIM(EvidenceNote))) > 0)
    );
    CREATE INDEX IX_MapDeploymentChecks_VersionTime ON dbo.MapDeploymentChecks(MapVersionId, CheckedAt DESC, Id);
END;

IF OBJECT_ID(N'dbo.PoiProposals', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PoiProposals
    (
        Id                  UNIQUEIDENTIFIER    NOT NULL,
        CreatedByUserId     UNIQUEIDENTIFIER    NOT NULL,
        CreateRequestId     UNIQUEIDENTIFIER    NOT NULL,
        CreateRequestHash   BINARY(32)          NOT NULL,
        CurrentRevision     INT                 NOT NULL,
        CreatedAt           DATETIMEOFFSET(3)   NOT NULL,
        UpdatedAt           DATETIMEOFFSET(3)   NULL,
        RowVersion          ROWVERSION          NOT NULL,
        CONSTRAINT PK_PoiProposals PRIMARY KEY (Id),
        CONSTRAINT FK_PoiProposals_CreatedByUserId FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_PoiProposals_OwnerRequest UNIQUE (CreatedByUserId, CreateRequestId),
        CONSTRAINT CK_PoiProposals_CurrentRevision CHECK (CurrentRevision > 0)
    );
END;

IF OBJECT_ID(N'dbo.PoiProposalRevisions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PoiProposalRevisions
    (
        Id                  UNIQUEIDENTIFIER    NOT NULL,
        ProposalId          UNIQUEIDENTIFIER    NOT NULL,
        RevisionNumber      INT                 NOT NULL,
        MapVersionId        UNIQUEIDENTIFIER    NOT NULL,
        Name                NVARCHAR(150)       NOT NULL,
        Purpose             NVARCHAR(500)       NOT NULL,
        Description         NVARCHAR(2000)      NULL,
        X                   DECIMAL(10,4)       NOT NULL,
        Y                   DECIMAL(10,4)       NOT NULL,
        Yaw                 DECIMAL(9,6)        NOT NULL,
        CameraPreset        NVARCHAR(80)        NOT NULL,
        NavigationFingerprint BINARY(32)        NOT NULL,
        RequestId           UNIQUEIDENTIFIER    NOT NULL,
        RequestHash         BINARY(32)          NOT NULL,
        CreatedByUserId     UNIQUEIDENTIFIER    NOT NULL,
        CreatedAt           DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_PoiProposalRevisions PRIMARY KEY (Id),
        CONSTRAINT FK_PoiProposalRevisions_ProposalId FOREIGN KEY (ProposalId) REFERENCES dbo.PoiProposals(Id),
        CONSTRAINT FK_PoiProposalRevisions_MapVersionId FOREIGN KEY (MapVersionId) REFERENCES dbo.MapVersions(Id),
        CONSTRAINT FK_PoiProposalRevisions_CreatedByUserId FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_PoiProposalRevisions_Number UNIQUE (ProposalId, RevisionNumber),
        CONSTRAINT UQ_PoiProposalRevisions_Request UNIQUE (ProposalId, RequestId),
        CONSTRAINT CK_PoiProposalRevisions_Number CHECK (RevisionNumber > 0)
    );
    CREATE INDEX IX_PoiProposalRevisions_MapVersion ON dbo.PoiProposalRevisions(MapVersionId, CreatedAt, Id);
END;

IF OBJECT_ID(N'dbo.PoiProposalSubmissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PoiProposalSubmissions
    (
        Id                  UNIQUEIDENTIFIER    NOT NULL,
        ProposalRevisionId  UNIQUEIDENTIFIER    NOT NULL,
        SubmittedByUserId   UNIQUEIDENTIFIER    NOT NULL,
        RequestId           UNIQUEIDENTIFIER    NOT NULL,
        RequestHash         BINARY(32)          NOT NULL,
        SubmittedAt         DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_PoiProposalSubmissions PRIMARY KEY (Id),
        CONSTRAINT FK_PoiProposalSubmissions_RevisionId FOREIGN KEY (ProposalRevisionId) REFERENCES dbo.PoiProposalRevisions(Id),
        CONSTRAINT FK_PoiProposalSubmissions_SubmittedByUserId FOREIGN KEY (SubmittedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_PoiProposalSubmissions_Revision UNIQUE (ProposalRevisionId),
        CONSTRAINT UQ_PoiProposalSubmissions_ActorRequest UNIQUE (SubmittedByUserId, RequestId)
    );
    CREATE INDEX IX_PoiProposalSubmissions_SubmittedAt ON dbo.PoiProposalSubmissions(SubmittedAt, ProposalRevisionId);
END;

IF OBJECT_ID(N'dbo.PoiVerificationRecords', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PoiVerificationRecords
    (
        Id                      UNIQUEIDENTIFIER    NOT NULL,
        ProposalRevisionId      UNIQUEIDENTIFIER    NOT NULL,
        MapVersionId            UNIQUEIDENTIFIER    NOT NULL,
        RobotId                 UNIQUEIDENTIFIER    NOT NULL,
        NavigationFingerprint   BINARY(32)          NOT NULL,
        ResultCode              VARCHAR(10)         NOT NULL,
        Reached                 BIT                 NOT NULL,
        Stopped                 BIT                 NOT NULL,
        LocalizationPassed      BIT                 NOT NULL,
        CameraPresetConfirmed   BIT                 NOT NULL,
        Reason                  NVARCHAR(1000)      NULL,
        EvidenceNote            NVARCHAR(2000)      NOT NULL,
        CheckedByUserId         UNIQUEIDENTIFIER    NOT NULL,
        RequestId               UNIQUEIDENTIFIER    NOT NULL,
        RequestHash             BINARY(32)          NOT NULL,
        CheckedAt               DATETIMEOFFSET(3)   NOT NULL,
        CONSTRAINT PK_PoiVerificationRecords PRIMARY KEY (Id),
        CONSTRAINT FK_PoiVerificationRecords_RevisionId FOREIGN KEY (ProposalRevisionId) REFERENCES dbo.PoiProposalRevisions(Id),
        CONSTRAINT FK_PoiVerificationRecords_MapVersionId FOREIGN KEY (MapVersionId) REFERENCES dbo.MapVersions(Id),
        CONSTRAINT FK_PoiVerificationRecords_RobotId FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
        CONSTRAINT FK_PoiVerificationRecords_CheckedByUserId FOREIGN KEY (CheckedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_PoiVerificationRecords_Revision UNIQUE (ProposalRevisionId),
        CONSTRAINT UQ_PoiVerificationRecords_ActorRequest UNIQUE (CheckedByUserId, RequestId),
        CONSTRAINT CK_PoiVerificationRecords_Result CHECK (ResultCode IN ('PASS','FAIL')),
        CONSTRAINT CK_PoiVerificationRecords_Evidence CHECK (LEN(LTRIM(RTRIM(EvidenceNote))) > 0),
        CONSTRAINT CK_PoiVerificationRecords_Pass CHECK (ResultCode <> 'PASS' OR (Reached = 1 AND Stopped = 1 AND LocalizationPassed = 1 AND CameraPresetConfirmed = 1)),
        CONSTRAINT CK_PoiVerificationRecords_Fail CHECK (ResultCode <> 'FAIL' OR (Reason IS NOT NULL AND LEN(LTRIM(RTRIM(Reason))) > 0 AND (Reached = 0 OR Stopped = 0 OR LocalizationPassed = 0 OR CameraPresetConfirmed = 0)))
    );
    CREATE INDEX IX_PoiVerificationRecords_FingerprintTime ON dbo.PoiVerificationRecords(MapVersionId, NavigationFingerprint, CheckedAt DESC, Id);
END;

-- Advance the snapshot marker only if this is an explicitly recognized v1.1 database.
DECLARE @oldHash nvarchar(64) = CONVERT(nvarchar(64), (SELECT value FROM sys.extended_properties WHERE class = 0 AND name = N'CampusTourBootstrapHash'));
IF @oldHash = N'b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43'
BEGIN
    COMMIT TRANSACTION;
    RETURN;
END;

IF @oldHash IS NULL OR @oldHash NOT IN (N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68',
                    N'2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67')
    THROW 51000, 'Only a recognized v1.1 snapshot can be upgraded automatically; inspect and back up this database first.', 1;

IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE class = 0 AND name = N'CampusTourBootstrapHash')
    EXEC sys.sp_updateextendedproperty @name=N'CampusTourBootstrapHash', @value=N'b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43';
ELSE
    EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43';

COMMIT TRANSACTION;
GO
