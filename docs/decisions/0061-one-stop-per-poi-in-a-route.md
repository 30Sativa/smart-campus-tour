# ADR-0061: A POI appears at most once in a route revision

Date: 2026-11-15
Status: accepted by the owner (task brief 15/11/2026); implemented in backend and web
Related: ADR-0023 (versioned routes), ADR-0034 (Tours run an exact route revision), ADR-0060 (narration)

## Context

A route revision stop points at one exact POI revision (`RouteRevisionStops.PoiProposalRevisionId`), so a route and
the Tours created from it run the POI pose that was tested. That stays.

The save validator only refused the same POI **revision** twice. Two revisions of one POI could therefore sit in one
route. The web route editor made that easy: it listed only POIs whose current revision passed and matched stops by
revision id, so a stop on an older revision disappeared from the list, its name fell back to the GUID, and ticking the
POI again added its newer revision as a second stop. The route detail page never said that a POI in the route had a
newer revision.

## Decision

- `SaveRouteRevision` refuses a route in which one POI proposal appears more than once: 409 `ROUTE_DUPLICATE_POI`,
  "POI {tên} đã có trong tuyến. Mỗi POI chỉ được dùng một lần." The check runs after the POI evidence checks and
  before the stop-separation rule, so Staff sees the real problem rather than "two stops too close".
- `RouteRevisionStopView` gains `poiProposalId` (added at the end; existing fields unchanged), so a reader can find
  the POI behind a stop and its current revision.
- The web editor shows every stop from the route's own data (name, pose), never a GUID, and does not offer a POI that
  is already a stop. When the stop's POI has a newer revision:
  - newer revision passed: "POI này có phiên bản mới đã đạt" and a "Dùng bản mới" button that swaps the revision and
    keeps dwell and head steps; when the pose or camera differs, "Tuyến sẽ phải chạy thử lại";
  - newer revision not passed: "POI này đang có bản sửa chưa đạt, tuyến giữ bản cũ", without a button.
- The route detail page says, on the current revision only, which POIs have a newer passed revision, with a link to
  edit the route.

## Consequences

- Nothing updates an existing route revision or Tour to a newer POI revision; Staff saves a new route revision.
- The route fingerprint and the test-run inheritance (ADR-0023/0060) are unchanged: a newer POI revision that keeps the
  navigation fingerprint keeps the route's test run.
- Existing route revisions that already contain one POI twice stay readable; saving them again needs one stop removed.
