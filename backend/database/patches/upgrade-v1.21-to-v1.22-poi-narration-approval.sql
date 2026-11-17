-- ADR-0060: POI narration becomes versioned content of the POI proposal, approved by a Staff other than its last editor.
-- Additive: two new tables and a nullable RouteRevisionStops column. Data move: each POI's newest revision that has
-- narration becomes one DRAFT row, created and last edited by that revision's author. No APPROVED row is created,
-- because no old narration was ever approved. Grants come from the reviewed permissions script. Rerunning on v1.22
-- only verifies.
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
    IF ISNULL(@version, N'') NOT IN (N'1.21', N'1.22')
        THROW 51220, 'Expected a v1.21 schema before the v1.22 POI narration approval patch.', 1;

    IF @version = N'1.21'
    BEGIN
        IF OBJECT_ID(N'dbo.PoiNarrationRevisions', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.PoiNarrationRevisions
            (
                Id                  UNIQUEIDENTIFIER    NOT NULL,
                ProposalId          UNIQUEIDENTIFIER    NOT NULL,
                RevisionNumber      INT                 NOT NULL,
                NarrationText       NVARCHAR(4000)      NOT NULL,
                FallbackVideoUrl    NVARCHAR(2048)      NULL,
                State               NVARCHAR(20)        NOT NULL,
                CreatedByUserId     UNIQUEIDENTIFIER    NOT NULL,
                CreatedAt           DATETIMEOFFSET(3)   NOT NULL,
                LastEditedByUserId  UNIQUEIDENTIFIER    NOT NULL,
                LastEditedAt        DATETIMEOFFSET(3)   NOT NULL,
                ApprovedByUserId    UNIQUEIDENTIFIER    NULL,
                ApprovedAt          DATETIMEOFFSET(3)   NULL,
                RowVersion          ROWVERSION          NOT NULL,
                CONSTRAINT PK_PoiNarrationRevisions PRIMARY KEY (Id),
                CONSTRAINT FK_PoiNarrationRevisions_ProposalId FOREIGN KEY (ProposalId) REFERENCES dbo.PoiProposals(Id),
                CONSTRAINT FK_PoiNarrationRevisions_CreatedByUserId FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id),
                CONSTRAINT FK_PoiNarrationRevisions_LastEditedByUserId FOREIGN KEY (LastEditedByUserId) REFERENCES dbo.Users(Id),
                CONSTRAINT FK_PoiNarrationRevisions_ApprovedByUserId FOREIGN KEY (ApprovedByUserId) REFERENCES dbo.Users(Id),
                CONSTRAINT UQ_PoiNarrationRevisions_Number UNIQUE (ProposalId, RevisionNumber),
                CONSTRAINT CK_PoiNarrationRevisions_Number CHECK (RevisionNumber > 0),
                CONSTRAINT CK_PoiNarrationRevisions_State CHECK (State IN (N'DRAFT', N'APPROVED', N'SUPERSEDED', N'DISCARDED')),
                CONSTRAINT CK_PoiNarrationRevisions_Text CHECK (LEN(LTRIM(RTRIM(NarrationText))) > 0),
                CONSTRAINT CK_PoiNarrationRevisions_FallbackVideoHttps CHECK (FallbackVideoUrl IS NULL OR FallbackVideoUrl LIKE N'https://%'),
                CONSTRAINT CK_PoiNarrationRevisions_Approval CHECK
                    ((State IN (N'DRAFT', N'DISCARDED') AND ApprovedByUserId IS NULL AND ApprovedAt IS NULL)
                     OR (State IN (N'APPROVED', N'SUPERSEDED') AND ApprovedByUserId IS NOT NULL AND ApprovedAt IS NOT NULL)),
                CONSTRAINT CK_PoiNarrationRevisions_NotSelfApproved CHECK (ApprovedByUserId IS NULL OR ApprovedByUserId <> LastEditedByUserId)
            );
            -- Deferred: the table does not exist when this batch compiles.
            EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_PoiNarrationRevisions_Draft
                ON dbo.PoiNarrationRevisions(ProposalId) WHERE State = N''DRAFT'';';
            EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_PoiNarrationRevisions_Approved
                ON dbo.PoiNarrationRevisions(ProposalId) WHERE State = N''APPROVED'';';

            -- Newest revision with non-blank narration per POI; trimmed as the old writer stored it.
            EXEC sys.sp_executesql N'INSERT INTO dbo.PoiNarrationRevisions
                (Id, ProposalId, RevisionNumber, NarrationText, FallbackVideoUrl, State,
                 CreatedByUserId, CreatedAt, LastEditedByUserId, LastEditedAt, ApprovedByUserId, ApprovedAt)
            SELECT NEWID(), source.ProposalId, 1, LTRIM(RTRIM(source.NarrationText)), source.FallbackVideoUrl, N''DRAFT'',
                source.CreatedByUserId, source.CreatedAt, source.CreatedByUserId, source.CreatedAt, NULL, NULL
            FROM (SELECT revision.ProposalId, revision.NarrationText, revision.FallbackVideoUrl,
                    revision.CreatedByUserId, revision.CreatedAt,
                    ROW_NUMBER() OVER (PARTITION BY revision.ProposalId ORDER BY revision.RevisionNumber DESC) AS Newest
                FROM dbo.PoiProposalRevisions revision
                WHERE revision.NarrationText IS NOT NULL AND LEN(LTRIM(RTRIM(revision.NarrationText))) > 0) source
            WHERE source.Newest = 1;';
        END;

        IF OBJECT_ID(N'dbo.PoiNarrationRequestReceipts', N'U') IS NULL
            CREATE TABLE dbo.PoiNarrationRequestReceipts
            (
                Id                  UNIQUEIDENTIFIER    NOT NULL,
                ActorUserId         UNIQUEIDENTIFIER    NOT NULL,
                RequestId           UNIQUEIDENTIFIER    NOT NULL,
                RequestHash         BINARY(32)          NOT NULL,
                Operation           NVARCHAR(20)        NOT NULL,
                NarrationRevisionId UNIQUEIDENTIFIER    NOT NULL,
                CreatedAt           DATETIMEOFFSET(3)   NOT NULL,
                CONSTRAINT PK_PoiNarrationRequestReceipts PRIMARY KEY (Id),
                CONSTRAINT FK_PoiNarrationRequestReceipts_ActorUserId FOREIGN KEY (ActorUserId) REFERENCES dbo.Users(Id),
                CONSTRAINT FK_PoiNarrationRequestReceipts_NarrationRevisionId FOREIGN KEY (NarrationRevisionId) REFERENCES dbo.PoiNarrationRevisions(Id),
                CONSTRAINT UQ_PoiNarrationRequestReceipts_Request UNIQUE (ActorUserId, RequestId),
                CONSTRAINT CK_PoiNarrationRequestReceipts_Operation CHECK (Operation IN (N'CREATE', N'EDIT', N'APPROVE', N'DISCARD'))
            );

        IF COL_LENGTH(N'dbo.RouteRevisionStops', N'NarrationRevisionId') IS NULL
            ALTER TABLE dbo.RouteRevisionStops ADD NarrationRevisionId UNIQUEIDENTIFIER NULL;
        IF OBJECT_ID(N'dbo.FK_RouteRevisionStops_NarrationRevisionId', N'F') IS NULL
            EXEC sys.sp_executesql N'ALTER TABLE dbo.RouteRevisionStops WITH CHECK ADD CONSTRAINT FK_RouteRevisionStops_NarrationRevisionId
                FOREIGN KEY (NarrationRevisionId) REFERENCES dbo.PoiNarrationRevisions(Id);';
    END;

    IF OBJECT_ID(N'dbo.PoiNarrationRevisions', N'U') IS NULL
        OR OBJECT_ID(N'dbo.PoiNarrationRequestReceipts', N'U') IS NULL
        OR COL_LENGTH(N'dbo.RouteRevisionStops', N'NarrationRevisionId') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.RouteRevisionStops')
            AND name=N'FK_RouteRevisionStops_NarrationRevisionId' AND is_disabled=0 AND is_not_trusted=0)
        OR (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiNarrationRevisions')
            AND name IN (N'CK_PoiNarrationRevisions_Approval', N'CK_PoiNarrationRevisions_NotSelfApproved', N'CK_PoiNarrationRevisions_State')
            AND is_disabled=0 AND is_not_trusted=0) <> 3
        OR (SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.PoiNarrationRevisions')
            AND name IN (N'UX_PoiNarrationRevisions_Draft', N'UX_PoiNarrationRevisions_Approved')
            AND is_unique=1 AND has_filter=1) <> 2
        THROW 51221, 'The trusted v1.22 POI narration tables, filtered indexes, CHECKs and route stop FK are required.', 1;

    IF @version = N'1.21'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.22';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
