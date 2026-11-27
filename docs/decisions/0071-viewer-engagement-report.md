# ADR-0071: Aggregate viewer engagement report for Staff

- **Status:** Proposed 25/11/2026 by the owner's request ("thu thập, phân tích người dùng hay tương tác để cải thiện
  tour"). Implemented in backend and web; needs the owner's acceptance and a real Tour run to check the numbers.
- **Related:** ADR-0011 (student data use), ADR-0016 (Q&A, no stored history), ADR-0043 (Tour runtime), ADR-0065
  (viewer vote), `docs/architecture.md` §7.3.
- **Partially supersedes:** ADR-0011's "no new metrics" clause, for the aggregate metrics listed below only, and
  ADR-0016's "no stored Q&A history", in that an answered question is now *counted* (never its text).

## Context

Staff want to know how viewers take part in a Tour (who joins, votes, asks the AI, and where they leave) to improve
routes: which POI needs more narration, which dwell is too long, which POI is skipped or never asked about. The data
mostly exists already (`BrowserSessions`, `TourStopVotes`, `TourStopVisits`, `TourEvents`), but two facts were
missing: when the robot arrived at each POI on a non-voting route, and how many questions were asked where.

ADR-0011 limits student data to registration, access and Tour statistics, and forbids inferring interest of a person.

## Decision

1. **Aggregates, not people.** The report answers "who interacts" by invitation type (`INDIVIDUAL` /
   `SHARED_VIEWING`) and by POI. No endpoint returns a display name, email, class, roster row id, session or token,
   and there is no per-person ranking. A shared-viewing row is one room: it is reported as a room, never as a
   number of students.
2. **Counted questions.** Each answered Student question appends a `STUDENT_QUESTION_ASKED` Tour event with
   `StopVisitId` (the visit the robot is observing, else null) and `DataJson {"phase","rowType","outOfScope"}`.
   Question and answer text, session and row are never stored. A replayed question id is not counted again; a
   question that gets no answer (assistant error, access revoked) is not counted. Counting is best effort: a
   failure is logged and the Student still gets the answer. It is not operational use of the Tour
   (`GetUsageAsync` ignores it, so a waiting-room question does not lock the schedule).
3. **Arrival event.** When the robot reports ARRIVED at a POI, the backend appends `STOP_ARRIVED` with the new
   `StopVisitId`, `TargetStopOrder` and `DataJson {"stopId"}`. With `VISIT_CLOSED` it gives every visit a time
   window. Voting Tours recorded before this event fall back to `TourStopVisits`.
4. **No schema change.** Both events use existing `TourEvents` columns; the runtime role already has INSERT there.
5. **Metrics.** Per Tour: accepted / joined / voted rows and questions per invitation type; questions in the waiting
   room, during the Tour, at a stop and out of scope; per stop its outcome, arrival, actual vs planned dwell,
   questions, ballot voters, votes received and viewers who left there. "Left" is a LOGOUT, or the last heartbeat of
   a session that stopped, while the Tour runs; a revoked invitation, a return within the 2-minute reconnect window
   and leaving at the end are not counted. Per period (at most 366 days, at most 300 ended Tours): the same summed,
   per POI proposal (stable across revisions), with the join rate and questions per Tour.
6. **Signals.** Fixed rules mark a stop or POI: `MOST_QUESTIONS`, `MOST_LEFT`, `MOST_VOTED`, `OVER_DWELL` (≥ 1.5× and
   +60 s), `SHORT_DWELL` (< 0.5×), `SKIPPED`, and in the period `NO_QUESTIONS`. The web turns them into suggestions
   for the route owner; nothing changes a route automatically.
7. **Access.** Staff only (`GET /api/staff/engagement`, `GET /api/staff/manage/tours/{id}/engagement`). Retention
   follows the Tour events.

## Consequences

- Staff see `/staff/engagement` (menu "Phân tích tương tác") and a per-Tour page linked from Lịch sử Tour.
- Two exact-sequence SQL tests now expect `STOP_ARRIVED` after each POI arrival's `LEG_TERMINAL`.
- Numbers are only as precise as heartbeats: a viewer who closes the tab is placed at their last heartbeat.
- If the group later needs per-person engagement, that needs its own decision under ADR-0011 first.

## Update 2026-11-28

### Status

**Proposed – out of V1 scope (Phiếu v1.12).**

### Notes

This scope classification follows the owner's docs-sync instruction; it does not change the original proposal's
date, requester or recorded design. Main `1b586a70` contains the implementation described above.
This docs-only update neither removes nor disables its endpoints, UI or relay behavior; shipped-scope alignment
is [change #472](https://github.com/30Sativa/smart-campus-tour/issues/472).
It is not accepted V1 behavior and is not evidence of a successful device/relay/physical test.
