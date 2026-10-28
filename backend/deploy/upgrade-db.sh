#!/usr/bin/env bash
# Explicit, backed-up Database First upgrade path. Never called by API startup/deploy.
set -euo pipefail

[[ ${1:-} == --upgrade-to-v1.4 && $# == 1 ]] || {
  echo 'Usage: upgrade-db.sh --upgrade-to-v1.4' >&2
  exit 2
}
: "${SQLCMDPASSWORD:?SQL admin password is required}"

# -I: sqlcmd defaults QUOTED_IDENTIFIER OFF, which rejects the filtered indexes created by the patches.
sql=(/opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -C -b -I -l 30 -r 1)
database_exists=$("${sql[@]}" -d master -h -1 -W -Q "SET NOCOUNT ON; SELECT CASE WHEN DB_ID(N'SmartCampusTourV11') IS NULL THEN 0 ELSE 1 END;" | tr -d '\r\n ')
[[ "$database_exists" == 1 ]] || { echo 'Existing SmartCampusTourV11 database is required; this command never bootstraps.' >&2; exit 1; }

apply() {
  local file=$1
  echo "Applying additive database patch: $file"
  "${sql[@]}" -d SmartCampusTourV11 -i "/database/$file"
}

# GRANT/DENY only: idempotent, no DDL, backfill, login or password change.
apply_runtime_grants() {
  apply smart-campus-tour-permissions.sql
  apply smart-campus-tour-map-poi-permissions.sql
  apply smart-campus-tour-route-revision-permissions.sql
  apply smart-campus-tour-runtime-permissions.sql
}

schema_version=$("${sql[@]}" -d SmartCampusTourV11 -h -1 -W -Q "SET NOCOUNT ON; SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';" | tr -d '\r\n ')
bootstrap_hash=$("${sql[@]}" -d SmartCampusTourV11 -h -1 -W -Q "SET NOCOUNT ON; SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash';" | tr -d '\r\n ')
v14_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.4.sql | sha256sum | cut -d ' ' -f 1)
upgradable_snapshot=false
case "$bootstrap_hash" in
  96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68|2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67|b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43)
    upgradable_snapshot=true ;;
esac

if [[ "$schema_version" == 1.4 ]]; then
  # The marker is written by the final DDL patch before the runtime grants run. A rerun after a
  # grant failure may complete grants only for a recognized snapshot whose v1.4 structure is intact.
  [[ "$upgradable_snapshot" == true || "$bootstrap_hash" == "$v14_hash" ]] || {
    echo 'Schema version marker reports 1.4 but the snapshot marker is unknown or absent; refusing to complete grants.' >&2
    exit 1
  }
  structure=$(SchemaHash="$v14_hash" SchemaHashV14="$v14_hash" "${sql[@]}" -d SmartCampusTourV11 -h -1 -W \
    -i /database/smart-campus-tour-bootstrap-check.sql | tr -d '\r\n ') || structure=INCOMPLETE
  [[ "$structure" == READY ]] || {
    echo 'Schema version marker reports 1.4 but the required v1.4 structure is incomplete; refusing to complete grants. Inspect and repair from a verified backup.' >&2
    exit 1
  }
  echo 'Schema version marker reports 1.4 and the v1.4 structure is present; completing runtime grants without DDL or backfill.'
  apply_runtime_grants
  exec /bin/bash /deployment/init-db.sh --check-only
fi

[[ "$upgradable_snapshot" == true ]] || { echo 'Database snapshot marker is unknown or absent; refusing automatic upgrade.' >&2; exit 1; }

# Each patch is idempotent. A failure stops here; preserve the backup and rerun
# only after reviewing the exact partial state. SchemaVersion is set by the final
# patch only after its required v1.4 structure has been checked; a later grant
# failure is completed by rerunning this command (the 1.4 branch above).
apply patches/add-poi-rowversion-v1.1.sql
apply patches/upgrade-v1.1-to-v1.2-map-poi.sql
apply smart-campus-tour-permissions.sql
apply smart-campus-tour-map-poi-permissions.sql
apply patches/upgrade-v1.2-to-v1.3-route-revisions.sql
apply smart-campus-tour-route-revision-permissions.sql
apply patches/upgrade-v1.3-to-v1.4-row-registration.sql
apply smart-campus-tour-runtime-permissions.sql
exec /bin/bash /deployment/init-db.sh --check-only
