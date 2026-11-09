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
schema_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.19.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v118=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.18.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v117=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.17.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v116=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.16.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v115=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.15.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v114=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.14.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v113=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.13.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v112=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.12.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v111=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.11.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v110=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.10.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v19=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.9.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v18=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.8.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v16=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.6.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v17=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.7.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v15=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.5.sql | sha256sum | cut -d ' ' -f 1)
schema_hash_v14=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.4.sql | sha256sum | cut -d ' ' -f 1)
export SchemaHash="$schema_hash" SchemaHashV118="$schema_hash_v118" SchemaHashV117="$schema_hash_v117" SchemaHashV116="$schema_hash_v116" SchemaHashV115="$schema_hash_v115" SchemaHashV114="$schema_hash_v114" SchemaHashV113="$schema_hash_v113" SchemaHashV112="$schema_hash_v112" SchemaHashV111="$schema_hash_v111" SchemaHashV110="$schema_hash_v110" SchemaHashV19="$schema_hash_v19" SchemaHashV18="$schema_hash_v18" SchemaHashV17="$schema_hash_v17" SchemaHashV16="$schema_hash_v16" SchemaHashV15="$schema_hash_v15" SchemaHashV14="$schema_hash_v14" AppPassword="${SQL_APP_PASSWORD:-}"

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
  :r /database/smart-campus-tour-schema-v1.19.sql
:r /database/smart-campus-tour-permissions.sql
  :r /database/smart-campus-tour-map-poi-permissions.sql
  :r /database/smart-campus-tour-route-revision-permissions.sql
EXEC sys.sp_addextendedproperty @name=N'CampusTourBootstrapHash', @value=N'$(SchemaHash)';
EXEC sys.sp_addextendedproperty @name=N'CampusTourSchemaVersion', @value=N'1.19';
COMMIT TRANSACTION;
GO
SQL
elif [[ "$state" != READY ]]; then
  if [[ "$state" == UPGRADE_REQUIRED ]]; then
    echo 'Database schema is older than v1.19. Stop the deployment and follow the reviewed, backed-up Database First upgrade path; this initializer never migrates existing data.' >&2
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
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'CredentialHash',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'CredentialIssuedAt',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'CredentialIssuedByUserId',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'CredentialHint',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'CredentialRevokedAt',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'CredentialRevokedByUserId',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'FirstAcceptedSyncAt',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'FirstAcceptedMapKey',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'FirstAcceptedFrameId',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'AssignedMapVersionId',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'MapAssignedAt',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'MapAssignedByUserId',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.TourRobotReservations',N'OBJECT',N'INSERT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.TourRobotReservations',N'OBJECT',N'UPDATE',N'ReleasedAt',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.PoiImportReceipts',N'OBJECT',N'SELECT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.PoiImportReceipts',N'OBJECT',N'INSERT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.PoiImportReceipts',N'OBJECT',N'UPDATE') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.PoiImportReceipts',N'OBJECT',N'DELETE') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'AssignedAreaKey',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'DeactivatedAt',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'CurrentTourId',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'LastAssignedAt',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'NeedsInspection',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE',N'IsDispatchEnabled',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'UPDATE') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.Robots',N'OBJECT',N'DELETE') = 1
       THROW 51005, 'Runtime Robot grants are incomplete or too broad; update runtime grants through the controlled v1.19 upgrade/regrant before API deployment.', 1;
    IF HAS_PERMS_BY_NAME(N'dbo.PoiProposals',N'OBJECT',N'UPDATE',N'DiscardedAt',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.PoiProposals',N'OBJECT',N'UPDATE',N'DiscardedByUserId',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.PoiProposals',N'OBJECT',N'UPDATE') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.PoiProposals',N'OBJECT',N'DELETE') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.PoiProposalRevisions',N'OBJECT',N'DELETE') = 1
       THROW 51005, 'Runtime POI proposal grants are incomplete or too broad; update runtime grants through the controlled v1.19 upgrade/regrant before API deployment.', 1;
    REVERT;
    IF EXISTS (SELECT 1 FROM sys.database_permissions p
      WHERE p.grantee_principal_id IN (DATABASE_PRINCIPAL_ID(N'campus_tour_app'), DATABASE_PRINCIPAL_ID(N'smartcampus_api'))
        AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE'
        AND p.minor_id NOT IN (COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialHash','ColumnId'),
          COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialIssuedAt','ColumnId'),
          COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialIssuedByUserId','ColumnId'),
          COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialHint','ColumnId'),
          COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialRevokedAt','ColumnId'),
          COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialRevokedByUserId','ColumnId'),
          COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'FirstAcceptedSyncAt','ColumnId'),
          COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'FirstAcceptedMapKey','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'FirstAcceptedFrameId','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'AssignedMapVersionId','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'MapAssignedAt','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'MapAssignedByUserId','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'AssignedAreaKey','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'DeactivatedAt','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'DeactivatedByUserId','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'DeactivationReason','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CurrentTourId','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'LastAssignedAt','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'NeedsInspection','ColumnId'),
           COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'IsDispatchEnabled','ColumnId')))
       THROW 51005, 'Runtime Robot grants are incomplete or too broad; update runtime grants through the controlled v1.19 upgrade/regrant before API deployment.', 1;
    EXECUTE AS USER=N'smartcampus_api';
    IF HAS_PERMS_BY_NAME(N'dbo.RobotCommands',N'OBJECT',N'SELECT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.RobotCommands',N'OBJECT',N'INSERT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.RobotCommands',N'OBJECT',N'UPDATE',N'State',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.RobotCommands',N'OBJECT',N'UPDATE',N'IsOpen',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.RobotCommands',N'OBJECT',N'UPDATE',N'DeliveredStreamId',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.RobotCommands',N'OBJECT',N'UPDATE',N'ResolutionNote',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.RobotCommands',N'OBJECT',N'UPDATE',N'Kind',N'COLUMN') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.RobotCommands',N'OBJECT',N'UPDATE',N'X',N'COLUMN') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.RobotCommands',N'OBJECT',N'UPDATE',N'RobotId',N'COLUMN') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.RobotCommands',N'OBJECT',N'DELETE') = 1
       THROW 51005, 'Runtime robot command grants are incomplete or too broad; update runtime grants through the controlled v1.19 upgrade/regrant before API deployment.', 1;
    REVERT;
    EXECUTE AS USER=N'smartcampus_api';
    IF HAS_PERMS_BY_NAME(N'dbo.TourScheduleBlocks',N'OBJECT',N'SELECT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.TourScheduleBlocks',N'OBJECT',N'INSERT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.TourScheduleBlocks',N'OBJECT',N'UPDATE',N'RemovedAt',N'COLUMN') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.TourScheduleBlocks',N'OBJECT',N'UPDATE',N'Reason',N'COLUMN') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.TourScheduleBlocks',N'OBJECT',N'DELETE') = 1
       THROW 51005, 'Runtime schedule block grants are incomplete or too broad; update runtime grants through the controlled v1.19 upgrade/regrant before API deployment.', 1;
    REVERT;
    EXECUTE AS USER=N'smartcampus_api';
    IF HAS_PERMS_BY_NAME(N'dbo.AuditLogs',N'OBJECT',N'SELECT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.AuditLogs',N'OBJECT',N'INSERT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.AuditLogs',N'OBJECT',N'UPDATE') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.AuditLogs',N'OBJECT',N'DELETE') = 1
       THROW 51005, 'Runtime credential audit grants are incomplete or allow audit rewrites.', 1;
    REVERT;
    IF DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') IS NULL
       THROW 51006, 'Fleet credential provisioner role is missing; update provisioning grants through the controlled v1.19 upgrade/regrant before API deployment.', 1;
    IF NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'SELECT' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'Id','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'SELECT' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'RobotCode','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'SELECT' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'SourceType','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'SELECT' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialHash','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'SELECT' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialHint','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'SELECT' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'RowVersion','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'SELECT' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'DeactivatedAt','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialHash','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialIssuedAt','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialIssuedByUserId','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialHint','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialRevokedAt','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialRevokedByUserId','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'FirstAcceptedSyncAt','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'FirstAcceptedMapKey','ColumnId') AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE' AND p.minor_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'FirstAcceptedFrameId','ColumnId') AND p.state IN ('G','W'))
       OR EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'SELECT' AND p.minor_id NOT IN (COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'Id','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'RobotCode','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'SourceType','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialHash','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialHint','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'RowVersion','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'DeactivatedAt','ColumnId')))
       OR EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE' AND p.minor_id NOT IN (COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialHash','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialIssuedAt','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialIssuedByUserId','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialHint','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialRevokedAt','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'CredentialRevokedByUserId','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'FirstAcceptedSyncAt','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'FirstAcceptedMapKey','ColumnId'),COLUMNPROPERTY(OBJECT_ID(N'dbo.Robots'),N'FirstAcceptedFrameId','ColumnId')))
       OR EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name IN (N'UPDATE',N'DELETE') AND (p.minor_id=0 OR p.permission_name=N'DELETE'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.AuditLogs') AND p.permission_name=N'SELECT' AND p.minor_id=0 AND p.state IN ('G','W'))
       OR NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.AuditLogs') AND p.permission_name=N'INSERT' AND p.minor_id=0 AND p.state IN ('G','W'))
       OR EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.AuditLogs') AND p.permission_name IN (N'UPDATE',N'DELETE') AND (p.minor_id=0 OR p.permission_name=N'DELETE') AND p.state IN ('G','W'))
       THROW 51007, 'Fleet credential provisioner grants are incomplete or too broad; update provisioning grants through the controlled v1.19 upgrade/regrant before API deployment.', 1;
    IF EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'UPDATE' AND p.minor_id=0)
       OR EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'campus_fleet_provisioner') AND p.class=1 AND p.major_id=OBJECT_ID(N'dbo.Robots') AND p.permission_name=N'DELETE')
       THROW 51007, 'Fleet credential provisioner grants are incomplete or too broad; update provisioning grants through the controlled v1.19 upgrade/regrant before API deployment.', 1;
    SELECT 'COMPATIBLE';" | tr -d '\r\n '); then
    echo 'FAIL: runtime/provisioner grants are incomplete. For an existing database, run the controlled v1.19 Database First upgrade/regrant before API deployment.' >&2
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
:r /database/fleet-credential-provisioning-permissions.sql
COMMIT TRANSACTION;
GO
SQL
echo 'Database schema and runtime permissions are ready.'
