-- ADR-0064: an account's own avatar picture.
-- Additive: one nullable Users column and its HTTPS CHECK. No existing row changes; runtime already has UPDATE on
-- dbo.Users, so no grant changes. Rerunning on v1.24 only verifies.
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
    IF ISNULL(@version, N'') NOT IN (N'1.23', N'1.24')
        THROW 51240, 'Expected a v1.23 schema before the v1.24 user avatar patch.', 1;

    IF @version = N'1.23'
    BEGIN
        IF COL_LENGTH(N'dbo.Users', N'AvatarUrl') IS NULL
            ALTER TABLE dbo.Users ADD AvatarUrl NVARCHAR(1000) NULL;

        -- Deferred: the column does not exist when this batch compiles.
        IF OBJECT_ID(N'dbo.CK_Users_AvatarUrlHttps', N'C') IS NULL
            EXEC sys.sp_executesql N'ALTER TABLE dbo.Users WITH CHECK ADD CONSTRAINT CK_Users_AvatarUrlHttps CHECK
                (AvatarUrl IS NULL OR AvatarUrl LIKE N''https://%'');';
    END;

    IF COL_LENGTH(N'dbo.Users', N'AvatarUrl') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Users')
            AND name=N'CK_Users_AvatarUrlHttps' AND is_disabled=0 AND is_not_trusted=0)
        THROW 51241, 'The trusted v1.24 Users.AvatarUrl column and CHECK are required.', 1;

    IF @version = N'1.23'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.24';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
