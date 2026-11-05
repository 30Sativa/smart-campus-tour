# Fixed Route revisions and manual whole-route test API

Implemented backend slice: Route identity and immutable fixed-route revisions, Staff submission, Technical Staff manual test records, and history. This is separate from the older mutable Route catalog API and does not implement Tour readiness/scheduling or robot movement commands.

## Endpoints and access

| Method and path | Role | Result |
|---|---|---|
| `POST /api/staff/routes` | `Staff` (Tour Staff) | Creates a Route and draft revision 1 |
| `POST /api/staff/routes/{routeId}/revisions` | `Staff` | Appends a new immutable draft revision; requires `expectedCurrentRevision` |
| `POST /api/staff/routes/{routeId}/revisions/{revisionId}/submit` | `Staff` | Appends a submission receipt for the exact current revision |
| `GET /api/routes` | `Staff`, `TechnicalStaff` | Lists paged current VERSIONED revisions, including drafts; supports search, sort and optional exact `mapVersionId` and `isActive` filters |
| `POST /api/staff/routes/{routeId}/deactivate` | `Staff` | Stops new Tours on the route; body `{requestId, expectedRowVersion}` (ADR-0037) |
| `POST /api/staff/routes/{routeId}/activate` | `Staff` | Lifts the stop; same body |
| `GET /api/staff/routes/{routeId}/scheduled-tours` | `Staff` | SCHEDULED and READY Tours on the route |
| `GET /api/routes/{routeId}/revisions?revisionId={id}&includeHistory=true` | `Staff`, `TechnicalStaff` | Reads exact selected/current revision, POI evidence links and test history |
| `GET /api/technical/route-verifications/queue` | `TechnicalStaff` | Lists submitted revisions with no whole-route run yet |
| `GET /api/technical/route-verifications/participants` | `TechnicalStaff` | Lists active single-role Staff accounts (`userId`, `fullName`, `username`, at most 200) that a test run can name as participant |
| `POST /api/technical/routes/{routeId}/revisions/{revisionId}/test-runs` | `TechnicalStaff` | Appends a manual PASS/FAIL run for a submitted revision |

The old mutable Route write operations and `/api/admin/routes` alias are retired under ADR-0027. Two Staff-only reads (`GET /api/staff/manage/routes` and `GET /api/staff/manage/routes/{id}`) remain for the legacy Tour projection and return only `AuthoringMode=LEGACY`. They cannot author or activate Routes. New revision endpoints use the shared `Routes` identity table but do not serialize or mutate legacy `RouteStops`.

`GET /api/routes` lists current VERSIONED revision views, including drafts not yet submitted. Query fields are `search`, `mapVersionId`, `page` (default 1), `size` (default 20, maximum 100) and `sort` (`name`, `-name`, `createdAt`, `-createdAt`). A route appears once with its current revision; older revisions remain available from the history endpoint. The legacy GET projection remains separate and read-only for the existing Tour model.

## Create → submit → FAIL → revise → PASS → history

Use existing map and POI version APIs first: upload a ROS map version; record its manual deployment check on a physical robot; create/submit POI proposals and record Technical PASS for each. Use returned UUIDs directly. Example request values below are illustrative; replace IDs with actual API results.

### 1. Save the first draft

`POST /api/staff/routes`

```json
{
  "requestId": "a7000000-0000-0000-0000-000000000001",
  "expectedCurrentRevision": 0,
  "name": "Main campus tour",
  "description": "Fixed route for the pilot",
  "mapVersionId": "a7000000-0000-0000-0000-000000000010",
  "startX": 0.5,
  "startY": 0.5,
  "startYaw": 0.0,
  "endMode": "LAST_POI",
  "endX": null,
  "endY": null,
  "endYaw": null,
  "stops": [
    { "poiRevisionId": "a7000000-0000-0000-0000-000000000020", "dwellSeconds": 30, "headSteps": [{ "preset": "FRONT", "holdSeconds": 30 }] },
    { "poiRevisionId": "a7000000-0000-0000-0000-000000000021", "dwellSeconds": 45, "headSteps": [{ "preset": "LEFT", "holdSeconds": 20 }, { "preset": "FRONT", "holdSeconds": 25 }] }
  ]
}
```

Response is the normal `BaseResponse<RouteRevisionView>` envelope. `data.routeId`, `revisionId`, `revisionNumber`, `mapVersionId`, exact checksum and each `sourcePoiVerificationRecordId` are returned. API validates that all POIs and effective PASS evidence use the selected map, start/end are free cells in that map package, route order/dwell are valid, and request IDs are idempotent. POI IDs are never resolved to “latest.”

### 2. Submit the exact current revision

`POST /api/staff/routes/{routeId}/revisions/{revisionId}/submit`

```json
{ "requestId": "a7000000-0000-0000-0000-000000000002", "expectedCurrentRevision": 1 }
```

Submission is a separate receipt; it is not a test result, activation, scheduling, or READY state. Stale revision and changed effective POI result return 409.

**ADR-0033 map gate:** saving a draft and submitting a revision both require the exact map version to have current technical evidence under ADR-0028. Otherwise they return 409 `TECHNICAL_CHECK_PENDING` or `TECHNICAL_CHECK_NOT_PASSED` and write nothing. A committed idempotent retry still replays its result. Saved or submitted revisions are not rewritten, and route test runs keep their own deployment rule.

### 3. Technical Staff records a failed manual run

Read the queue, then call:
`POST /api/technical/routes/{routeId}/revisions/{revisionId}/test-runs`

```json
{
  "requestId": "a7000000-0000-0000-0000-000000000003",
  "robotCode": "physical_1",
  "participatingStaffUserId": "a7000000-0000-0000-0000-000000000030",
  "resultCode": "FAIL",
  "allStopsReached": false,
  "safelyStopped": true,
  "localizationPassed": true,
  "measuredDurationSeconds": 420,
  "failureReason": "Robot did not reach stop 2 during the observed test.",
  "evidenceNote": "Manual run on the physical robot; see linked test evidence."
}
```

The operator participant must be a different active account with role `Staff`; the API does not infer assignment from route creator. Technical Staff is the only role allowed to write run results. Before saving, the backend takes the same robot deployment-state SQL application lock as map deployment checks and POI verification, then confirms the robot's latest record across all maps matches the exact map version/checksum. Evidence records observations supplied by people; the API does not command or inspect the robot.

### 4. Correct and resubmit as a new revision

`POST /api/staff/routes/{routeId}/revisions`, with `expectedCurrentRevision: 1`, a new `requestId`, and the corrected complete map/stop/start/end configuration. The new row receives revision number 2. Revision 1, its submission and FAIL remain in history. A navigation change requires a whole-route run of revision 2. Content-only POI revisions or dwell-only changes can retain the same navigation evidence when map, poses, ordered POI navigation fingerprints, camera presets and head steps are unchanged. The route fingerprint excludes dwell, content revision IDs and evidence IDs; the exact source TestRun remains identified and immutable.

Submit revision 2 and record the same observations as PASS: all stops reached, localization passed and safe stop observed. PASS without all observations is rejected; FAIL requires at least one failed observation and a reason. New run records append; the latest run for the same route configuration is effective, so a newer FAIL cannot be hidden by an earlier PASS.

### 5. Read all revision and test evidence

`GET /api/routes/{routeId}/revisions?revisionId={revision2Id}&includeHistory=true`

Each stop includes its own `id` (`RouteRevisionStops.Id`, the value a Tour's execution stop ids name), the exact POI revision, map and source PASS evidence IDs, plus the narration text and optional HTTPS fallback video URL snapshotted when this route revision was saved. Later POI content revisions do not rewrite existing stops. Test records include the exact route revision, map checksum, robot, Technical checker, participating Staff, observations, measured duration, evidence, and timestamp. The view reports `durationStatus: INCOMPLETE_CONTENT_AUDIO_DATA` and recalculated `dwellDurationSeconds` separately because the approved narration/audio duration source is not implemented. A reused navigation TestRun is the source of evidence only; its measured duration is not presented as the duration of the new dwell configuration.

## Common responses and retry rules

- 400: invalid body, end pose mode without all pose fields, invalid free-cell pose, duplicate POI, bad dwell, incomplete PASS/FAIL observations.
- 401/403: missing JWT or role not permitted.
- 404: route, exact map version, POI revision, physical robot, or submitted revision is missing.
- 409: stale current revision, requestId reused with different body, selected POI PASS is no longer effective, robot's latest deployment is another map/checksum, already submitted revision, or workflow state conflict.
- Keep the same `requestId` for a byte-equivalent logical retry; use a new UUID when changing a request. Mutation commands run in the existing serializable Route transaction and append audit records.

## Not implemented in this API slice

## Measuring a whole-route test

`MeasuredDurationSeconds` is the total time for the whole route from departure to finish, including dwell at every stop (ADR-0035). New runs record `MeasurementBasis = TOTAL_WITH_DWELL`. A run from before that definition has NULL and cannot size a Tour reservation, so Tour create and the slot list report `ROUTE_TEST_REMEASURE_REQUIRED` until the route is run again. A revision that only raises dwell reuses the effective PASS, and the increase per stop is added to the reservation. Lower dwell is never subtracted.

No branch variants or Viewer/Representative branch requests, Tour scheduling/reservation/READY/Start/End Early, command transport, map upload/deployment, project POI YAML import, approved narration/audio workflow, media, frontend, or autonomous physical verification. Branch cutoff, YAML/frame mapping and M2 transport remain pending decisions. A route `PASS` is manual evidence for the stored navigation fingerprint, never Tour readiness.

## Diagram handoff

Member diagram update needed: ERD adds `Routes.AuthoringMode`, `RouteRevisions`, `RouteRevisionStops`, `RouteRevisionSubmissions`, `RouteTestRuns`, exact composite map/fingerprint/evidence links and append-only permissions. Add sequence for create/submit/manual run with shared robot-deployment lock, and state projection `DRAFT → SUBMITTED → NOT_TESTED/PASS/FAIL` (the stored tables do not add mutable lifecycle state). Diagram redraw/review remains pending.
