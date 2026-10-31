#!/usr/bin/env bash
# Explicit, backed-up Database First upgrade path. Never called by API startup/deploy.
set -euo pipefail

[[ ${1:-} == --upgrade-to-v1.12 && $# == 1 ]] || {
  echo 'Usage: upgrade-db.sh --upgrade-to-v1.12' >&2
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

apply_runtime_grants() {
  apply smart-campus-tour-permissions.sql
  apply smart-campus-tour-map-poi-permissions.sql
  apply smart-campus-tour-route-revision-permissions.sql
  apply smart-campus-tour-runtime-permissions.sql
  apply fleet-credential-provisioning-permissions.sql
}

schema_version=$("${sql[@]}" -d SmartCampusTourV11 -h -1 -W -Q "SET NOCOUNT ON; SELECT CONVERT(nvarchar(32),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourSchemaVersion';" | tr -d '\r\n ')
bootstrap_hash=$("${sql[@]}" -d SmartCampusTourV11 -h -1 -W -Q "SET NOCOUNT ON; SELECT CONVERT(nvarchar(64),value) FROM sys.extended_properties WHERE class=0 AND name=N'CampusTourBootstrapHash';" | tr -d '\r\n ')
v14_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.4.sql | sha256sum | cut -d ' ' -f 1)
v15_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.5.sql | sha256sum | cut -d ' ' -f 1)
v17_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.7.sql | sha256sum | cut -d ' ' -f 1)
v18_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.8.sql | sha256sum | cut -d ' ' -f 1)
v19_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.9.sql | sha256sum | cut -d ' ' -f 1)
v110_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.10.sql | sha256sum | cut -d ' ' -f 1)
v111_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.11.sql | sha256sum | cut -d ' ' -f 1)
v112_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.12.sql | sha256sum | cut -d ' ' -f 1)
v16_hash=$(sed 's/\r$//' /database/smart-campus-tour-schema-v1.6.sql | sha256sum | cut -d ' ' -f 1)
recognized_snapshot=false
case "$bootstrap_hash" in
  "$v14_hash"|"$v15_hash"|"$v16_hash"|"$v17_hash"|"$v18_hash"|"$v19_hash"|"$v110_hash"|"$v111_hash"|96d459f6b9570d6773bf31f880095d13e7800b76ef657843314d2a04e8d79d68|2762f3c0fbb080031bb841a6061ae73858b0c6e28f17307ebb63339ec5217b67|b34aa0c3369ce44c8fb09957b69a5b8edde648ae56063c0b29eaa664411daf43)
    recognized_snapshot=true ;;
esac

if [[ "$schema_version" == 1.12 ]]; then
  [[ "$bootstrap_hash" == "$v112_hash" || "$recognized_snapshot" == true ]] || {
    echo 'Schema version marker reports 1.12 but the snapshot marker is unknown or absent; refusing to complete grants.' >&2
    exit 1
  }
  structure=$(SchemaHash="$v112_hash" SchemaHashV111="$v111_hash" SchemaHashV110="$v110_hash" SchemaHashV19="$v19_hash" SchemaHashV18="$v18_hash" SchemaHashV17="$v17_hash" SchemaHashV16="$v16_hash" SchemaHashV15="$v15_hash" SchemaHashV14="$v14_hash" "${sql[@]}" -d SmartCampusTourV11 -h -1 -W \
    -i /database/smart-campus-tour-bootstrap-check.sql | tr -d '\r\n ') || structure=INCOMPLETE
  [[ "$structure" == READY ]] || { echo 'Schema version marker reports 1.12 but the required structure is incomplete; refusing to complete grants.' >&2; exit 1; }
  echo 'Schema version marker reports 1.12 and the v1.12 structure is present; completing runtime and credential-provisioning grants only, no DDL or backfill.'
  apply_runtime_grants
  exec /bin/bash /deployment/init-db.sh --check-only
fi

if [[ "$schema_version" == 1.11 ]]; then
  [[ "$bootstrap_hash" == "$v111_hash" || "$recognized_snapshot" == true ]] || {
    echo 'Schema version marker reports 1.11 but the snapshot marker is unknown or absent; refusing to complete grants.' >&2
    exit 1
  }
  structure=$(SchemaHash="$v112_hash" SchemaHashV111="$v111_hash" SchemaHashV110="$v110_hash" SchemaHashV19="$v19_hash" SchemaHashV18="$v18_hash" SchemaHashV17="$v17_hash" SchemaHashV16="$v16_hash" SchemaHashV15="$v15_hash" SchemaHashV14="$v14_hash" "${sql[@]}" -d SmartCampusTourV11 -h -1 -W \
    -i /database/smart-campus-tour-bootstrap-check.sql | tr -d '\r\n ') || structure=INCOMPLETE
  [[ "$structure" == UPGRADE_REQUIRED ]] || { echo 'Schema version marker reports 1.11 but the required structure is incomplete; refusing upgrade.' >&2; exit 1; }
  echo 'Schema version marker reports 1.11; applying additive v1.11-to-v1.12 robot lifecycle patch.'
  apply patches/upgrade-v1.11-to-v1.12-robot-lifecycle.sql
  apply_runtime_grants
  exec /bin/bash /deployment/init-db.sh --check-only
fi

if [[ "$schema_version" == 1.10 ]]; then
  [[ "$bootstrap_hash" == "$v110_hash" || "$recognized_snapshot" == true ]] || {
    echo 'Schema version marker reports 1.10 but the snapshot marker is unknown or absent; refusing to complete grants.' >&2
    exit 1
  }
  structure=$(SchemaHash="$v112_hash" SchemaHashV111="$v111_hash" SchemaHashV110="$v110_hash" SchemaHashV19="$v19_hash" SchemaHashV18="$v18_hash" SchemaHashV17="$v17_hash" SchemaHashV16="$v16_hash" SchemaHashV15="$v15_hash" SchemaHashV14="$v14_hash" "${sql[@]}" -d SmartCampusTourV11 -h -1 -W \
    -i /database/smart-campus-tour-bootstrap-check.sql | tr -d '\r\n ') || structure=INCOMPLETE
  [[ "$structure" == UPGRADE_REQUIRED ]] || { echo 'Schema version marker reports 1.10 but the required structure is incomplete; refusing upgrade.' >&2; exit 1; }
  echo 'Schema version marker reports 1.10; applying additive v1.10-to-v1.11 POI pose-import patch.'
  apply patches/upgrade-v1.10-to-v1.11-poi-pose-import.sql
  apply patches/upgrade-v1.11-to-v1.12-robot-lifecycle.sql
  apply_runtime_grants
  exec /bin/bash /deployment/init-db.sh --check-only
fi

if [[ "$schema_version" == 1.9 ]]; then
  [[ "$bootstrap_hash" == "$v19_hash" || "$recognized_snapshot" == true ]] || {
    echo 'Schema version marker reports 1.9 but the snapshot marker is unknown or absent; refusing to complete grants.' >&2
    exit 1
  }
  structure=$(SchemaHash="$v112_hash" SchemaHashV111="$v111_hash" SchemaHashV110="$v110_hash" SchemaHashV19="$v19_hash" SchemaHashV18="$v18_hash" SchemaHashV17="$v17_hash" SchemaHashV16="$v16_hash" SchemaHashV15="$v15_hash" SchemaHashV14="$v14_hash" "${sql[@]}" -d SmartCampusTourV11 -h -1 -W \
    -i /database/smart-campus-tour-bootstrap-check.sql | tr -d '\r\n ') || structure=INCOMPLETE
  [[ "$structure" == UPGRADE_REQUIRED ]] || { echo 'Schema version marker reports 1.9 but the required structure is incomplete; refusing upgrade.' >&2; exit 1; }
  echo 'Schema version marker reports 1.9; applying additive v1.9-to-v1.10 Tour scheduling patch.'
  apply patches/upgrade-v1.9-to-v1.10-tour-scheduling.sql
  apply patches/upgrade-v1.10-to-v1.11-poi-pose-import.sql
  apply patches/upgrade-v1.11-to-v1.12-robot-lifecycle.sql
  apply_runtime_grants
  exec /bin/bash /deployment/init-db.sh --check-only
fi

if [[ "$schema_version" == 1.8 ]]; then
  [[ "$bootstrap_hash" == "$v18_hash" || "$recognized_snapshot" == true ]] || {
    echo 'Schema version marker reports 1.8 but the snapshot marker is unknown or absent; refusing to complete grants.' >&2
    exit 1
  }
  structure=$(SchemaHash="$v112_hash" SchemaHashV111="$v111_hash" SchemaHashV110="$v110_hash" SchemaHashV19="$v19_hash" SchemaHashV18="$v18_hash" SchemaHashV17="$v17_hash" SchemaHashV16="$v16_hash" SchemaHashV15="$v15_hash" SchemaHashV14="$v14_hash" "${sql[@]}" -d SmartCampusTourV11 -h -1 -W \
    -i /database/smart-campus-tour-bootstrap-check.sql | tr -d '\r\n ') || structure=INCOMPLETE
  [[ "$structure" == UPGRADE_REQUIRED ]] || { echo 'Schema version marker reports 1.8 but the required structure is incomplete; refusing upgrade.' >&2; exit 1; }
  echo 'Schema version marker reports 1.8; applying additive v1.8-to-v1.9 Tour route revision patch.'
  apply patches/upgrade-v1.8-to-v1.9-tour-route-revision.sql
  apply patches/upgrade-v1.9-to-v1.10-tour-scheduling.sql
  apply patches/upgrade-v1.10-to-v1.11-poi-pose-import.sql
  apply patches/upgrade-v1.11-to-v1.12-robot-lifecycle.sql
  apply_runtime_grants
  exec /bin/bash /deployment/init-db.sh --check-only
fi

if [[ "$schema_version" == 1.7 ]]; then
  [[ "$bootstrap_hash" == "$v17_hash" || "$recognized_snapshot" == true ]] || {
    echo 'Schema version marker reports 1.7 but the snapshot marker is unknown or absent; refusing to complete grants.' >&2
    exit 1
  }
  structure=$(SchemaHash="$v112_hash" SchemaHashV111="$v111_hash" SchemaHashV110="$v110_hash" SchemaHashV19="$v19_hash" SchemaHashV18="$v18_hash" SchemaHashV17="$v17_hash" SchemaHashV16="$v16_hash" SchemaHashV15="$v15_hash" SchemaHashV14="$v14_hash" "${sql[@]}" -d SmartCampusTourV11 -h -1 -W \
    -i /database/smart-campus-tour-bootstrap-check.sql | tr -d '\r\n ') || structure=INCOMPLETE
  [[ "$structure" == UPGRADE_REQUIRED ]] || { echo 'Schema version marker reports 1.7 but the required structure is incomplete; refusing upgrade.' >&2; exit 1; }
  echo 'Schema version marker reports 1.7; applying additive v1.7-to-v1.8 robot map assignment patch.'
  apply patches/upgrade-v1.7-to-v1.8-robot-map-assignment.sql
  apply patches/upgrade-v1.8-to-v1.9-tour-route-revision.sql
  apply patches/upgrade-v1.9-to-v1.10-tour-scheduling.sql
  apply patches/upgrade-v1.10-to-v1.11-poi-pose-import.sql
  apply patches/upgrade-v1.11-to-v1.12-robot-lifecycle.sql
  apply_runtime_grants
  exec /bin/bash /deployment/init-db.sh --check-only
fi

if [[ "$schema_version" == 1.6 ]]; then
  [[ "$bootstrap_hash" == "$v16_hash" || "$recognized_snapshot" == true ]] || {
    echo 'Schema version marker reports 1.6 but the snapshot marker is unknown or absent; refusing upgrade.' >&2
    exit 1
  }
  structure=$(SchemaHash="$v112_hash" SchemaHashV111="$v111_hash" SchemaHashV110="$v110_hash" SchemaHashV19="$v19_hash" SchemaHashV18="$v18_hash" SchemaHashV17="$v17_hash" SchemaHashV16="$v16_hash" SchemaHashV15="$v15_hash" SchemaHashV14="$v14_hash" "${sql[@]}" -d SmartCampusTourV11 -h -1 -W \
    -i /database/smart-campus-tour-bootstrap-check.sql | tr -d '\r\n ') || structure=INCOMPLETE
  [[ "$structure" == UPGRADE_REQUIRED ]] || { echo 'Schema version marker reports 1.6 but the required structure is incomplete; refusing upgrade.' >&2; exit 1; }
  echo 'Schema version marker reports 1.6; applying additive v1.6-to-v1.7 POI narration patch.'
  apply patches/upgrade-v1.6-to-v1.7-poi-narration.sql
  apply patches/upgrade-v1.7-to-v1.8-robot-map-assignment.sql
  apply patches/upgrade-v1.8-to-v1.9-tour-route-revision.sql
  apply patches/upgrade-v1.9-to-v1.10-tour-scheduling.sql
  apply patches/upgrade-v1.10-to-v1.11-poi-pose-import.sql
  apply patches/upgrade-v1.11-to-v1.12-robot-lifecycle.sql
  apply_runtime_grants
  exec /bin/bash /deployment/init-db.sh --check-only
fi

if [[ "$schema_version" == 1.5 ]]; then
  [[ "$bootstrap_hash" == "$v15_hash" || "$recognized_snapshot" == true ]] || {
    echo 'Schema version marker reports 1.5 but the snapshot marker is unknown or absent; refusing to complete grants.' >&2
    exit 1
  }
  structure=$(SchemaHash="$v112_hash" SchemaHashV111="$v111_hash" SchemaHashV110="$v110_hash" SchemaHashV19="$v19_hash" SchemaHashV18="$v18_hash" SchemaHashV17="$v17_hash" SchemaHashV16="$v16_hash" SchemaHashV15="$v15_hash" SchemaHashV14="$v14_hash" "${sql[@]}" -d SmartCampusTourV11 -h -1 -W \
    -i /database/smart-campus-tour-bootstrap-check.sql | tr -d '\r\n ') || structure=INCOMPLETE
  [[ "$structure" == UPGRADE_REQUIRED ]] || {
    echo 'Schema version marker reports 1.5 but the required v1.5 structure is incomplete; refusing upgrade. Inspect and repair from a verified backup.' >&2
    exit 1
  }
  echo 'Schema version marker reports 1.5 and the v1.5 structure is present; applying the additive v1.5-to-v1.6 credential lifecycle patch.'
  apply patches/upgrade-v1.5-to-v1.6-robot-credential-lifecycle.sql
  apply patches/upgrade-v1.6-to-v1.7-poi-narration.sql
  apply patches/upgrade-v1.7-to-v1.8-robot-map-assignment.sql
  apply patches/upgrade-v1.8-to-v1.9-tour-route-revision.sql
  apply patches/upgrade-v1.9-to-v1.10-tour-scheduling.sql
  apply patches/upgrade-v1.10-to-v1.11-poi-pose-import.sql
  apply patches/upgrade-v1.11-to-v1.12-robot-lifecycle.sql
  apply_runtime_grants
  exec /bin/bash /deployment/init-db.sh --check-only
fi

if [[ "$schema_version" == 1.4 ]]; then
  [[ "$recognized_snapshot" == true ]] || {
    echo 'Schema version marker reports 1.4 but the snapshot marker is unknown or absent; refusing upgrade.' >&2
    exit 1
  }
  structure=$(SchemaHash="$v112_hash" SchemaHashV111="$v111_hash" SchemaHashV110="$v110_hash" SchemaHashV19="$v19_hash" SchemaHashV18="$v18_hash" SchemaHashV17="$v17_hash" SchemaHashV16="$v16_hash" SchemaHashV15="$v15_hash" SchemaHashV14="$v14_hash" "${sql[@]}" -d SmartCampusTourV11 -h -1 -W \
    -i /database/smart-campus-tour-bootstrap-check.sql | tr -d '\r\n ') || structure=INCOMPLETE
  [[ "$structure" == UPGRADE_REQUIRED ]] || {
    echo 'Schema version marker reports 1.4 but the required v1.4 structure is incomplete; refusing upgrade. Inspect and repair from a verified backup.' >&2
    exit 1
  }
  echo 'Schema version marker reports 1.4 and the prior structure is present; applying the additive v1.4-to-v1.5 robot confirmation patch.'
  apply patches/upgrade-v1.4-to-v1.5-robot-connection-confirmation.sql
  apply patches/upgrade-v1.5-to-v1.6-robot-credential-lifecycle.sql
  apply patches/upgrade-v1.6-to-v1.7-poi-narration.sql
  apply patches/upgrade-v1.7-to-v1.8-robot-map-assignment.sql
  apply patches/upgrade-v1.8-to-v1.9-tour-route-revision.sql
  apply patches/upgrade-v1.9-to-v1.10-tour-scheduling.sql
  apply patches/upgrade-v1.10-to-v1.11-poi-pose-import.sql
  apply patches/upgrade-v1.11-to-v1.12-robot-lifecycle.sql
  apply_runtime_grants
  exec /bin/bash /deployment/init-db.sh --check-only
fi

[[ "$recognized_snapshot" == true ]] || { echo 'Database snapshot marker is unknown or absent; refusing automatic upgrade.' >&2; exit 1; }

# Each patch is idempotent; each patch advances its marker after verifying its own structure.
apply patches/add-poi-rowversion-v1.1.sql
apply patches/upgrade-v1.1-to-v1.2-map-poi.sql
apply smart-campus-tour-permissions.sql
apply smart-campus-tour-map-poi-permissions.sql
apply patches/upgrade-v1.2-to-v1.3-route-revisions.sql
apply smart-campus-tour-route-revision-permissions.sql
apply patches/upgrade-v1.3-to-v1.4-row-registration.sql
apply patches/upgrade-v1.4-to-v1.5-robot-connection-confirmation.sql
apply patches/upgrade-v1.5-to-v1.6-robot-credential-lifecycle.sql
apply patches/upgrade-v1.6-to-v1.7-poi-narration.sql
apply patches/upgrade-v1.7-to-v1.8-robot-map-assignment.sql
apply patches/upgrade-v1.8-to-v1.9-tour-route-revision.sql
apply patches/upgrade-v1.9-to-v1.10-tour-scheduling.sql
apply patches/upgrade-v1.10-to-v1.11-poi-pose-import.sql
apply patches/upgrade-v1.11-to-v1.12-robot-lifecycle.sql
apply_runtime_grants
exec /bin/bash /deployment/init-db.sh --check-only
