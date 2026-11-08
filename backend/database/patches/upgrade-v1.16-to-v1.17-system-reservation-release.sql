-- ADR-0047: the system may release a Tour robot hold without a user (auto-cancel of a Tour not started in its window).
-- Replaces one CHECK: a releaser still implies a release, but a release no longer requires a releaser.
-- Every existing row satisfies the new CHECK; no table, row or grant changes. Rerunning on v1.17 only verifies.
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
    IF ISNULL(@version, N'') NOT IN (N'1.16', N'1.17')
        THROW 51170, 'Expected a v1.16 schema before the v1.17 system reservation release patch.', 1;
    IF OBJECT_ID(N'dbo.TourRobotReservations', N'U') IS NULL
        THROW 51171, 'The v1.16 TourRobotReservations table is required.', 1;

    IF @version = N'1.16'
    BEGIN
        -- Hold out concurrent writers until the replacement commits.
        DECLARE @rows int = (SELECT COUNT(*) FROM dbo.TourRobotReservations WITH (TABLOCKX, HOLDLOCK));
        IF OBJECT_ID(N'dbo.CK_TourRobotReservations_Release_Complete', N'C') IS NOT NULL
            ALTER TABLE dbo.TourRobotReservations DROP CONSTRAINT CK_TourRobotReservations_Release_Complete;
        IF OBJECT_ID(N'dbo.CK_TourRobotReservations_Release_Actor', N'C') IS NULL
            ALTER TABLE dbo.TourRobotReservations WITH CHECK ADD CONSTRAINT CK_TourRobotReservations_Release_Actor
                CHECK (ReleasedByUserId IS NULL OR ReleasedAt IS NOT NULL);
    END;

    IF OBJECT_ID(N'dbo.CK_TourRobotReservations_Release_Complete', N'C') IS NOT NULL
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.TourRobotReservations')
            AND name=N'CK_TourRobotReservations_Release_Actor' AND is_disabled=0 AND is_not_trusted=0)
        THROW 51172, 'The trusted v1.17 reservation release CHECK is required and the v1.16 one must be gone.', 1;

    IF @version = N'1.16'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.17';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
