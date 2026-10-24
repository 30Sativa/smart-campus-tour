-- Apply once to an existing v1.1 database before deploying Admin POI Management.
-- Safe to rerun; this adds no data-bearing business field and does not reset POIs.
IF OBJECT_ID(N'dbo.Pois', N'U') IS NULL
    THROW 51000, 'dbo.Pois does not exist; apply the v1.1 schema first.', 1;
GO

IF COL_LENGTH(N'dbo.Pois', N'RowVersion') IS NULL
    ALTER TABLE dbo.Pois ADD RowVersion ROWVERSION NOT NULL;
GO
