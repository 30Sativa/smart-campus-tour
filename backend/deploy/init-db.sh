#!/usr/bin/env bash
# Explicit database tool. --check-only is read-only; --bootstrap is for an empty DB only.
set -euo pipefail

mode=${1:-}
case "$mode" in
  --check-only|--bootstrap) ;;
  *) echo 'Usage: init-db.sh --check-only | --bootstrap' >&2; exit 2 ;;
esac
if [[ "$mode" == --bootstrap && ! ${SQL_APP_PASSWORD:-} =~ ^[A-Za-z0-9!_-]{32,128}$ ]]; then
  echo 'SQL_APP_PASSWORD must have 32-128 characters: letters, digits, !, _ or -.' >&2
  exit 1
fi
: "${SQLCMDPASSWORD:?SQL admin password is required}"
sql=(/opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -C -b -l 15 -r 1)
schema_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.4.sql | sha256sum | cut -d ' ' -f 1)
export SchemaHash="$schema_hash" SchemaHashV14="$schema_hash" AppPassword="${SQL_APP_PASSWORD:-}"

database_exists=$("${sql[@]}" -d master -h -1 -W -Q "SET NOCOUNT ON; SELECT CASE WHEN DB_ID(N'SmartCampusTourV11') IS NULL THEN 0 ELSE 1 END;" | tr -d '\r\n ')
if [[ "$database_exists" == 0 ]]; then
  [[ "$mode" == --bootstrap ]] || { echo 'Database is absent; deploy is read-only and cannot bootstrap it.' >&2; exit 1; }
  "${sql[@]}" -d master -Q "CREATE DATABASE SmartCampusTourV11;"
elif [[ "$database_exists" != 1 ]]; then
  echo 'SQL Server returned an invalid database-existence result.' >&2
  exit 1
fi
state=$("${sql[@]}" -d SmartCampusTourV11 -h -1 -W -i /database/smart-campus-tour-bootstrap-check.sql)
state=$(printf '%s' "$state" | tr -d '\r\n ')

if [[ "$state" == EMPTY ]]; then
  [[ "$mode" == --bootstrap ]] || { echo 'Database is empty; API deploy cannot bootstrap it.' >&2; exit 1; }
  # sqlcmd stays on one connection across GO batches; any failure rolls back
  # the open transaction when -b exits and disconnects.
  "${sql[@]}" -d SmartCampusTourV11 <<'SQL'
SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO
  :r /database/smart-campus-tour-schema-v1.4.sql
:r /database/smart-campus-tour-permissions.sql
  :r /database/smart-campus-tour-map-poi-permissions.sql
  :r /database/smart-campus-tour-route-revision-permissions.sql
EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'$(SchemaHash)';
EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.4';
COMMIT TRANSACTION;
GO
SQL
elif [[ "$state" != READY ]]; then
  if [[ "$state" == UPGRADE_REQUIRED ]]; then
    echo 'Database schema is older than v1.4. Stop the deployment and follow the reviewed, backed-up Database First upgrade path; this initializer never migrates existing data.' >&2
    exit 1
  fi
  echo 'Unexpected database bootstrap state.' >&2
  exit 1
fi

if [[ "$mode" == --check-only ]]; then
  if ! permissions=$("${sql[@]}" -d SmartCampusTourV11 -h -1 -W -Q "SET NOCOUNT ON;
    IF DATABASE_PRINCIPAL_ID(N'smartcampus_api') IS NULL THROW 51003, 'Runtime database user is missing.', 1;
    EXECUTE AS USER=N'smartcampus_api';
    IF HAS_PERMS_BY_NAME(N'dbo.MapVersions',N'OBJECT',N'SELECT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.RouteRevisions',N'OBJECT',N'SELECT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.RosterEmailChangeRequests',N'OBJECT',N'SELECT') <> 1
       THROW 51004, 'Runtime database grants are incomplete.', 1;
    IF HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'SELECT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'INSERT') <> 1
       THROW 51005, 'Runtime robot registration grants are incomplete; update runtime grants through the controlled v1.4 regrant before API deployment.', 1;
    REVERT;
    SELECT 'COMPATIBLE';" | tr -d '\r\n '); then
    echo 'FAIL: runtime grants are incomplete. For an existing v1.4 database, update runtime grants through the controlled regrant before API deployment.' >&2
    exit 1
  fi
  [[ "$permissions" == COMPATIBLE ]] || { echo 'Runtime database grants are not compatible.' >&2; exit 1; }
  echo 'PASS: database schema and runtime grants are compatible; no database or login state was changed.'
  exit 0
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
:r /database/smart-campus-tour-runtime-permissions.sql
COMMIT TRANSACTION;
GO
SQL
echo 'Database schema and runtime permissions are ready.'
