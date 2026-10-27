# ADR-0022: Historical group decision — Staff owns Tour preparation

Original date: 2026-10-27. Original status: accepted by the group (capstone
register v1.6–v1.9, §3.2.c); advisor review pending. Historical record only.
Its SRS-v0.1 framing and implementation plan are superseded by ADR-0020, which
is the current owner-authorized target baseline. This renumbering preserves the
original group decision and does not upgrade its approval status.

## Context

ADR-0014/0017/0018 gave POI content, Route CRUD and Tour CRUD/cancellation to
Admin, and the web placed them, with registration review, under `/admin/*`.
The capstone register v1.6 and later assign content, registration, Route
composition and scheduling to Staff, and limit Admin to accounts, role
permissions, configuration and administrative audit (plus the pending End
Early exception, F-14).

## Historical decision

- Tour preparation belongs to the `Staff` role. In the web it lives at
  `/staff/manage/*`: overview, Tours (list/create/detail/edit), registrations
  (pending/all), Routes and POIs. The page components and
  `features/administration/*` modules move unchanged.
- `/admin/*` keeps Accounts and Roles only. Old `/admin/{tours,registrations,
  routes,pois}/...` URLs redirect to `/staff/manage/...`; `/admin/history`
  redirects to `/staff/history`.
- Admin may still open `/staff/*` read-only (ADR-0013 rule unchanged).
- Backend namespace is independent: the web keeps calling `/api/admin/*` for
  these endpoints until the backend owner changes authorization to `Staff`
  (and, optionally, the path). Until then a Staff account receives 403 on
  these pages. The web and backend changes should ship together.

## Consequences

- Backend: change `[Authorize(Roles = Admin)]` on `AdminToursController`,
  `AdminRoutesController`, `AdminPoisController`, `AdminRegistrationsController`
  and Admin support on `InvitationsController` to `Staff`.
- Technical Staff (map versions, YAML import, technical confirmation) is a
  separate later change; POI geometry editing stays where it is until then.
