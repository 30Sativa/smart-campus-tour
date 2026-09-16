# ADR-0004: Staff Operations Data Model and Hub

## Context
Spec TOUR_OPERATOR/CAMPUS_STAFF requires assignment history, mission lifecycle, alerts, audit trail and realtime transport. Existing schema only has Booking/TourSession/AMRUnit with no temporal trace or operational state, and the API had no staff endpoints or SignalR hub. `docs/architecture.md` left the backend->browser realtime hop on SignalR without a concrete hub.

## Decision
- Add five additive tables: `Missions`, `AMRAssignments`, `OperationalAlerts`, `AuditLogs`, `TourTimelineEvents`. No existing table is altered except `TourSession.Status` enum gaining `Paused`; the only destructive choice is a filtered unique index on `AMRAssignments(TourSessionId, Status)` where `Status='Active'` to enforce one active assignment per session at the DB level.
- Introduce `MissionState` (Idle/Navigating/Paused/RecallRequested/Cancelled/EmergencyStopped/Failed/Completed), `AssignmentStatus`, `AlertType/Severity`, `TimelineEventType` as string-converted enums, matching the repo's `HasConversion<string>()` convention.
- Expose the new surface under `Api -> Application(IStaffOperationsService) -> Infrastructure(StaffOperationsService)` per `backend/AGENTS.md` layering, plus a single `StaffController` at `/api/staff/*` guarded by policies `StaffOnly / CanAcknowledgeAlert / CanControlMission / CanEmergencyStop` (roles `TourOperator/CampusStaff/Admin`, claim type `role` fixed to `RoleClaimType="role"`).
- Add `Hubs/StaffOperationsHub` at `/hubs/staff-operations` requiring `StaffOnly`; access_token via query string for SignalR negotiation. Digital Twin remains read-only for staff — enforced by not exposing any DT scenario endpoints on the staff controller.
- Keep refresh-token and auth behaviour unchanged; only normalize JWT `role` claim casing.

## Consequences
- Positive: complete auditability (actor/role/action/target/before/after/result/reason/correlation), deterministic staff authorization, DB-level prevention of double assignment, hub ready for future telemetry fan-out.
- Negative: EF snapshot must be hand-maintained until `dotnet ef` is run locally (no dotnet in this VM); filtered unique index is SQL Server-specific.
- Neutral: migration `20260916090000_AddStaffOperations` is purely additive — safe to apply on an existing database without data loss.
