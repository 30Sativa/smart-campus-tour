-- ADR-0041: Technical Staff retire a map version instead of deleting it.
-- Additive: three nullable MapVersions columns, their FK and all-or-none CHECK. No existing row changes; the column
-- UPDATE grant is applied by the reviewed permissions script. Rerunning on v1.21 only verifies.
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
    IF ISNULL(@version, N'') NOT IN (N'1.20', N'1.21')
        THROW 51210, 'Expected a v1.20 schema before the v1.21 map retirement patch.', 1;

    IF @version = N'1.20'
    BEGIN
        IF COL_LENGTH(N'dbo.MapVersions', N'RetiredAt') IS NULL
            ALTER TABLE dbo.MapVersions ADD RetiredAt DATETIMEOFFSET(3) NULL, RetiredByUserId UNIQUEIDENTIFIER NULL,
                RetirementReason NVARCHAR(500) NULL;

        -- Deferred: the columns do not exist when this batch compiles.
        IF OBJECT_ID(N'dbo.FK_MapVersions_RetiredByUserId', N'F') IS NULL
            EXEC sys.sp_executesql N'ALTER TABLE dbo.MapVersions WITH CHECK ADD CONSTRAINT FK_MapVersions_RetiredByUserId
                FOREIGN KEY (RetiredByUserId) REFERENCES dbo.Users(Id);';
        IF OBJECT_ID(N'dbo.CK_MapVersions_Retirement_Complete', N'C') IS NULL
            EXEC sys.sp_executesql N'ALTER TABLE dbo.MapVersions WITH CHECK ADD CONSTRAINT CK_MapVersions_Retirement_Complete CHECK
                ((RetiredAt IS NULL AND RetiredByUserId IS NULL AND RetirementReason IS NULL)
                 OR (RetiredAt IS NOT NULL AND RetiredByUserId IS NOT NULL AND RetirementReason IS NOT NULL));';
    END;

    IF COL_LENGTH(N'dbo.MapVersions', N'RetiredAt') IS NULL
        OR COL_LENGTH(N'dbo.MapVersions', N'RetiredByUserId') IS NULL
        OR COL_LENGTH(N'dbo.MapVersions', N'RetirementReason') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.MapVersions')
            AND name=N'FK_MapVersions_RetiredByUserId' AND is_disabled=0 AND is_not_trusted=0)
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.MapVersions')
            AND name=N'CK_MapVersions_Retirement_Complete' AND is_disabled=0 AND is_not_trusted=0)
        THROW 51211, 'The trusted v1.21 map retirement columns, FK and CHECK are required.', 1;

    IF @version = N'1.20'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.21';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
