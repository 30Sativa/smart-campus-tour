-- ADR-0062: Staff retire a POI instead of deleting it.
-- Additive: two nullable PoiProposals columns, their FK and all-or-none CHECK. No existing row changes; the column
-- UPDATE grant is applied by the reviewed permissions script. Rerunning on v1.23 only verifies.
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
    IF ISNULL(@version, N'') NOT IN (N'1.22', N'1.23')
        THROW 51230, 'Expected a v1.22 schema before the v1.23 POI retirement patch.', 1;

    IF @version = N'1.22'
    BEGIN
        IF COL_LENGTH(N'dbo.PoiProposals', N'RetiredAt') IS NULL
            ALTER TABLE dbo.PoiProposals ADD RetiredAt DATETIMEOFFSET(3) NULL, RetiredByUserId UNIQUEIDENTIFIER NULL;

        -- Deferred: the columns do not exist when this batch compiles.
        IF OBJECT_ID(N'dbo.FK_PoiProposals_RetiredByUserId', N'F') IS NULL
            EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiProposals WITH CHECK ADD CONSTRAINT FK_PoiProposals_RetiredByUserId
                FOREIGN KEY (RetiredByUserId) REFERENCES dbo.Users(Id);';
        IF OBJECT_ID(N'dbo.CK_PoiProposals_Retirement_Complete', N'C') IS NULL
            EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiProposals WITH CHECK ADD CONSTRAINT CK_PoiProposals_Retirement_Complete CHECK
                ((RetiredAt IS NULL AND RetiredByUserId IS NULL) OR (RetiredAt IS NOT NULL AND RetiredByUserId IS NOT NULL));';
    END;

    IF COL_LENGTH(N'dbo.PoiProposals', N'RetiredAt') IS NULL
        OR COL_LENGTH(N'dbo.PoiProposals', N'RetiredByUserId') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.PoiProposals')
            AND name=N'FK_PoiProposals_RetiredByUserId' AND is_disabled=0 AND is_not_trusted=0)
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiProposals')
            AND name=N'CK_PoiProposals_Retirement_Complete' AND is_disabled=0 AND is_not_trusted=0)
        THROW 51231, 'The trusted v1.23 POI retirement columns, FK and CHECK are required.', 1;

    IF @version = N'1.22'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.23';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
