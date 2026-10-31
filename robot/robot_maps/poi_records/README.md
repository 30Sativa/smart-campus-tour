# Recovered POI records

These records were copied from the MiniPC's POI archive on 2026-10-31. They use
`robot/robot_maps/map2.yaml` in the `map` frame. They are historical
measurements and are not loaded automatically by robot navigation or used as
production Route data.

## Recovered from the MiniPC

| Record | Status in source | Pose `(x, y, yaw)` | Notes |
|---|---|---|---|
| [POI_02](poi_02.yaml) | Owner-confirmed; `verified: true` | `(29.692, -5.439, -0.291)` | Source originally marked it rejected due to poor AMCL/scan-match readings; the owner confirmed this pose is correct on 2026-10-31. |
| [Provisional POI_02](poi_02_provisional_20261019.yaml) | Provisional; `verified: false` | `(30.211, -5.690, -0.364)` | AMCL had not converged; the source note recommends recording again with good localization. |
| [POI_03](poi_03.yaml) | Unverified; `verified: false` | `(42.460, -23.038, -1.613)` | Recorded with scan match 0.76; still needs verification before use. |

The MiniPC archive contained both POI_02 captures and POI_03. The other saved
points already in the repository are `robot/robot_maps/poi_start.yaml` and
`robot/robot_maps/poi_01.yaml`. Both currently have `verified: false`.
The separate MiniPC backup of POI_01 matched the repository file byte-for-byte,
so it is represented by that existing file instead of a duplicate copy.

Do not promote a record to an active or production POI based only on this
archive. Re-record and verify its pose against the current map before using it
for navigation or route authoring.
