-- Map package uniqueness for ADR-0040: one version per package within a map area.
-- Versions are immutable evidence, so duplicates stop the patch and nothing is deleted or rewritten here.
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRANSACTION;

DECLARE @schemaVersion nvarchar(32) = (SELECT CONVERT(nvarchar(32), value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion');
IF ISNULL(@schemaVersion, N'') NOT IN (N'1.12', N'1.13')
    THROW 51120, 'Expected a v1.12 schema before the v1.13 map package uniqueness patch.', 1;
IF OBJECT_ID(N'dbo.MapVersions', N'U') IS NULL
    THROW 51121, 'dbo.MapVersions is required for the v1.13 patch.', 1;

DECLARE @violations nvarchar(max) = (
    SELECT STRING_AGG(CONVERT(nvarchar(max), CONCAT(duplicate.AreaKey, N' (', duplicate.Versions, N') SHA-256 ', duplicate.Sha)), N'; ')
    FROM (
        SELECT m.AreaKey, CONVERT(nvarchar(64), m.PackageSha256, 2) AS Sha,
            STRING_AGG(CONVERT(nvarchar(max), CONCAT(N'v', m.VersionNumber)), N', ') WITHIN GROUP (ORDER BY m.VersionNumber) AS Versions
        FROM dbo.MapVersions m
        GROUP BY m.AreaKey, m.PackageSha256 HAVING COUNT(*) > 1
    ) duplicate);
IF @violations IS NOT NULL
BEGIN
    DECLARE @message nvarchar(2048) = LEFT(CONCAT(N'The same map package exists more than once in an area: ', @violations,
        N'. Decide which versions stay through a reviewed data change, then rerun this patch.'), 2048);
    ;THROW 51122, @message, 1;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.MapVersions') AND name=N'UX_MapVersions_Area_PackageSha256')
    EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_MapVersions_Area_PackageSha256 ON dbo.MapVersions(AreaKey, PackageSha256);';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.MapVersions') AND name=N'UX_MapVersions_Area_PackageSha256' AND is_unique=1)
    THROW 51123, 'Required v1.13 map package uniqueness structure is incomplete.', 1;

IF @schemaVersion = N'1.12'
    EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.13';
COMMIT TRANSACTION;
