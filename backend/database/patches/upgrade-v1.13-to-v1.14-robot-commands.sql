-- Robot commands and versioned Tour stops for ADR-0042 §4 and ADR-0043 D9.
-- Additive and rerunnable: each object is created only when missing. Existing Tours that already break the
-- stop-column rule stop the patch and are listed; nothing is rewritten here.
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
BEGIN TRANSACTION;

DECLARE @schemaVersion nvarchar(32) = (SELECT CONVERT(nvarchar(32), value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion');
IF ISNULL(@schemaVersion, N'') NOT IN (N'1.13', N'1.14')
    THROW 51130, 'Expected a v1.13 schema before the v1.14 robot commands patch.', 1;
IF OBJECT_ID(N'dbo.Tours', N'U') IS NULL OR OBJECT_ID(N'dbo.Robots', N'U') IS NULL OR OBJECT_ID(N'dbo.RouteRevisionStops', N'U') IS NULL
    THROW 51131, 'dbo.Tours, dbo.Robots and dbo.RouteRevisionStops are required for the v1.14 patch.', 1;

-- A versioned Tour must not point at legacy RouteStops; an operator decides how to repair such a row.
DECLARE @violations nvarchar(max) = (
    SELECT STRING_AGG(CONVERT(nvarchar(max), CONVERT(nvarchar(36), t.Id)), N', ')
    FROM dbo.Tours t
    WHERE t.RouteRevisionId IS NOT NULL AND (t.CurrentRouteStopId IS NOT NULL OR t.LastArrivedRouteStopId IS NOT NULL));
IF @violations IS NOT NULL
BEGIN
    DECLARE @message nvarchar(2048) = LEFT(CONCAT(N'Versioned Tours reference legacy RouteStops: ', @violations,
        N'. Clear those stop references through a reviewed data change, then rerun this patch.'), 2048);
    ;THROW 51132, @message, 1;
END;

IF OBJECT_ID(N'dbo.RobotCommands', N'U') IS NULL
    EXEC sys.sp_executesql N'CREATE TABLE dbo.RobotCommands
(
    Id UNIQUEIDENTIFIER NOT NULL,
    RobotId UNIQUEIDENTIFIER NOT NULL,
    TourId UNIQUEIDENTIFIER NOT NULL,
    LegId UNIQUEIDENTIFIER NOT NULL,
    LegKind VARCHAR(10) NOT NULL,
    Kind VARCHAR(10) NOT NULL,
    TargetCommandId UNIQUEIDENTIFIER NULL,
    State VARCHAR(20) NOT NULL,
    IsOpen BIT NOT NULL,
    Outcome VARCHAR(20) NULL,
    RouteRevisionStopId UNIQUEIDENTIFIER NULL,
    MapKey NVARCHAR(100) NULL,
    FrameId NVARCHAR(100) NULL,
    X DECIMAL(10,4) NULL,
    Y DECIMAL(10,4) NULL,
    Yaw DECIMAL(9,6) NULL,
    IssuedAt DATETIMEOFFSET(3) NOT NULL,
    AcceptBy DATETIMEOFFSET(3) NULL,
    IssuedByUserId UNIQUEIDENTIFIER NULL,
    DeliveredAt DATETIMEOFFSET(3) NULL,
    DeliveredStreamId UNIQUEIDENTIFIER NULL,
    AcceptedAt DATETIMEOFFSET(3) NULL,
    CompletedAt DATETIMEOFFSET(3) NULL,
    ReasonCode NVARCHAR(100) NULL,
    ResolvedByUserId UNIQUEIDENTIFIER NULL,
    ResolvedAt DATETIMEOFFSET(3) NULL,
    ResolutionNote NVARCHAR(1000) NULL,
    RowVersion ROWVERSION NOT NULL,
    CONSTRAINT PK_RobotCommands PRIMARY KEY (Id),
    CONSTRAINT FK_RobotCommands_RobotId FOREIGN KEY (RobotId) REFERENCES dbo.Robots(Id),
    CONSTRAINT FK_RobotCommands_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id),
    CONSTRAINT FK_RobotCommands_TargetCommandId FOREIGN KEY (TargetCommandId) REFERENCES dbo.RobotCommands(Id),
    CONSTRAINT FK_RobotCommands_RouteRevisionStopId FOREIGN KEY (RouteRevisionStopId) REFERENCES dbo.RouteRevisionStops(Id),
    CONSTRAINT FK_RobotCommands_IssuedByUserId FOREIGN KEY (IssuedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_RobotCommands_ResolvedByUserId FOREIGN KEY (ResolvedByUserId) REFERENCES dbo.Users(Id),
    CONSTRAINT CK_RobotCommands_Kind CHECK (Kind IN (''GoTo'',''Cancel'')),
    CONSTRAINT CK_RobotCommands_LegKind CHECK (LegKind IN (''TO_POI'',''TO_END'')),
    CONSTRAINT CK_RobotCommands_State CHECK (State IN (''PENDING'',''DELIVERED'',''ACCEPTED'',''ARRIVED'',''FAILED'',''CANCELLED'',''REJECTED'',''EXPIRED'',''UNKNOWN'',''RECONCILED'')),
    CONSTRAINT CK_RobotCommands_CancelState CHECK (Kind = ''GoTo'' OR State IN (''PENDING'',''DELIVERED'',''ACCEPTED'',''REJECTED'',''EXPIRED'',''UNKNOWN'')),
    CONSTRAINT CK_RobotCommands_Target CHECK
        ((Kind = ''GoTo'' AND TargetCommandId IS NULL AND MapKey IS NOT NULL AND FrameId IS NOT NULL
            AND X IS NOT NULL AND Y IS NOT NULL AND Yaw IS NOT NULL AND AcceptBy IS NOT NULL)
         OR (Kind = ''Cancel'' AND TargetCommandId IS NOT NULL AND MapKey IS NULL AND FrameId IS NULL
            AND X IS NULL AND Y IS NULL AND Yaw IS NULL AND AcceptBy IS NULL AND RouteRevisionStopId IS NULL)),
    CONSTRAINT CK_RobotCommands_Stop CHECK
        (Kind = ''Cancel'' OR (LegKind = ''TO_POI'' AND RouteRevisionStopId IS NOT NULL) OR (LegKind = ''TO_END'' AND RouteRevisionStopId IS NULL)),
    CONSTRAINT CK_RobotCommands_AcceptBy CHECK (AcceptBy IS NULL OR AcceptBy > IssuedAt),
    CONSTRAINT CK_RobotCommands_IsOpen CHECK (IsOpen = CASE
        WHEN Kind = ''GoTo'' AND State IN (''PENDING'',''DELIVERED'',''ACCEPTED'',''UNKNOWN'') THEN 1
        WHEN Kind = ''Cancel'' AND State IN (''PENDING'',''DELIVERED'',''ACCEPTED'') THEN 1
        ELSE 0 END),
    CONSTRAINT CK_RobotCommands_Outcome CHECK
        ((State IN (''ARRIVED'',''FAILED'',''CANCELLED'') AND Outcome = State)
         OR (State NOT IN (''ARRIVED'',''FAILED'',''CANCELLED'') AND Outcome IS NULL)),
    CONSTRAINT CK_RobotCommands_Delivery CHECK
        ((State IN (''PENDING'',''EXPIRED'') AND DeliveredStreamId IS NULL AND DeliveredAt IS NULL)
         OR (State NOT IN (''PENDING'',''EXPIRED'') AND DeliveredStreamId IS NOT NULL AND DeliveredAt IS NOT NULL)),
    CONSTRAINT CK_RobotCommands_Accepted CHECK
        ((State = ''ACCEPTED'' AND AcceptedAt IS NOT NULL)
         OR (State IN (''PENDING'',''DELIVERED'',''EXPIRED'',''REJECTED'') AND AcceptedAt IS NULL)
         OR State IN (''ARRIVED'',''FAILED'',''CANCELLED'',''UNKNOWN'',''RECONCILED'')),
    CONSTRAINT CK_RobotCommands_Completed CHECK
        ((State IN (''PENDING'',''DELIVERED'',''ACCEPTED'') AND CompletedAt IS NULL)
         OR (State NOT IN (''PENDING'',''DELIVERED'',''ACCEPTED'') AND CompletedAt IS NOT NULL)),
    CONSTRAINT CK_RobotCommands_Resolution CHECK
        ((State = ''RECONCILED'' AND ResolvedByUserId IS NOT NULL AND ResolvedAt IS NOT NULL
            AND ResolutionNote IS NOT NULL AND LEN(LTRIM(RTRIM(ResolutionNote))) > 0)
         OR (State <> ''RECONCILED'' AND ResolvedByUserId IS NULL AND ResolvedAt IS NULL AND ResolutionNote IS NULL))
);';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.RobotCommands') AND name=N'UX_RobotCommands_OneOpenGoTo')
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_RobotCommands_OneOpenGoTo ON dbo.RobotCommands(RobotId) WHERE Kind = ''GoTo'' AND IsOpen = 1;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.RobotCommands') AND name=N'UX_RobotCommands_OneOpenCancelPerLeg')
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_RobotCommands_OneOpenCancelPerLeg ON dbo.RobotCommands(LegId) WHERE Kind = ''Cancel'' AND IsOpen = 1;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.RobotCommands') AND name=N'UX_RobotCommands_OneGoToPerLeg')
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_RobotCommands_OneGoToPerLeg ON dbo.RobotCommands(LegId) WHERE Kind = ''GoTo'';';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.RobotCommands') AND name=N'IX_RobotCommands_RobotOpen')
    EXEC sys.sp_executesql N'CREATE INDEX IX_RobotCommands_RobotOpen ON dbo.RobotCommands(RobotId, IssuedAt) WHERE IsOpen = 1;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.RobotCommands') AND name=N'IX_RobotCommands_Sweep')
    EXEC sys.sp_executesql N'CREATE INDEX IX_RobotCommands_Sweep ON dbo.RobotCommands(State, AcceptBy) WHERE IsOpen = 1;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.RobotCommands') AND name=N'IX_RobotCommands_Tour')
    EXEC sys.sp_executesql N'CREATE INDEX IX_RobotCommands_Tour ON dbo.RobotCommands(TourId, IssuedAt);';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.RobotCommands') AND name=N'IX_RobotCommands_TargetCommand')
    EXEC sys.sp_executesql N'CREATE INDEX IX_RobotCommands_TargetCommand ON dbo.RobotCommands(TargetCommandId) WHERE TargetCommandId IS NOT NULL;';

IF COL_LENGTH(N'dbo.Tours', N'CurrentRevisionStopId') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Tours ADD CurrentRevisionStopId UNIQUEIDENTIFIER NULL;';
IF COL_LENGTH(N'dbo.Tours', N'LastArrivedRevisionStopId') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Tours ADD LastArrivedRevisionStopId UNIQUEIDENTIFIER NULL;';
IF OBJECT_ID(N'dbo.FK_Tours_CurrentRevisionStopId', N'F') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Tours WITH CHECK ADD CONSTRAINT FK_Tours_CurrentRevisionStopId FOREIGN KEY (CurrentRevisionStopId) REFERENCES dbo.RouteRevisionStops(Id);';
IF OBJECT_ID(N'dbo.FK_Tours_LastArrivedRevisionStopId', N'F') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Tours WITH CHECK ADD CONSTRAINT FK_Tours_LastArrivedRevisionStopId FOREIGN KEY (LastArrivedRevisionStopId) REFERENCES dbo.RouteRevisionStops(Id);';
IF OBJECT_ID(N'dbo.CK_Tours_StopColumns_ByTarget', N'C') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.Tours WITH CHECK ADD CONSTRAINT CK_Tours_StopColumns_ByTarget CHECK
        ((RouteRevisionId IS NULL AND CurrentRevisionStopId IS NULL AND LastArrivedRevisionStopId IS NULL)
         OR (RouteRevisionId IS NOT NULL AND CurrentRouteStopId IS NULL AND LastArrivedRouteStopId IS NULL));';

IF OBJECT_ID(N'dbo.RobotCommands', N'U') IS NULL
    OR (SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.RobotCommands') AND is_unique=1 AND has_filter=1
        AND name IN (N'UX_RobotCommands_OneOpenGoTo', N'UX_RobotCommands_OneOpenCancelPerLeg', N'UX_RobotCommands_OneGoToPerLeg')) <> 3
    OR (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RobotCommands') AND is_disabled=0 AND is_not_trusted=0) <> 13
    OR COL_LENGTH(N'dbo.Tours', N'CurrentRevisionStopId') IS NULL OR COL_LENGTH(N'dbo.Tours', N'LastArrivedRevisionStopId') IS NULL
    OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Tours') AND name=N'CK_Tours_StopColumns_ByTarget' AND is_disabled=0 AND is_not_trusted=0)
    THROW 51133, 'Required v1.14 robot command structure is incomplete.', 1;

IF @schemaVersion = N'1.13'
    EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.14';
COMMIT TRANSACTION;
