-- ADR-0044: terminal commands require a non-NULL outcome matching their state.
-- Preserve the v1.14 snapshot and command history; never infer a missing outcome.
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
    IF ISNULL(@version, N'') NOT IN (N'1.14', N'1.15')
        THROW 51140, 'Expected a v1.14 schema before the v1.15 command outcome patch.', 1;
    IF OBJECT_ID(N'dbo.RobotCommands', N'U') IS NULL
        OR OBJECT_ID(N'dbo.CK_RobotCommands_Outcome', N'C') IS NULL
        THROW 51141, 'The v1.14 RobotCommands table and outcome CHECK are required.', 1;

    -- Keep concurrent writes out until validation and replacement have committed.
    DECLARE @violations nvarchar(max) = (
        SELECT STRING_AGG(CONVERT(nvarchar(max), CONVERT(nvarchar(36), Id)), N', ')
        FROM dbo.RobotCommands WITH (TABLOCKX, HOLDLOCK)
        WHERE (State IN ('ARRIVED','FAILED','CANCELLED') AND (Outcome IS NULL OR Outcome <> State))
           OR (State NOT IN ('ARRIVED','FAILED','CANCELLED') AND Outcome IS NOT NULL));
    IF @violations IS NOT NULL
    BEGIN
        DECLARE @message nvarchar(2048) = LEFT(CONCAT(N'RobotCommands have inconsistent outcomes: ', @violations,
            N'. Repair command history through a reviewed data change, then rerun this patch.'), 2048);
        ;THROW 51142, @message, 1;
    END;

    IF @version = N'1.14'
    BEGIN
        ALTER TABLE dbo.RobotCommands DROP CONSTRAINT CK_RobotCommands_Outcome;
        ALTER TABLE dbo.RobotCommands WITH CHECK ADD CONSTRAINT CK_RobotCommands_Outcome CHECK
            ((State IN ('ARRIVED','FAILED','CANCELLED') AND Outcome IS NOT NULL AND Outcome = State)
             OR (State NOT IN ('ARRIVED','FAILED','CANCELLED') AND Outcome IS NULL));
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id=OBJECT_ID(N'dbo.RobotCommands') AND name=N'CK_RobotCommands_Outcome'
          AND is_disabled=0 AND is_not_trusted=0
          AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(definition), N'[', N''), N']', N''), N' ', N''), CHAR(13), N''), CHAR(10), N'') LIKE N'%outcomeisnotnull%')
        THROW 51143, 'The trusted v1.15 terminal command outcome CHECK is required.', 1;

    IF @version = N'1.14'
        EXEC sys.sp_updateextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.15';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
