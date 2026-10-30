-- Add immutable POI narration content to revisions and route-stop snapshots.
-- Existing rows remain NULL; the application requires narration only when submitting.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @schemaVersion nvarchar(32) = (
    SELECT CONVERT(nvarchar(32), value) FROM sys.extended_properties
    WHERE class = 0 AND name = N'CampusTourSchemaVersion');
IF ISNULL(@schemaVersion, N'') NOT IN (N'1.6', N'1.7')
    THROW 51080, 'Expected a v1.6 schema before the v1.7 POI narration patch.', 1;
IF OBJECT_ID(N'dbo.PoiProposalRevisions', N'U') IS NULL OR OBJECT_ID(N'dbo.RouteRevisionStops', N'U') IS NULL
    THROW 51081, 'Versioned POI and route revision tables are required for the v1.7 patch.', 1;

IF COL_LENGTH(N'dbo.PoiProposalRevisions', N'NarrationText') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiProposalRevisions ADD NarrationText NVARCHAR(4000) NULL;';
IF COL_LENGTH(N'dbo.PoiProposalRevisions', N'FallbackVideoUrl') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiProposalRevisions ADD FallbackVideoUrl NVARCHAR(2048) NULL;';
IF COL_LENGTH(N'dbo.RouteRevisionStops', N'NarrationText') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.RouteRevisionStops ADD NarrationText NVARCHAR(4000) NULL;';
IF COL_LENGTH(N'dbo.RouteRevisionStops', N'FallbackVideoUrl') IS NULL
    EXEC sys.sp_executesql N'ALTER TABLE dbo.RouteRevisionStops ADD FallbackVideoUrl NVARCHAR(2048) NULL;';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiProposalRevisions') AND name=N'CK_PoiProposalRevisions_FallbackVideoHttps')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PoiProposalRevisions WITH CHECK ADD CONSTRAINT CK_PoiProposalRevisions_FallbackVideoHttps CHECK (FallbackVideoUrl IS NULL OR FallbackVideoUrl LIKE N''https://%'');';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RouteRevisionStops') AND name=N'CK_RouteRevisionStops_FallbackVideoHttps')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.RouteRevisionStops WITH CHECK ADD CONSTRAINT CK_RouteRevisionStops_FallbackVideoHttps CHECK (FallbackVideoUrl IS NULL OR FallbackVideoUrl LIKE N''https://%'');';

IF COL_LENGTH(N'dbo.PoiProposalRevisions', N'NarrationText') IS NULL OR
   COL_LENGTH(N'dbo.PoiProposalRevisions', N'FallbackVideoUrl') IS NULL OR
   COL_LENGTH(N'dbo.RouteRevisionStops', N'NarrationText') IS NULL OR
   COL_LENGTH(N'dbo.RouteRevisionStops', N'FallbackVideoUrl') IS NULL OR
   NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PoiProposalRevisions') AND name=N'CK_PoiProposalRevisions_FallbackVideoHttps') OR
   NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.RouteRevisionStops') AND name=N'CK_RouteRevisionStops_FallbackVideoHttps')
    THROW 51082, 'Required v1.7 POI narration structure is incomplete.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PoiProposalRevisions') AND name=N'NarrationText' AND system_type_id=231 AND max_length=8000 AND is_nullable=1) OR
   NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PoiProposalRevisions') AND name=N'FallbackVideoUrl' AND system_type_id=231 AND max_length=4096 AND is_nullable=1) OR
   NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.RouteRevisionStops') AND name=N'NarrationText' AND system_type_id=231 AND max_length=8000 AND is_nullable=1) OR
   NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.RouteRevisionStops') AND name=N'FallbackVideoUrl' AND system_type_id=231 AND max_length=4096 AND is_nullable=1)
    THROW 51083, 'v1.7 POI narration columns have incorrect types, lengths or nullability.', 1;

IF @schemaVersion = N'1.6'
    EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.7';

COMMIT TRANSACTION;
