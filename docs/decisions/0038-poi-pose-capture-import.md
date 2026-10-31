# ADR-0038: Import POIs from robot pose-capture files

- **Status:** Accepted by the repository owner, 2026-11-01, through the task brief for this change. No physical behavior was tested by this change.
- **Related:** ADR-0020 (roles), ADR-0021 (versioned map and POI), ADR-0028 (map check before POI preparation), ADR-0031 (narration), ADR-0023 (route test).
- **Narrows:** the "project POI YAML" pending item in ADR-0020, ADR-0021 and the scope documents, for the robot's own pose-capture format only. Project YAML templates and any frame transform stay pending.

## Context

Technical Staff drive the robot to each spot and record its pose on the MiniPC as a small YAML file (`robot/robot_maps/poi_records/README.md`). Typing those poses into the web and checking them again repeats work, but treating the file as a completed manual check would claim observations nobody made.

## Decision

1. **Actor.** Only TechnicalStaff imports. No new role. Each committed import writes `POI_POSE_IMPORT_COMPLETED` with its files, plus the normal proposal/revision rows and `POI_POSE_CAPTURE_VERIFIED` per verified file, in the same transaction, and Admin sees them in the audit log. A refused import commits nothing, so it leaves no audit row.
2. **Format.** `.yaml`/`.yml`, at most 50 files of 64 KB, or one ZIP of them at its root. The YAML is read from YamlDotNet's event stream: tags, anchors, aliases, multiple documents, duplicate keys and unknown fields are refused. YamlDotNet is a new dependency because the spec needs a real YAML reader; the line parser for map packages cannot tell quoted from plain scalars or handle flow style.
3. **File checks.** Against the MapVersion and robot Technical Staff selected: `map_yaml` equals the YAML name inside that package (`MAP_YAML_MISMATCH`), `frame_id` equals its frame (`FRAME_MISMATCH`), any quaternion agrees with `yaw` within 0.01 rad (`YAW_QUATERNION_MISMATCH`), the pose is on a free cell (`POSE_NOT_FREE`), and the map is eligible for POI preparation. No frame is transformed. X/Y round to 4 places and yaw to 6, as the revision stores them; the raw file keeps the original.
4. **Verified files need a deployed robot.** A `verified: true` file requires that physical robot's latest deployment check, across all maps, to be a PASS on this exact map and SHA, the same rule as manual verification, else `MAP_NOT_DEPLOYED`.
5. **All or nothing.** Preview and import share one validation pass. If any file fails, import returns 409 `POI_IMPORT_INVALID` and writes nothing.
6. **Honest evidence.** `PoiVerificationRecords.VerificationMethod` is `MANUAL_CHECK` (the default for existing rows) or `POSE_CAPTURE`. A POSE_CAPTURE record is always PASS, leaves reach, stop, localization and camera NULL because nobody observed them, and stores the raw file bytes (at most 64 KB) with their SHA-256. MANUAL_CHECK keeps today's rules unchanged. A check constraint enforces both shapes.
7. **Effective result.** A POSE_CAPTURE PASS counts like a manual PASS under the same fingerprint rules. A newer FAIL supersedes it. Changing pose, map or camera preset needs a new result.
8. **Identity and idempotency.** `PoiProposals` gains `SourceAreaKey` and `SourcePoiId`, unique when set, so a source id means one POI per map area, case-insensitive under the database collation. `PoiImportReceipts` is append-only with one row per file: a retried `requestId` returns the same result, reusing it with other content is `IDEMPOTENCY_CONFLICT`, and the same file SHA on the same map version is `NO_CHANGE` even if the robot has since moved.
9. **New capture of a known POI.** It creates a new revision of the same proposal with the new map and pose. Name, purpose, description, narration, video and camera preset are carried from the current revision, because they belong to Staff. The `name` in the file is used only when the POI is created.
10. **Content stays with Staff.** An imported revision has CameraPreset FRONT, no narration and a placeholder purpose. It is submitted, so a `verified: false` file reaches the normal Technical queue. Staff adds name and narration through a normal content-only revision, which keeps the PASS because the fingerprint is unchanged. Staff cannot edit a submitted, not yet passed revision, so a `verified: false` POI gets its content after verification.
11. **Route rule.** `SaveRouteRevision` refuses a stop whose POI revision has no narration with 409 `POI_NARRATION_REQUIRED`.
12. **Route test is unchanged.** A whole-route test run stays mandatory. Pose capture proves where the robot was, not that it can travel the route.

## Database

Schema v1.11 with `patches/upgrade-v1.10-to-v1.11-poi-pose-import.sql`. The four observation columns become nullable. Runtime gets SELECT/INSERT on `PoiImportReceipts`, and its access to verification records stays SELECT/INSERT, so evidence is never updated or deleted.

## Out of scope

New roles, generated narration, importing camera presets, MiniPC upload tooling, frame transforms and project YAML templates.
