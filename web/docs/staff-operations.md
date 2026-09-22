# Staff console (`/staff/*`) — remote tours

Aligned on 2026-09-21 with **"CampusTour DT-AMR — Đặc tả phạm vi, nghiệp vụ và
tích hợp tham quan từ xa" (19/09/2026)**. That document is the source of truth;
this file only maps it onto the web area. Section numbers (§) refer to it.

## What Staff does (and does not)

| Staff does (§2) | Not Staff's (Admin or nobody in V1) |
|---|---|
| Check the device side and **Start** a `Ready` session | Create/edit sessions, approve/reject groups, send invitations, **Chốt buổi** (→ Ready), re-open, cancel before start — Admin |
| **Hold at a POI**, **Next**, **End Early** (→ `Cancelled`) | Choosing a robot or swapping it mid-session (§6.1, S-02) |
| Recover from `NeedsAssistance`: **retry leg**, **re-run POI**, **retry FRONT**, **confirm completion** (§12.2) | Pausing between POIs, "resume" of an old timer (§4.2, §4.5) |
| Read the groups and rosters of the sessions they run | Group check-in (students watch remotely), picking a narration language (one language system-wide, §1) |
| Confirm the robot is ready after End Early (§5.4) | Incident-management workflow (§5.6 — the reason lives on the Tour and in its log) |

## State model shown on screen

```
TourState          Scheduled → Ready → Running → Completed | Cancelled
OperationalStatus  Normal | NeedsAssistance (+ reason)   — only while Running
Hold               flag at a POI; stops the automatic Next — not a state
Step               PreparingStart · Navigating · PreparingView · Observing ·
                   HeldAtPoi · ReturningFront · ReturningToEnd · Finished
```

An Admin-only account can open `/staff/*` but every run action is locked with
the reason "Cần vai trò Nhân viên vận hành (Staff)" (scope §2.1 "Admin cần thêm
role Staff"); the mock server also refuses such calls with 403.

Every button's availability comes from the server (`allowedActions`, each with a
reason). A disabled button always prints its reason. The screen never decides.

## Screens

| Route | Screen | Scope |
|---|---|---|
| `/staff` | Tổng quan vận hành — counts, the running session (state, step, POI, data age, pending command), "Cần xử lý", today's sessions, the robot | §11.1 Dashboard |
| `/staff/tours` | Buổi hôm nay — sessions with groups and one next step each | §11 "xem các đoàn đăng ký" |
| `/staff/schedule` | Lịch buổi — any day | S-01 |
| `/staff/tours/:id` | Chi tiết & nhật ký — info, groups & rosters, route progress, full log | §11.1 "Chi tiết/log phiên", §12.7 |
| `/staff/tours/:id/start` | Kiểm tra trước khi bắt đầu — server device checks, 3 on-site confirmations, preview, Start | §5.3 |
| `/staff/live[/:id]` | Điều hành trực tiếp — Operational Twin, trạng thái phiên, điều khiển & phục hồi, lộ trình và nhật ký. Telemetry chi tiết nằm ở `/staff/robot`; preview nằm trong bước kiểm tra trước khi bắt đầu. | §4.2, §11, §12 |
| `/staff/robot` | Robot & thiết bị — connection, localization, head, pose age, source label, "confirm ready" after End Early | §8.4, §11.4, §5.4 |
| `/staff/history` | Lịch sử phiên | S-05 |
| `/staff/digital-twin` | Simulator preview (no sidebar entry) | — |

Twin rules applied (§11.2–11.6): POIs shown by order with the end point, **no
straight lines between POIs**; the camera head turns separately from the body;
a stale pose is greyed and labelled, never animated forward; Gazebo/Emulator
robots carry their label and never serve a session.

## Code layout

```
src/api/contracts/staff.ts            StaffApi (types + unwired HTTP implementation)
src/api/contracts/staff-realtime.ts   StaffRealtime (FleetUpdated, TourUpdated+revision, AssistanceRequired)
src/mocks/staff-sim.ts                mock server: the §4.4 flow, §4.5 hold/next, §12 faults & recovery
src/mocks/staff-mock.ts               StaffApi over the simulation
src/mocks/staff-realtime-mock.ts      push channel over the simulation (1 Hz while subscribed)
src/features/staff/staff-hooks.ts     the one binding of both; revision guard on useTour (§8.6)
src/features/staff/attention.ts       next action per state, counts, "Cần xử lý", route progress
src/features/staff/status.ts          labels & tones (Vietnamese), steps, start checks
src/features/staff/reason.ts          assistance reasons and what to check for each
src/features/staff/components/        OperationControls, RunStatus, TourTimeline, TourParts,
                                      RobotParts, OperationalTwin, LiveCameraPreview, ConfirmationDialog
```

## Demo script (mock data, `staff/staff`)

- T-01 is running on `robot_01` (3 POI + return leg). About 8 s after opening the
  console Nav2 "fails" → `NeedsAssistance / Lỗi điều hướng` → **Thử lại chặng**.
- At the next POI try **Giữ tại POI**, then **Đi tiếp**.
- Later on a leg the shared stream drops → the leg finishes, robot holds at the
  POI → once the stream is back, **Chạy lại POI**.
- Around 110 s a FRONT command fails → **Thử lại FRONT**.
- T-02 is Ready but the robot is busy: Start stays disabled with the reason.
  End T-01 early, confirm the robot on `/staff/robot`, then start T-02.
- T-03 is Scheduled (1 group waiting for Admin approval). Approve it and Chốt Tour
  as `admin/admin` (`/admin/tours/tour-03`), or Chốt T-05, and Staff can start it.

## Switching to the real backend

Agree the endpoints and hub methods with `backend/` and record them in
`docs/architecture.md`; then swap `mockStaffApi` / `mockStaffRealtime` for
`staffApi` / `createStaffRealtimeHub()` in `staff-hooks.ts` and delete
`src/mocks/staff-*`.
