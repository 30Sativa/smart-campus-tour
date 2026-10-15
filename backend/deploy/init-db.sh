#!/usr/bin/env bash
# Provision only the deployment-owned database; never migrate an existing schema.
set -euo pipefail

if [[ ! ${SQL_APP_PASSWORD:-} =~ ^[A-Za-z0-9!_-]{32,128}$ ]]; then
  echo 'SQL_APP_PASSWORD must have 32-128 characters: letters, digits, !, _ or -.' >&2
  exit 1
fi
: "${SQLCMDPASSWORD:?SQL admin password is required}"
sql=(/opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -C -b -l 15 -r 1)
schema_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.1.sql | sha256sum | cut -d ' ' -f 1)
export SchemaHash="$schema_hash" AppPassword="$SQL_APP_PASSWORD"

"${sql[@]}" -d master -Q "IF DB_ID(N'SmartCampusTourV11') IS NULL CREATE DATABASE SmartCampusTourV11;"
state=$("${sql[@]}" -d SmartCampusTourV11 -h -1 -W <<'SQL'
SET NOCOUNT ON;
DECLARE @hash nvarchar(64) = (
    SELECT CONVERT(nvarchar(64), value) FROM sys.extended_properties
    WHERE class = 0 AND name = N'CampusTourBootstrapHash');
IF @hash = N'$(SchemaHash)'
    SELECT 'READY';
ELSE IF @hash IS NULL AND NOT EXISTS (SELECT 1 FROM sys.tables WHERE is_ms_shipped = 0)
    SELECT 'EMPTY';
ELSE
    THROW 51000, 'Existing database is unmarked or has a different schema snapshot. Review it manually; automatic migration is disabled.', 1;
SQL
)
state=$(printf '%s' "$state" | tr -d '\r\n ')

if [[ "$state" == EMPTY ]]; then
  # sqlcmd stays on one connection across GO batches; any failure rolls back
  # the open transaction when -b exits and disconnects.
  "${sql[@]}" -d SmartCampusTourV11 <<'SQL'
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO
:r /database/smart-campus-tour-schema-v1.1.sql
:r /database/smart-campus-tour-permissions.sql
EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'$(SchemaHash)';
COMMIT TRANSACTION;
GO
SQL
elif [[ "$state" != READY ]]; then
  echo 'Unexpected database bootstrap state.' >&2
  exit 1
fi

# Never expose the sa password to the API. Password grammar above makes SQLCMD
# substitution safe. Re-running this step also synchronizes the app login secret.
"${sql[@]}" -d master <<'SQL'
SET NOCOUNT ON;
IF SUSER_ID(N'smartcampus_api') IS NULL
    CREATE LOGIN smartcampus_api WITH PASSWORD=N'$(AppPassword)', CHECK_POLICY=ON;
ELSE
    ALTER LOGIN smartcampus_api WITH PASSWORD=N'$(AppPassword)';
IF IS_SRVROLEMEMBER(N'sysadmin', N'smartcampus_api') = 1
    THROW 51001, 'Runtime login must not be sysadmin.', 1;
GO
SQL

"${sql[@]}" -d SmartCampusTourV11 <<'SQL'
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
:r /database/smart-campus-tour-permissions.sql
IF DATABASE_PRINCIPAL_ID(N'smartcampus_api') IS NULL
    CREATE USER smartcampus_api FOR LOGIN smartcampus_api;
IF IS_ROLEMEMBER(N'db_owner', N'smartcampus_api') = 1
    THROW 51002, 'Runtime user must not be db_owner.', 1;
IF IS_ROLEMEMBER(N'campus_tour_app', N'smartcampus_api') <> 1
    ALTER ROLE campus_tour_app ADD MEMBER smartcampus_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Users TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.UserRoles TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.RefreshTokens TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Pois TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.GroupRegistrations TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.RosterRows TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Invitations TO campus_tour_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.BrowserSessions TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.Routes TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.RouteStops TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.RouteVariants TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.Robots TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.Tours TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.TourAllowedBranches TO campus_tour_app;
GRANT SELECT ON OBJECT::dbo.BranchRequests TO campus_tour_app;
COMMIT TRANSACTION;
GO
SQL
echo 'Database schema and runtime permissions are ready.'
