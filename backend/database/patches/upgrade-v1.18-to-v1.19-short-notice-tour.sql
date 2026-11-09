-- ADR-0050: marks a Tour as short notice. Every existing Tour keeps the standard 72/48/24-hour schedule.
-- Additive: no existing row changes meaning and no grant changes. Rerunning on v1.19 only verifies.
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
    IF ISNULL(@version, N'') NOT IN (N'1.18', N'1.19')
        THROW 51190, 'Expected a v1.18 schema before the v1.19 short-notice Tour patch.', 1;

    IF @version = N'1.18' AND COL_LENGTH(N'dbo.Tours', N'IsShortNotice') IS NULL
        ALTER TABLE dbo.Tours ADD IsShortNotice BIT NOT NULL CONSTRAINT DF_Tours_IsShortNotice DEFAULT (0);

    IF COL_LENGTH(N'dbo.Tours', N'IsShortNotice') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.columns c JOIN sys.default_constraints d ON d.object_id = c.default_object_id
            WHERE c.object_id=OBJECT_ID(N'dbo.Tours') AND c.name=N'IsShortNotice' AND c.is_nullable=0 AND d.name=N'DF_Tours_IsShortNotice')
        THROW 51191, 'The non-null v1.19 Tours.IsShortNotice column with its default is required.', 1;

    IF @version = N'1.18'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.19';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
