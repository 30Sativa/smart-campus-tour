# Business flow notes

Short rules that cross several screens. Scope and status stay in `docs/requirements/`; API detail stays in `docs/architecture.md`.

## Removing a Tour that has not started

Cancelling is the only way. There is no delete and no archived state.

- Staff cancels a SCHEDULED or READY Tour before Start and must give a reason.
- SUBMITTED registrations become cancelled. APPROVED registrations keep their state as history.
- Invitations are revoked, sessions close and the robot reservation is released, all in one transaction.
- After that transaction commits, each representative of a registration that was SUBMITTED or APPROVED gets one email with the Tour name, the Vietnam time, the reason and a contact line. It carries no link or code.
- Email runs after commit, so a failed email never undoes the cancel. The Admin audit log shows `TOUR_CANCEL_NOTICE_SENT` or `TOUR_CANCEL_NOTICE_FAILED`. A failed or interrupted notice is not retried automatically, so Staff contacts that group directly.
- Retrying the same cancel request sends nothing new.
- Representatives keep seeing the Tour as "Đã hủy" with the reason, and cannot register or edit.

## Finding past Tours

The Staff Tour list has three tabs: "Sắp diễn ra" (SCHEDULED or READY, start in the future, the default), "Đang chạy" (RUNNING) and "Đã kết thúc / Đã hủy" (COMPLETED, ENDED or CANCELLED).

A SCHEDULED Tour whose start has passed is in none of the tabs, because nothing moves it on until Start exists. The "Trạng thái" filter beside the tabs still lists it.

## Stopping and reopening a versioned Route

Decision: ADR-0037.

- "Ngừng sử dụng" stops new Tours on the route. Create and the slots picker refuse it with `ROUTE_UNAVAILABLE`, and "Tuyến đã kiểm chứng" hides it.
- It is always allowed. It cancels no Tour and changes no revision, test run or PASS. Tours already scheduled stay on the route and readable; the confirmation lists them with links.
- "Mở lại" only lifts the stop. Creating a Tour still needs an effective PASS.
- Revisions and history stay viewable while a route is stopped.
- Legacy Routes are unchanged.
