-- ADR-0065: Viewers vote for the next POI at each stop (Workflow C).
-- Additive: RouteRevisions.ViewerChoosesNextStop (default 0 for every existing revision), nullable
-- RouteTestRuns.TraversedStopIdsJson with its ISJSON CHECK, and the empty TourStopVisits, TourStopVotes and
-- TourStopLocks tables. No existing row changes meaning; existing revisions keep running without a vote.
-- Rerunning on v1.25 only verifies.
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @version nvarchar(32) = (SELECT CONVERT(nvarchar(32), value)
        FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion');
    IF ISNULL(@version, N'') NOT IN (N'1.24', N'1.25')
        THROW 51250, 'Expected a v1.24 schema before the v1.25 viewer vote patch.', 1;

    IF @version = N'1.24'
    BEGIN
        IF COL_LENGTH(N'dbo.RouteRevisions', N'ViewerChoosesNextStop') IS NULL
            ALTER TABLE dbo.RouteRevisions ADD ViewerChoosesNextStop BIT NOT NULL
                CONSTRAINT DF_RouteRevisions_ViewerChoosesNextStop DEFAULT (0);

        IF COL_LENGTH(N'dbo.RouteTestRuns', N'TraversedStopIdsJson') IS NULL
            ALTER TABLE dbo.RouteTestRuns ADD TraversedStopIdsJson NVARCHAR(1000) NULL;

        -- Deferred: the column does not exist when this batch compiles.
        IF OBJECT_ID(N'dbo.CK_RouteTestRuns_TraversedStopIdsJson', N'C') IS NULL
            EXEC sys.sp_executesql N'ALTER TABLE dbo.RouteTestRuns WITH CHECK ADD CONSTRAINT CK_RouteTestRuns_TraversedStopIdsJson CHECK
                (TraversedStopIdsJson IS NULL OR ISJSON(TraversedStopIdsJson) = 1);';

        IF OBJECT_ID(N'dbo.TourStopVisits', N'U') IS NULL
            EXEC sys.sp_executesql N'CREATE TABLE dbo.TourStopVisits
(
    Id                   UNIQUEIDENTIFIER   NOT NULL,
    TourId               UNIQUEIDENTIFIER   NOT NULL,
    RouteRevisionStopId  UNIQUEIDENTIFIER   NOT NULL,
    Outcome              VARCHAR(10)        NOT NULL,
    OccurredAt           DATETIMEOFFSET(3)  NOT NULL,
    BallotClosesAt       DATETIMEOFFSET(3)  NULL,
    BallotClosedAt       DATETIMEOFFSET(3)  NULL,
    ChosenRevisionStopId UNIQUEIDENTIFIER   NULL,
    ChosenReason         VARCHAR(20)        NULL,
    ChosenVoteCount      INT                NULL,
    CONSTRAINT PK_TourStopVisits PRIMARY KEY (Id),
    CONSTRAINT FK_TourStopVisits_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_TourStopVisits_RouteRevisionStopId FOREIGN KEY (RouteRevisionStopId) REFERENCES dbo.RouteRevisionStops(Id),
    CONSTRAINT FK_TourStopVisits_ChosenRevisionStopId FOREIGN KEY (ChosenRevisionStopId) REFERENCES dbo.RouteRevisionStops(Id),
    CONSTRAINT UQ_TourStopVisits_TourStop UNIQUE (TourId, RouteRevisionStopId),
    CONSTRAINT CK_TourStopVisits_Outcome CHECK (Outcome IN (''ARRIVED'', ''SKIPPED'')),
    CONSTRAINT CK_TourStopVisits_ChosenReason CHECK (ChosenReason IS NULL OR ChosenReason IN
        (''VOTE'', ''TIE_DEFAULT'', ''NO_VOTES'', ''LOCKED_FALLBACK'', ''SINGLE_CANDIDATE'')),
    CONSTRAINT CK_TourStopVisits_Choice_Complete CHECK
        ((ChosenRevisionStopId IS NULL AND ChosenReason IS NULL AND ChosenVoteCount IS NULL)
         OR (ChosenRevisionStopId IS NOT NULL AND ChosenReason IS NOT NULL
             AND (ChosenVoteCount IS NULL OR ChosenVoteCount >= 0))),
    CONSTRAINT CK_TourStopVisits_ChosenNotSelf CHECK (ChosenRevisionStopId IS NULL OR ChosenRevisionStopId <> RouteRevisionStopId),
    CONSTRAINT CK_TourStopVisits_BallotClosed CHECK (BallotClosedAt IS NULL OR BallotClosesAt IS NOT NULL),
    CONSTRAINT CK_TourStopVisits_BallotReason CHECK
        (ChosenReason IS NULL OR ChosenReason NOT IN (''VOTE'', ''TIE_DEFAULT'', ''NO_VOTES'') OR BallotClosedAt IS NOT NULL),
    CONSTRAINT CK_TourStopVisits_SkippedNoBallot CHECK
        (Outcome = ''ARRIVED'' OR (BallotClosesAt IS NULL AND BallotClosedAt IS NULL AND ChosenRevisionStopId IS NULL))
);';

        IF OBJECT_ID(N'dbo.TourStopVotes', N'U') IS NULL
            EXEC sys.sp_executesql N'CREATE TABLE dbo.TourStopVotes
(
    Id                  UNIQUEIDENTIFIER   NOT NULL,
    TourId              UNIQUEIDENTIFIER   NOT NULL,
    StopVisitId         UNIQUEIDENTIFIER   NOT NULL,
    RosterRowId         UNIQUEIDENTIFIER   NOT NULL,
    RouteRevisionStopId UNIQUEIDENTIFIER   NULL,
    VotedAt             DATETIMEOFFSET(3)  NOT NULL,
    UpdatedAt           DATETIMEOFFSET(3)  NOT NULL,
    CONSTRAINT PK_TourStopVotes PRIMARY KEY (Id),
    CONSTRAINT FK_TourStopVotes_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_TourStopVotes_StopVisitId FOREIGN KEY (StopVisitId) REFERENCES dbo.TourStopVisits(Id),
    CONSTRAINT FK_TourStopVotes_RosterRowId FOREIGN KEY (RosterRowId) REFERENCES dbo.RosterRows(Id),
    CONSTRAINT FK_TourStopVotes_RouteRevisionStopId FOREIGN KEY (RouteRevisionStopId) REFERENCES dbo.RouteRevisionStops(Id),
    CONSTRAINT UQ_TourStopVotes_VisitRow UNIQUE (StopVisitId, RosterRowId),
    CONSTRAINT CK_TourStopVotes_UpdatedAfterVoted CHECK (UpdatedAt >= VotedAt)
);';

        IF OBJECT_ID(N'dbo.TourStopLocks', N'U') IS NULL
            EXEC sys.sp_executesql N'CREATE TABLE dbo.TourStopLocks
(
    Id                  UNIQUEIDENTIFIER   NOT NULL,
    TourId              UNIQUEIDENTIFIER   NOT NULL,
    RouteRevisionStopId UNIQUEIDENTIFIER   NOT NULL,
    Reason              NVARCHAR(500)      NOT NULL,
    LockedByUserId      UNIQUEIDENTIFIER   NOT NULL,
    LockedAt            DATETIMEOFFSET(3)  NOT NULL,
    UnlockedByUserId    UNIQUEIDENTIFIER   NULL,
    UnlockedAt          DATETIMEOFFSET(3)  NULL,
    UnlockReason        NVARCHAR(500)      NULL,
    CONSTRAINT PK_TourStopLocks PRIMARY KEY (Id),
    CONSTRAINT FK_TourStopLocks_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_TourStopLocks_RouteRevisionStopId FOREIGN KEY (RouteRevisionStopId) REFERENCES dbo.RouteRevisionStops(Id),
    CONSTRAINT FK_TourStopLocks_LockedByUserId FOREIGN KEY (LockedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_TourStopLocks_UnlockedByUserId FOREIGN KEY (UnlockedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT CK_TourStopLocks_Reason CHECK (LEN(LTRIM(RTRIM(Reason))) > 0),
    CONSTRAINT CK_TourStopLocks_Unlock_Complete CHECK
        ((UnlockedAt IS NULL AND UnlockedByUserId IS NULL AND UnlockReason IS NULL)
         OR (UnlockedAt IS NOT NULL AND UnlockedByUserId IS NOT NULL AND UnlockReason IS NOT NULL
             AND LEN(LTRIM(RTRIM(UnlockReason))) > 0 AND UnlockedAt >= LockedAt))
);';

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TourStopLocks') AND name=N'UX_TourStopLocks_Active')
            EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_TourStopLocks_Active ON dbo.TourStopLocks(TourId, RouteRevisionStopId) WHERE UnlockedAt IS NULL;';
    END;

    IF COL_LENGTH(N'dbo.RouteRevisions', N'ViewerChoosesNextStop') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RouteRevisions')
            AND name=N'DF_RouteRevisions_ViewerChoosesNextStop')
        OR COL_LENGTH(N'dbo.RouteTestRuns', N'TraversedStopIdsJson') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RouteTestRuns')
            AND name=N'CK_RouteTestRuns_TraversedStopIdsJson' AND is_disabled=0 AND is_not_trusted=0)
        OR OBJECT_ID(N'dbo.TourStopVisits', N'U') IS NULL
        OR OBJECT_ID(N'dbo.TourStopVotes', N'U') IS NULL
        OR OBJECT_ID(N'dbo.TourStopLocks', N'U') IS NULL
        OR (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id IN (OBJECT_ID(N'dbo.TourStopVisits'),
            OBJECT_ID(N'dbo.TourStopVotes'), OBJECT_ID(N'dbo.TourStopLocks')) AND is_disabled=0 AND is_not_trusted=0) <> 10
        OR (SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id IN (OBJECT_ID(N'dbo.TourStopVisits'),
            OBJECT_ID(N'dbo.TourStopVotes'), OBJECT_ID(N'dbo.TourStopLocks')) AND is_disabled=0 AND is_not_trusted=0) <> 11
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TourStopVisits')
            AND name=N'UQ_TourStopVisits_TourStop' AND is_unique=1)
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TourStopVotes')
            AND name=N'UQ_TourStopVotes_VisitRow' AND is_unique=1)
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TourStopLocks')
            AND name=N'UX_TourStopLocks_Active' AND is_unique=1 AND has_filter=1)
        THROW 51251, 'The trusted v1.25 viewer vote columns, tables, CHECKs, foreign keys and unique indexes are required.', 1;

    IF @version = N'1.24'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.25';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
