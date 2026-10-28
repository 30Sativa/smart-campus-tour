# ADR-0025: Web routes for Staff Tour preparation

Date: 2026-10-27. Status: implemented in `web/` (PR #84); follows
[ADR-0020](0020-srs-v02-business-baseline-and-technical-staff.md), which owns
the business decision that Staff, not Admin, prepares Tours. This ADR records
only the frontend route layout and the backend follow-up it depends on.

## Decision

- Tour preparation screens live under the Staff area at `/staff/manage/*`:
  overview, Tours (list/create/detail/edit), registrations (pending/all),
  Routes and POIs. Page components and `features/administration/*` modules
  moved unchanged.
- `/admin/*` keeps Accounts and Roles only; `/admin` opens Accounts.
- Old `/admin/{tours,registrations,routes,pois}/...` URLs redirect to
  `/staff/manage/...` with id and query kept; `/admin/history` redirects to
  `/staff/history`. These redirects are migration scaffolding.
- Technical Staff has its own area at `/technical/*`, kept out of Staff and
  Admin guards (ADR-0020 account slice).

## Consequences

- The web keeps calling the current `/api/admin/*` endpoints. Until the backend
  migrates their authorization to Staff (ADR-0020 gap register, wave W1), a
  Staff account receives 403 on these screens.
- Frontend and backend namespaces stay independent; if the backend moves the
  endpoints to another path, only the web contract bindings change.
