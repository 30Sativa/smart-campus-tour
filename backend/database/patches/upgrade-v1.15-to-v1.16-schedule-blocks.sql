-- docs/lich-tour-theo-ca.md §5: Admin closes a campus day or one shift of it.
-- Additive: one new table; no existing table, row or grant changes. Rerunning on v1.16 only verifies.
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
    IF ISNULL(@version, N'') NOT IN (N'1.15', N'1.16')
        THROW 51160, 'Expected a v1.15 schema before the v1.16 schedule blocks patch.', 1;
    IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
        THROW 51161, 'The v1.15 Users table is required.', 1;

    IF @version = N'1.15' AND OBJECT_ID(N'dbo.TourScheduleBlocks', N'U') IS NULL
    BEGIN
        EXEC(N'CREATE TABLE dbo.TourScheduleBlocks
        (
            Id UNIQUEIDENTIFIER NOT NULL,
            BlockDate DATE NOT NULL,
            ShiftCode VARCHAR(20) NULL,
            Reason NVARCHAR(500) NOT NULL,
            CreatedByUserId UNIQUEIDENTIFIER NOT NULL,
            CreatedAt DATETIMEOFFSET(3) NOT NULL,
            RemovedByUserId UNIQUEIDENTIFIER NULL,
            RemovedAt DATETIMEOFFSET(3) NULL,
            CONSTRAINT PK_TourScheduleBlocks PRIMARY KEY (Id),
            CONSTRAINT FK_TourScheduleBlocks_CreatedByUserId FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(Id),
            CONSTRAINT FK_TourScheduleBlocks_RemovedByUserId FOREIGN KEY (RemovedByUserId) REFERENCES dbo.Users(Id),
            CONSTRAINT CK_TourScheduleBlocks_Reason CHECK (LEN(LTRIM(RTRIM(Reason))) > 0),
            CONSTRAINT CK_TourScheduleBlocks_ShiftCode CHECK (ShiftCode IS NULL OR LEN(LTRIM(RTRIM(ShiftCode))) > 0),
            CONSTRAINT CK_TourScheduleBlocks_Removal_Complete CHECK
                ((RemovedAt IS NULL AND RemovedByUserId IS NULL) OR (RemovedAt IS NOT NULL AND RemovedByUserId IS NOT NULL))
        );');
        EXEC(N'CREATE UNIQUE INDEX UX_TourScheduleBlocks_Active ON dbo.TourScheduleBlocks(BlockDate, ShiftCode) WHERE RemovedAt IS NULL;');
    END;

    IF OBJECT_ID(N'dbo.TourScheduleBlocks', N'U') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TourScheduleBlocks')
            AND name=N'UX_TourScheduleBlocks_Active' AND is_unique=1 AND has_filter=1)
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.TourScheduleBlocks')
            AND name=N'CK_TourScheduleBlocks_Removal_Complete' AND is_disabled=0 AND is_not_trusted=0)
        THROW 51162, 'The v1.16 TourScheduleBlocks table, its active-block index and removal CHECK are required.', 1;

    IF @version = N'1.15'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.16';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
