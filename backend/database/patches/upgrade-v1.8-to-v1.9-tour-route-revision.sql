-- Schedule a Tour from one exact tested RouteRevision (ADR-0034). Legacy Tours keep NULL in the new columns.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @schemaVersion nvarchar(32) = (SELECT CONVERT(nvarchar(32), value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion');
IF ISNULL(@schemaVersion, N'') NOT IN (N'1.8', N'1.9')
    THROW 51100, 'Expected a v1.8 schema before the v1.9 Tour route revision patch.', 1;
IF OBJECT_ID(N'dbo.Tours', N'U') IS NULL OR OBJECT_ID(N'dbo.RouteRevisions', N'U') IS NULL OR OBJECT_ID(N'dbo.RouteTestRuns', N'U') IS NULL
    THROW 51101, 'dbo.Tours, dbo.RouteRevisions and dbo.RouteTestRuns are required for the v1.9 patch.', 1;

IF COL_LENGTH(N'dbo.Tours', N'RouteRevisionId') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Tours ADD RouteRevisionId UNIQUEIDENTIFIER NULL;';
IF COL_LENGTH(N'dbo.Tours', N'OperatorUserId') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Tours ADD OperatorUserId UNIQUEIDENTIFIER NULL;';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Tours') AND name=N'CK_Tours_VersionedTarget_Complete')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Tours WITH CHECK ADD CONSTRAINT CK_Tours_VersionedTarget_Complete CHECK
        ((RouteRevisionId IS NULL AND OperatorUserId IS NULL) OR (RouteRevisionId IS NOT NULL AND OperatorUserId IS NOT NULL));';
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Tours') AND name=N'FK_Tours_RouteRevisionId')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Tours WITH CHECK ADD CONSTRAINT FK_Tours_RouteRevisionId FOREIGN KEY (RouteRevisionId) REFERENCES dbo.RouteRevisions(Id);';
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Tours') AND name=N'FK_Tours_OperatorUserId')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Tours WITH CHECK ADD CONSTRAINT FK_Tours_OperatorUserId FOREIGN KEY (OperatorUserId) REFERENCES dbo.Users(Id);';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Tours') AND name=N'IX_Tours_RouteRevisionId')
    EXEC sys.sp_executesql N'CREATE INDEX IX_Tours_RouteRevisionId ON dbo.Tours(RouteRevisionId) WHERE RouteRevisionId IS NOT NULL;';

IF OBJECT_ID(N'dbo.TourRobotReservations', N'U') IS NULL
    CREATE TABLE dbo.TourRobotReservations
    (
        Id UNIQUEIDENTIFIER NOT NULL,
        TourId UNIQUEIDENTIFIER NOT NULL,
        RobotId UNIQUEIDENTIFIER NOT NULL,
        RouteTestRunId UNIQUEIDENTIFIER NOT NULL,
        MeasuredDurationSeconds INT NOT NULL,
        StartsAt DATETIMEOFFSET(3) NOT NULL,
        EndsAt DATETIMEOFFSET(3) NOT NULL,
        ReservedByUserId UNIQUEIDENTIFIER NOT NULL,
        ReservedAt DATETIMEOFFSET(3) NOT NULL,
        ReleasedAt DATETIMEOFFSET(3) NULL,
        ReleasedByUserId UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_TourRobotReservations PRIMARY KEY (Id),
        CONSTRAINT FK_TourRobotReservations_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
        CONSTRAINT FK_TourRobotReservations_RobotId FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
        CONSTRAINT FK_TourRobotReservations_RouteTestRunId FOREIGN KEY (RouteTestRunId) REFERENCES dbo.RouteTestRuns(Id),
        CONSTRAINT FK_TourRobotReservations_ReservedByUserId FOREIGN KEY (ReservedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT FK_TourRobotReservations_ReleasedByUserId FOREIGN KEY (ReleasedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT CK_TourRobotReservations_Window CHECK (EndsAt > StartsAt),
        CONSTRAINT CK_TourRobotReservations_Duration CHECK (MeasuredDurationSeconds BETWEEN 1 AND 86400),
        CONSTRAINT CK_TourRobotReservations_Release_Complete CHECK
            ((ReleasedAt IS NULL AND ReleasedByUserId IS NULL) OR (ReleasedAt IS NOT NULL AND ReleasedByUserId IS NOT NULL))
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TourRobotReservations') AND name=N'UX_TourRobotReservations_ActiveTour')
    CREATE UNIQUE INDEX UX_TourRobotReservations_ActiveTour ON dbo.TourRobotReservations(TourId) WHERE ReleasedAt IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TourRobotReservations') AND name=N'IX_TourRobotReservations_ActiveRobot')
    CREATE INDEX IX_TourRobotReservations_ActiveRobot ON dbo.TourRobotReservations(RobotId, StartsAt, EndsAt) WHERE ReleasedAt IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Tours') AND name=N'RouteRevisionId' AND system_type_id=36 AND is_nullable=1)
   OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Tours') AND name=N'OperatorUserId' AND system_type_id=36 AND is_nullable=1)
   OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Tours') AND name=N'CK_Tours_VersionedTarget_Complete' AND is_disabled=0 AND is_not_trusted=0)
   OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Tours') AND name=N'FK_Tours_RouteRevisionId' AND is_disabled=0 AND is_not_trusted=0)
   OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Tours') AND name=N'FK_Tours_OperatorUserId' AND is_disabled=0 AND is_not_trusted=0)
   OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Tours') AND name=N'IX_Tours_RouteRevisionId')
   OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TourRobotReservations') AND name=N'UX_TourRobotReservations_ActiveTour' AND is_unique=1)
   OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TourRobotReservations') AND name=N'IX_TourRobotReservations_ActiveRobot')
    THROW 51102, 'Required v1.9 Tour route revision structure is incomplete.', 1;

IF @schemaVersion = N'1.8'
    EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.9';
COMMIT TRANSACTION;
