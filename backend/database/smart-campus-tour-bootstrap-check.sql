-- SQLCMD input: SchemaHash is the SHA-256 of the mounted, CRLF-normalized snapshot.
-- Only these two audited snapshots differ by comments. Preserve the existing marker and data.
-- Do not extend this compatibility pair for executable schema changes or unknown database markers.
SET NOCOUNT ON;
DECLARE @hash nvarchar(64) = (
    SELECT CONVERT(nvarchar(64), value) FROM sys.extended_properties
    WHERE class = 0 AND name = N'CampusTourBootstrapHash');
DECLARE @current nvarchar(64) = N'$(SchemaHash)';
DECLARE @v14 nvarchar(64) = N'$(SchemaHashV14)';
IF @hash = @current AND @current = @v14
    SELECT 'READY';
ELSE IF @hash IN (
    N'96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68',
    N'2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67')
    SELECT 'UPGRADE_REQUIRED';
ELSE IF @hash IS NULL AND NOT EXISTS (SELECT 1 FROM sys.tables WHERE is_ms_shipped = 0)
    SELECT 'EMPTY';
ELSE
    THROW 51000, 'Existing database is unmarked or has a different schema snapshot. Review it manually; automatic migration is disabled.', 1;
