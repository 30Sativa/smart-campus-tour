# Web Documentation

Web-local guides describe this deploy unit's screens, implementation, and
historical UI work. Cross-system business rules live in
[`docs/requirements/`](../../docs/requirements/), with the detailed scope as
the business authority.

## Current local references

- [Representative registration](representative-registration.md) — real submission slice,
  Excel contract, deferred invitation boundary and isolated end-to-end setup.

- [POI map picker](poi-map-picker.md) — ROS raster geometry, Admin workflow,
  map-package release and verification.

- [Admin Tour screens](admin-tours.md) — implementation-facing Admin screen
  map. Business rules that predate Review 1 may be historical; follow the
  current detailed scope and UI flow.
- [Staff operations screens](staff-operations.md) — implementation-facing
  Staff/Twin map. Review current scope before treating old UI behavior as a
  target requirement.
- [Campus model asset](../public/models/campus/README.md) — ownership and use
  of the current visitor campus model.

## Historical or legacy notes

- [Admin Dashboard SRS analysis](admin-dashboard-srs-analysis.md) — analysis of
  the supplied SRS v0.1 design source; historical design reference, not the
  current system-wide business baseline.
- [Frontend structure cleanup plan](frontend-structure-cleanup-plan.md) — dated
  cleanup snapshot. Use `web/AGENTS.md` and the current source tree for present
  structure.
- [Visitor redesign](visitor-redesign.md) — legacy `/visit/*` visitor booking
  flow. It does not define the Review 1 Student remote-Tour invitation flow.

All web screen guides describe UI structure or current code evidence; none can
override the cross-system requirements or prove backend integration.

- [Admin registration review](admin-registration-review.md) — live SQL review and the separate demo boundary.
