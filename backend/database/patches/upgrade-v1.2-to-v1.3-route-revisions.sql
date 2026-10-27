-- Additive Database First patch for ADR-0023. Apply only to a backed-up v1.2 database.
-- Existing Routes and RouteStops remain untouched and are classified LEGACY.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @schemaHash nvarchar(64) = (SELECT CONVERT(nvarchar(64), value) FROM sys.extended_properties
    WHERE class = 0 AND name = N'CampusTourBootstrapHash');
IF @schemaHash IS NULL OR @schemaHash NOT IN (
    N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68',
    N'2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67')
    THROW 51040, 'This additive patch requires the explicitly recognized v1.2 schema marker.', 1;

IF COL_LENGTH(N'dbo.Routes', N'AuthoringMode') IS NULL
BEGIN
    ALTER TABLE dbo.Routes ADD AuthoringMode VARCHAR(20) NOT NULL
        CONSTRAINT DF_Routes_AuthoringMode DEFAULT ('LEGACY') WITH VALUES;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_Routes_AuthoringMode')
    ALTER TABLE dbo.Routes ADD CONSTRAINT CK_Routes_AuthoringMode CHECK (AuthoringMode IN ('LEGACY','VERSIONED'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.PoiProposalRevisions') AND name=N'UQ_PoiProposalRevisions_ExactMapFingerprint')
    CREATE UNIQUE INDEX UQ_PoiProposalRevisions_ExactMapFingerprint ON dbo.PoiProposalRevisions(Id, MapVersionId, NavigationFingerprint);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.PoiVerificationRecords') AND name=N'UQ_PoiVerificationRecords_ExactEvidence')
    CREATE UNIQUE INDEX UQ_PoiVerificationRecords_ExactEvidence ON dbo.PoiVerificationRecords(Id, MapVersionId, NavigationFingerprint);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.MapDeploymentChecks') AND name=N'UQ_MapDeploymentChecks_ExactMap')
    CREATE UNIQUE INDEX UQ_MapDeploymentChecks_ExactMap ON dbo.MapDeploymentChecks(Id, MapVersionId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.MapDeploymentChecks') AND name=N'UQ_MapDeploymentChecks_ExactMapChecksum')
    CREATE UNIQUE INDEX UQ_MapDeploymentChecks_ExactMapChecksum ON dbo.MapDeploymentChecks(Id, MapVersionId, PackageSha256);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.MapVersions') AND name=N'UQ_MapVersions_ExactPackage')
    CREATE UNIQUE INDEX UQ_MapVersions_ExactPackage ON dbo.MapVersions(Id, PackageSha256);

IF OBJECT_ID(N'dbo.RouteRevisions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RouteRevisions
    (
        Id UNIQUEIDENTIFIER NOT NULL,
        RouteId UNIQUEIDENTIFIER NOT NULL,
        RevisionNumber INT NOT NULL,
        Name NVARCHAR(150) NOT NULL,
        Description NVARCHAR(1000) NULL,
        MapVersionId UNIQUEIDENTIFIER NOT NULL,
        MapPackageSha256 BINARY(32) NOT NULL,
        StartX DECIMAL(10,4) NOT NULL, StartY DECIMAL(10,4) NOT NULL, StartYaw DECIMAL(9,6) NOT NULL,
        EndMode VARCHAR(20) NOT NULL, EndX DECIMAL(10,4) NULL, EndY DECIMAL(10,4) NULL, EndYaw DECIMAL(9,6) NULL,
        NavigationFingerprint BINARY(32) NOT NULL,
        RequestId UNIQUEIDENTIFIER NOT NULL, RequestHash BINARY(32) NOT NULL,
        CreatedByUserId UNIQUEIDENTIFIER NOT NULL, CreatedAt DATETIMEOFFSET(3) NOT NULL,
        CONSTRAINT PK_RouteRevisions PRIMARY KEY (Id),
        CONSTRAINT FK_RouteRevisions_Route FOREIGN KEY (RouteId) REFERENCES dbo.Routes(Id),
        CONSTRAINT FK_RouteRevisions_Map FOREIGN KEY (MapVersionId) REFERENCES dbo.MapVersions(Id),
        CONSTRAINT FK_RouteRevisions_MapChecksum FOREIGN KEY (MapVersionId, MapPackageSha256) REFERENCES dbo.MapVersions(Id, PackageSha256),
        CONSTRAINT FK_RouteRevisions_CreatedBy FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_RouteRevisions_Number UNIQUE (RouteId, RevisionNumber),
        CONSTRAINT UQ_RouteRevisions_Request UNIQUE (CreatedByUserId, RequestId),
        CONSTRAINT UQ_RouteRevisions_IdMap UNIQUE (Id, MapVersionId),
        CONSTRAINT UQ_RouteRevisions_MapFingerprint UNIQUE (Id, MapVersionId, NavigationFingerprint),
        CONSTRAINT UQ_RouteRevisions_MapChecksumFingerprint UNIQUE (Id, MapVersionId, MapPackageSha256, NavigationFingerprint),
        CONSTRAINT CK_RouteRevisions_Number CHECK (RevisionNumber > 0),
        CONSTRAINT CK_RouteRevisions_EndMode CHECK ((EndMode='POSE' AND EndX IS NOT NULL AND EndY IS NOT NULL AND EndYaw IS NOT NULL) OR (EndMode='LAST_POI' AND EndX IS NULL AND EndY IS NULL AND EndYaw IS NULL))
    );
    CREATE INDEX IX_RouteRevisions_Map ON dbo.RouteRevisions(MapVersionId, CreatedAt, Id);
END;

IF OBJECT_ID(N'dbo.RouteRevisionSubmissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RouteRevisionSubmissions
    (
        Id UNIQUEIDENTIFIER NOT NULL,
        RouteRevisionId UNIQUEIDENTIFIER NOT NULL,
        RequestId UNIQUEIDENTIFIER NOT NULL,
        RequestHash BINARY(32) NOT NULL,
        SubmittedByUserId UNIQUEIDENTIFIER NOT NULL,
        SubmittedAt DATETIMEOFFSET(3) NOT NULL,
        CONSTRAINT PK_RouteRevisionSubmissions PRIMARY KEY (Id),
        CONSTRAINT FK_RouteRevisionSubmissions_Revision FOREIGN KEY (RouteRevisionId) REFERENCES dbo.RouteRevisions(Id),
        CONSTRAINT FK_RouteRevisionSubmissions_User FOREIGN KEY (SubmittedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_RouteRevisionSubmissions_Revision UNIQUE (RouteRevisionId),
        CONSTRAINT UQ_RouteRevisionSubmissions_Request UNIQUE (SubmittedByUserId, RequestId)
    );
END;

IF OBJECT_ID(N'dbo.RouteRevisionStops', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RouteRevisionStops
    (
        Id UNIQUEIDENTIFIER NOT NULL,
        RouteRevisionId UNIQUEIDENTIFIER NOT NULL,
        PoiProposalRevisionId UNIQUEIDENTIFIER NOT NULL,
        SourcePoiVerificationRecordId UNIQUEIDENTIFIER NOT NULL,
        MapVersionId UNIQUEIDENTIFIER NOT NULL,
        PoiNavigationFingerprint BINARY(32) NOT NULL,
        StopOrder INT NOT NULL,
        DwellSeconds INT NOT NULL,
        HeadStepsJson NVARCHAR(4000) NOT NULL,
        Name NVARCHAR(150) NOT NULL,
        X DECIMAL(10,4) NOT NULL, Y DECIMAL(10,4) NOT NULL, Yaw DECIMAL(9,6) NOT NULL,
        CameraPreset NVARCHAR(80) NOT NULL,
        CONSTRAINT PK_RouteRevisionStops PRIMARY KEY (Id),
        CONSTRAINT FK_RouteRevisionStops_RevisionMap FOREIGN KEY (RouteRevisionId, MapVersionId) REFERENCES dbo.RouteRevisions(Id, MapVersionId),
        CONSTRAINT FK_RouteRevisionStops_PoiMapFingerprint FOREIGN KEY (PoiProposalRevisionId, MapVersionId, PoiNavigationFingerprint) REFERENCES dbo.PoiProposalRevisions(Id, MapVersionId, NavigationFingerprint),
        CONSTRAINT FK_RouteRevisionStops_SourceEvidence FOREIGN KEY (SourcePoiVerificationRecordId, MapVersionId, PoiNavigationFingerprint) REFERENCES dbo.PoiVerificationRecords(Id, MapVersionId, NavigationFingerprint),
        CONSTRAINT UQ_RouteRevisionStops_Order UNIQUE (RouteRevisionId, StopOrder),
        CONSTRAINT UQ_RouteRevisionStops_Poi UNIQUE (RouteRevisionId, PoiProposalRevisionId),
        CONSTRAINT CK_RouteRevisionStops_Order CHECK (StopOrder > 0),
        CONSTRAINT CK_RouteRevisionStops_Dwell CHECK (DwellSeconds BETWEEN 1 AND 3600)
    );
END;

IF OBJECT_ID(N'dbo.RouteTestRuns', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RouteTestRuns
    (
        Id UNIQUEIDENTIFIER NOT NULL,
        RouteRevisionId UNIQUEIDENTIFIER NOT NULL,
        NavigationFingerprint BINARY(32) NOT NULL,
        MapVersionId UNIQUEIDENTIFIER NOT NULL,
        MapDeploymentCheckId UNIQUEIDENTIFIER NOT NULL,
        MapPackageSha256 BINARY(32) NOT NULL,
        RobotId UNIQUEIDENTIFIER NOT NULL,
        CheckedByUserId UNIQUEIDENTIFIER NOT NULL,
        ParticipatingStaffUserId UNIQUEIDENTIFIER NOT NULL,
        ResultCode VARCHAR(10) NOT NULL,
        AllStopsReached BIT NOT NULL, SafelyStopped BIT NOT NULL, LocalizationPassed BIT NOT NULL,
        MeasuredDurationSeconds INT NOT NULL,
        FailureReason NVARCHAR(1000) NULL,
        EvidenceNote NVARCHAR(2000) NOT NULL,
        RequestId UNIQUEIDENTIFIER NOT NULL, RequestHash BINARY(32) NOT NULL,
        CheckedAt DATETIMEOFFSET(3) NOT NULL,
        CONSTRAINT PK_RouteTestRuns PRIMARY KEY (Id),
        CONSTRAINT FK_RouteTestRuns_ExactRevision FOREIGN KEY (RouteRevisionId, MapVersionId, NavigationFingerprint) REFERENCES dbo.RouteRevisions(Id, MapVersionId, NavigationFingerprint),
        CONSTRAINT FK_RouteTestRuns_Deployment FOREIGN KEY (MapDeploymentCheckId, MapVersionId, MapPackageSha256) REFERENCES dbo.MapDeploymentChecks(Id, MapVersionId, PackageSha256),
        CONSTRAINT FK_RouteTestRuns_Robot FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
        CONSTRAINT FK_RouteTestRuns_Checker FOREIGN KEY (CheckedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT FK_RouteTestRuns_Staff FOREIGN KEY (ParticipatingStaffUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT UQ_RouteTestRuns_Request UNIQUE (CheckedByUserId, RequestId),
        CONSTRAINT CK_RouteTestRuns_Result CHECK (ResultCode IN ('PASS','FAIL')),
        CONSTRAINT CK_RouteTestRuns_Duration CHECK (MeasuredDurationSeconds BETWEEN 1 AND 86400),
        CONSTRAINT CK_RouteTestRuns_Evidence CHECK (LEN(LTRIM(RTRIM(EvidenceNote))) > 0),
        CONSTRAINT CK_RouteTestRuns_Pass CHECK (ResultCode <> 'PASS' OR (AllStopsReached=1 AND SafelyStopped=1 AND LocalizationPassed=1)),
        CONSTRAINT CK_RouteTestRuns_Fail CHECK (ResultCode <> 'FAIL' OR (FailureReason IS NOT NULL AND LEN(LTRIM(RTRIM(FailureReason)))>0 AND (AllStopsReached=0 OR SafelyStopped=0 OR LocalizationPassed=0)))
    );
    CREATE INDEX IX_RouteTestRuns_Effective ON dbo.RouteTestRuns(RouteRevisionId, NavigationFingerprint, CheckedAt DESC, Id);
END;

COMMIT TRANSACTION;
