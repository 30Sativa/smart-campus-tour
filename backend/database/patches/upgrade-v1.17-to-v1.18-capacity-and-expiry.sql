-- ADR-0048: Tour capacity (existing Tours receive 20) and the EXPIRED state of roster rows and email-change requests.
-- Additive: no existing row changes state and no grant changes. Rerunning on v1.18 only verifies.
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
    IF ISNULL(@version, N'') NOT IN (N'1.17', N'1.18')
        THROW 51180, 'Expected a v1.17 schema before the v1.18 capacity and expiry patch.', 1;

    IF @version = N'1.17'
    BEGIN
        -- Hold out concurrent writers until the replacements commit.
        DECLARE @rows int = (SELECT COUNT(*) FROM dbo.RosterRows WITH (TABLOCKX, HOLDLOCK));
        SET @rows = (SELECT COUNT(*) FROM dbo.RosterEmailChangeRequests WITH (TABLOCKX, HOLDLOCK));

        IF COL_LENGTH(N'dbo.Tours', N'Capacity') IS NULL
            ALTER TABLE dbo.Tours ADD Capacity INT NOT NULL CONSTRAINT DF_Tours_Capacity DEFAULT (20);

        -- Deferred: the column does not exist when this batch compiles.
        IF OBJECT_ID(N'dbo.CK_Tours_Capacity', N'C') IS NULL
            EXEC sys.sp_executesql N'ALTER TABLE dbo.Tours WITH CHECK ADD CONSTRAINT CK_Tours_Capacity CHECK (Capacity BETWEEN 1 AND 40);';

        ALTER TABLE dbo.RosterRows DROP CONSTRAINT CK_RosterRows_ParticipationState;
        ALTER TABLE dbo.RosterRows WITH CHECK ADD CONSTRAINT CK_RosterRows_ParticipationState
            CHECK (ParticipationState IN ('PENDING','ACCEPTED','REJECTED','REMOVED','EXPIRED'));

        ALTER TABLE dbo.RosterEmailChangeRequests DROP CONSTRAINT CK_RosterEmailChangeRequests_State;
        ALTER TABLE dbo.RosterEmailChangeRequests WITH CHECK ADD CONSTRAINT CK_RosterEmailChangeRequests_State
            CHECK (State IN ('PENDING','ACCEPTED','REJECTED','EXPIRED'));
    END;

    IF COL_LENGTH(N'dbo.Tours', N'Capacity') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Tours')
            AND name=N'CK_Tours_Capacity' AND is_disabled=0 AND is_not_trusted=0)
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RosterRows')
            AND name=N'CK_RosterRows_ParticipationState' AND is_disabled=0 AND is_not_trusted=0 AND definition LIKE N'%EXPIRED%')
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RosterEmailChangeRequests')
            AND name=N'CK_RosterEmailChangeRequests_State' AND is_disabled=0 AND is_not_trusted=0 AND definition LIKE N'%EXPIRED%')
        THROW 51181, 'The trusted v1.18 capacity and expiry CHECKs are required.', 1;

    IF @version = N'1.17'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.18';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
