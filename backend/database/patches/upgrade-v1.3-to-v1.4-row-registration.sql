-- Additive Database First patch for SRS v0.2 row-level registration/access.
-- Apply only to a backed-up v1.3 schema through the reviewed DB change process.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @schemaHash nvarchar(64) = (SELECT CONVERT(nvarchar(64), value) FROM sys.extended_properties
    WHERE class = 0 AND name = N'CampusTourBootstrapHash');
IF @schemaHash IS NULL OR @schemaHash NOT IN (
    N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68',
    N'2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67')
    THROW 51050, 'This additive patch requires the explicitly recognized v1.3 schema marker.', 1;

IF COL_LENGTH(N'dbo.RosterRows', N'ParticipationState') IS NULL
BEGIN
    ALTER TABLE dbo.RosterRows ADD ParticipationState VARCHAR(20) NOT NULL
        CONSTRAINT DF_RosterRows_ParticipationState DEFAULT ('PENDING') WITH VALUES;
    ALTER TABLE dbo.RosterRows ADD ReviewedByUserId UNIQUEIDENTIFIER NULL,
        ReviewedAt DATETIMEOFFSET(3) NULL,
        ReviewReason NVARCHAR(1000) NULL;
    EXEC sys.sp_executesql N'
    UPDATE row
    SET ParticipationState = CASE
        WHEN row.IsActive = 0 THEN ''REMOVED''
        WHEN registration.State = ''APPROVED'' THEN ''ACCEPTED''
        WHEN registration.State = ''REJECTED'' THEN ''REJECTED''
        WHEN registration.State = ''CANCELLED'' THEN ''REMOVED''
        ELSE ''PENDING'' END,
        ReviewedByUserId = CASE WHEN registration.State IN (''APPROVED'',''REJECTED'') THEN registration.ReviewedByUserId END,
        ReviewedAt = CASE WHEN registration.State IN (''APPROVED'',''REJECTED'') THEN registration.ReviewedAt END,
        ReviewReason = CASE WHEN registration.State = ''REJECTED'' THEN registration.RejectionReason END
    FROM dbo.RosterRows AS row
    JOIN dbo.GroupRegistrations AS registration ON registration.Id = row.RegistrationId;';
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_RosterRows_ReviewedByUserId')
    ALTER TABLE dbo.RosterRows ADD CONSTRAINT FK_RosterRows_ReviewedByUserId
        FOREIGN KEY (ReviewedByUserId) REFERENCES dbo.Users(Id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_RosterRows_ParticipationState')
    ALTER TABLE dbo.RosterRows ADD CONSTRAINT CK_RosterRows_ParticipationState
        CHECK (ParticipationState IN ('PENDING','ACCEPTED','REJECTED','REMOVED'));
GO

IF COL_LENGTH(N'dbo.BrowserSessions', N'DeviceTokenHash') IS NULL
    ALTER TABLE dbo.BrowserSessions ADD DeviceTokenHash BINARY(32) NULL;
GO

IF OBJECT_ID(N'dbo.RosterEmailChangeRequests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RosterEmailChangeRequests
    (
        Id UNIQUEIDENTIFIER NOT NULL,
        RosterRowId UNIQUEIDENTIFIER NOT NULL,
        RequestId UNIQUEIDENTIFIER NOT NULL,
        CurrentEmail NVARCHAR(254) NOT NULL,
        ProposedEmail NVARCHAR(254) NOT NULL,
        RequestedByUserId UNIQUEIDENTIFIER NOT NULL,
        State VARCHAR(20) NOT NULL,
        CreatedAt DATETIMEOFFSET(3) NOT NULL,
        ReviewedAt DATETIMEOFFSET(3) NULL,
        ReviewedByUserId UNIQUEIDENTIFIER NULL,
        ReviewReason NVARCHAR(1000) NULL,
        RowVersion ROWVERSION NOT NULL,
        CONSTRAINT PK_RosterEmailChangeRequests PRIMARY KEY (Id),
        CONSTRAINT FK_RosterEmailChangeRequests_RosterRow FOREIGN KEY (RosterRowId) REFERENCES dbo.RosterRows(Id),
        CONSTRAINT FK_RosterEmailChangeRequests_Requester FOREIGN KEY (RequestedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT FK_RosterEmailChangeRequests_Reviewer FOREIGN KEY (ReviewedByUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT CK_RosterEmailChangeRequests_State CHECK (State IN ('PENDING','ACCEPTED','REJECTED')),
        CONSTRAINT CK_RosterEmailChangeRequests_DifferentEmail CHECK (CurrentEmail <> ProposedEmail),
        CONSTRAINT UQ_RosterEmailChangeRequests_Request UNIQUE (RequestedByUserId, RequestId)
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.RosterEmailChangeRequests') AND name=N'UX_RosterEmailChangeRequests_OnePending')
    CREATE UNIQUE INDEX UX_RosterEmailChangeRequests_OnePending
        ON dbo.RosterEmailChangeRequests(RosterRowId) WHERE State='PENDING';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.RosterEmailChangeRequests') AND name=N'IX_RosterEmailChangeRequests_Review')
    CREATE INDEX IX_RosterEmailChangeRequests_Review
        ON dbo.RosterEmailChangeRequests(State, CreatedAt, Id);
GO

COMMIT TRANSACTION;
