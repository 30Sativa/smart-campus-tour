-- Technical evidence photos: Cloudinary image URLs for verification records.
-- Additive: three nullable NVARCHAR(2000) columns with ISJSON CHECKs on MapDeploymentChecks, PoiVerificationRecords
-- and RouteTestRuns. No existing row changes; runtime already has SELECT/INSERT on these tables under their
-- table-level grants, so no grant changes. Rerunning on v1.26 only verifies.
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
    IF ISNULL(@version, N'') NOT IN (N'1.25', N'1.26')
        THROW 51260, 'Expected a v1.25 schema before the v1.26 technical evidence photos patch.', 1;

    IF @version = N'1.25'
    BEGIN
        IF COL_LENGTH(N'dbo.MapDeploymentChecks', N'EvidencePhotoUrlsJson') IS NULL
            ALTER TABLE dbo.MapDeploymentChecks ADD EvidencePhotoUrlsJson NVARCHAR(2000) NULL;

        -- Deferred: the column does not exist when this batch compiles.
        IF OBJECT_ID(N'dbo.CK_MapDeploymentChecks_EvidencePhotoUrlsJson', N'C') IS NULL
            EXEC sys.sp_executesql N'ALTER TABLE dbo.MapDeploymentChecks WITH CHECK ADD CONSTRAINT CK_MapDeploymentChecks_EvidencePhotoUrlsJson CHECK
                (EvidencePhotoUrlsJson IS NULL OR ISJSON(EvidencePhotoUrlsJson) = 1);';

        IF COL_LENGTH(N'dbo.PoiVerificationRecords', N'EvidencePhotoUrlsJson') IS NULL
            ALTER TABLE dbo.PoiVerificationRecords ADD EvidencePhotoUrlsJson NVARCHAR(2000) NULL;

        IF OBJECT_ID(N'dbo.CK_PoiVerificationRecords_EvidencePhotoUrlsJson', N'C') IS NULL
            EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiVerificationRecords WITH CHECK ADD CONSTRAINT CK_PoiVerificationRecords_EvidencePhotoUrlsJson CHECK
                (EvidencePhotoUrlsJson IS NULL OR ISJSON(EvidencePhotoUrlsJson) = 1);';

        IF COL_LENGTH(N'dbo.RouteTestRuns', N'EvidencePhotoUrlsJson') IS NULL
            ALTER TABLE dbo.RouteTestRuns ADD EvidencePhotoUrlsJson NVARCHAR(2000) NULL;

        IF OBJECT_ID(N'dbo.CK_RouteTestRuns_EvidencePhotoUrlsJson', N'C') IS NULL
            EXEC sys.sp_executesql N'ALTER TABLE dbo.RouteTestRuns WITH CHECK ADD CONSTRAINT CK_RouteTestRuns_EvidencePhotoUrlsJson CHECK
                (EvidencePhotoUrlsJson IS NULL OR ISJSON(EvidencePhotoUrlsJson) = 1);';
    END;

    IF COL_LENGTH(N'dbo.MapDeploymentChecks', N'EvidencePhotoUrlsJson') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.MapDeploymentChecks')
            AND name=N'CK_MapDeploymentChecks_EvidencePhotoUrlsJson' AND is_disabled=0 AND is_not_trusted=0)
        THROW 51261, 'The trusted v1.26 MapDeploymentChecks.EvidencePhotoUrlsJson column and CHECK are required.', 1;

    IF COL_LENGTH(N'dbo.PoiVerificationRecords', N'EvidencePhotoUrlsJson') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiVerificationRecords')
            AND name=N'CK_PoiVerificationRecords_EvidencePhotoUrlsJson' AND is_disabled=0 AND is_not_trusted=0)
        THROW 51261, 'The trusted v1.26 PoiVerificationRecords.EvidencePhotoUrlsJson column and CHECK are required.', 1;

    IF COL_LENGTH(N'dbo.RouteTestRuns', N'EvidencePhotoUrlsJson') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RouteTestRuns')
            AND name=N'CK_RouteTestRuns_EvidencePhotoUrlsJson' AND is_disabled=0 AND is_not_trusted=0)
        THROW 51261, 'The trusted v1.26 RouteTestRuns.EvidencePhotoUrlsJson column and CHECK are required.', 1;

    IF @version = N'1.25'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.26';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
