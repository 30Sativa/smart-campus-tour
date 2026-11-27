-- ADR-0073; no backfill: legacy RUNNING Tours with no contact permit backup Staff End Early.
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @version nvarchar(32) = (SELECT CONVERT(nvarchar(32), value)
        FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion');
    IF ISNULL(@version,N'') NOT IN (N'1.25',N'1.26')
        THROW 51260, 'Expected a v1.25 schema before the v1.26 Operator presence patch.', 1;
    IF @version = N'1.25' AND OBJECT_ID(N'dbo.TourOperatorPresence', N'U') IS NULL
        EXEC sys.sp_executesql N'CREATE TABLE dbo.TourOperatorPresence
(
    TourId UNIQUEIDENTIFIER NOT NULL,
    LastSeenAt DATETIMEOFFSET(3) NULL,
    CONSTRAINT PK_TourOperatorPresence PRIMARY KEY (TourId),
    CONSTRAINT FK_TourOperatorPresence_TourId FOREIGN KEY (TourId) REFERENCES dbo.Tours(Id)
);
';
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.TourOperatorPresence')
            AND name=N'LastSeenAt' AND system_type_id=43 AND scale=3 AND is_nullable=1)
        OR NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.TourOperatorPresence')
            AND name=N'PK_TourOperatorPresence' AND type='PK')
        OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.TourOperatorPresence')
            AND name=N'FK_TourOperatorPresence_TourId' AND referenced_object_id=OBJECT_ID(N'dbo.Tours') AND is_disabled=0 AND is_not_trusted=0)
        THROW 51261, 'The trusted v1.26 Operator presence table, nullable timestamp, PK and FK are required.', 1;
    IF @version = N'1.25'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.26';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
