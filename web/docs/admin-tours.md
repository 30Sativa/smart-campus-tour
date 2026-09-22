# Admin console (`/admin/*`): Tour administration

Aligned on 2026-09-21 with **"CampusTour DT-AMR: Đặc tả phạm vi, nghiệp vụ và
tích hợp tham quan từ xa" (19/09/2026)**, §2, §3, §5.2, §5.5, §11.1. The scope is
the source of truth; this file maps it onto the web area.

## What Admin does (and does not)

| Admin does | Not Admin's |
|---|---|
| Create a Tour (name, time, description, prepared route) → **Scheduled** | Start / Hold / Next / End Early / recovery: Staff (`/staff/*`) |
| Edit it while Scheduled | Robot, camera or head control, choosing or swapping a robot |
| Review groups: **Approve**, or **Reject** with a reason | Route / POI / angle / narration editing (the technical team's config) |
| Send / re-send the participation e-mail (representative only) | Fleet, scenario editor, what-if, maintenance, analytics, marketing |
| **Chốt Tour** Scheduled → Ready, **Mở lại** Ready → Scheduled (before Start) | Student accounts, attendance, self-booking, capacity, schedule optimisation |
| **Hủy Tour** Scheduled/Ready → Cancelled, with a reason | Cancelling a Running Tour (that is Staff's End Early) |
| Read Running / Completed / Cancelled Tours | Feedback / rating: PENDING GVHD (Phụ lục A), not built |

READY means "content and groups locked". It never means "robot ready": the
robot, head and stream are checked by Staff at Start.

## Screens

| Route | Screen |
|---|---|
| `/admin` | Tổng quan quản trị: KPIs (today, pending review, Ready, still preparing), "Cần xử lý" with direct actions, upcoming Tours, pending registrations |
| `/admin/tours` | Quản lý Tour: search, state filter, date filter (today / this week / range) |
| `/admin/tours/new` | Tạo Tour mới: form + read-only route preview |
| `/admin/tours/:id` | Chi tiết Tour: tabs Tổng quan (info, registration summary, READY checklist) · Đăng ký · Tuyến · Hoạt động; Sửa / Chốt / Mở lại / Hủy by state |
| `/admin/tours/:id/edit` | Sửa Tour (Scheduled only; otherwise says why) |
| `/admin/registrations/pending` | Review queue (Submitted), drawer via `?review=<id>` |
| `/admin/registrations` | All registrations, state filter |
| `/admin/routes` | Danh mục tuyến (read-only) |
| `/admin/history` | Lịch sử Tour: startedAt, endedAt, endReason |
| `/admin/roles` | Role/area matrix (read-only reference, sidebar footer) |

## Rules the screens rely on (the server's)

- Every "may I" comes back from the server: `allowedActions` on Tours and
  registrations, `readyChecklist` (10 checks, each with its detail). A disabled
  action always shows its reason.
- Every change sends the object's `version`. A mismatch is `409 StaleData`:
  the registration drawer shows "Danh sách đã được cập nhật. Vui lòng tải lại dữ
  liệu trước khi duyệt." with "Tải lại"; Tour dialogs show "Dữ liệu đã thay đổi.
  Vui lòng tải lại." and reload.
- Tour creation carries an idempotency key, so a double submit creates one Tour.
- A failed e-mail is `502 EmailFailed`: the registration stays Approved, the UI
  shows "Không thể gửi email." and "Gửi lại". `InvitationSentAt` is the mail
  service's acceptance time, not a read receipt.

## Code layout

```
src/api/contracts/admin.ts              types + 4 unwired HTTP services (tour, registration, invitation, route)
src/mocks/admin-sim.ts                  mock server rules on the SAME world as staff-sim.ts
src/mocks/admin-mock.ts                 the 4 services over the sim; Admin role required
src/features/administration/admin-hooks.ts   the one binding (swap to HTTP here)
src/features/administration/            AdminShell, AdminUi, admin-nav, admin-status, admin-format,
                                        admin-attention, components/
src/routes/admin/                       the pages above
```

## Mock data (`admin/admin`)

| Tour | State | Scenario |
|---|---|---|
| T-03 | Scheduled | **A**: 2 approved + 1 waiting (THPT Bùi Thị Xuân replaced its roster after approval) + 1 rejected; cannot finalize. The first e-mail to THPT Trần Phú fails once (retry works). |
| T-05 | Scheduled | **B**: 2 approved, none waiting; can finalize. |
| T-02 | Ready | **C**: can re-open (approved groups stay approved). |
| T-01 | Running | **D**: read-only (Staff's demo run). |
| T-06 | Scheduled | No registrations yet. |
| T-07 | Scheduled | Route config incomplete (missing narration); approving THPT Chuyên Trần Đại Nghĩa first meets a concurrent roster change → reload. |
| T-00, T-04, history | Completed / Cancelled | Tour History. |

All names, e-mails (`@truong-mau.example`) and rosters are fabricated (scope §6.3).

## Switching to the real backend

Agree `/api/admin/*` with `backend/` (paths and the `AdminErrorBody` shape are in
`api/contracts/admin.ts`), swap the four `mock…Service` bindings in
`admin-hooks.ts`, then delete `src/mocks/admin-*`. The backend must enforce every
rule above, including role checks. The UI only hides and disables actions.
