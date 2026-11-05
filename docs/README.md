# Documentation Guide

Use this page to find the source for each kind of information. Requirement
status matters: a target behavior is not evidence that code or hardware supports
it.

## 1. Business / Requirements

The owner-authorized current target is Report 3 SRS v0.2 aligned to Phiếu v1.9,
read on 2026-10-27. [ADR-0020](decisions/0020-srs-v02-business-baseline-and-technical-staff.md)
records scoped succession; [the source/gap register](requirements/srs-v02-backend-gap-register.md)
links SRS requirements to code/schema, dependencies and acceptance.

- [Detailed CampusTour scope](requirements/campus-tour-scope.md) — current
  SRS v0.2 target, with explicit current/pending distinctions and preserved history.
  Follow the status written beside each item; it is not an implementation
  report or proof of advisor approval.
- [Scope summary](requirements/campus-tour-scope-summary.md) — short version for
  group/advisor discussion. It does not override the detailed scope.
- [Business flow notes](business-flow.md) — Tour cancellation, Tour history and
  Route deactivation rules that cross several screens.
- [CampusTour UI flow](requirements/campus-tour-ui-flow.md) — screen and user
  flow projection. The detailed scope is authoritative when business rules
  differ.
- [Requirements index](requirements/README.md) — authority, status, and how the
  current code/schema relates to target behavior.

## 2. System Architecture

[architecture.md](architecture.md) defines cross-system ownership, public
contracts, integration boundaries, deployment, and planned technical behavior.
It is not a business SRS. Link business rules to requirements instead of
copying them here.

## 3. Architecture and Product Decisions

ADR-0020 supersedes only the listed business parts of earlier ADRs. The
owner-authorized API cutover in [ADR-0027](decisions/0027-versioned-map-poi-and-route-api-cutover.md)
retires replaced Admin POI/Route/Tour/registration aliases and legacy authoring
operations while retaining only reads still used by the pre-execution Tour
slice. See `backend/docs/api-cutover.md` for the endpoint-by-endpoint inventory.
TechnicalStaff login does not by itself implement every Technical workspace.

The owner-authorized [Admin Route CRUD update](decisions/0017-admin-route-management.md)
replaces seed-only business Route/dwell preparation; earlier ADRs retain their
original text with explicit supersession notices. Usage:
`web/docs/route-management.md`.

The [Admin Tour backend slice](decisions/0018-admin-tour-management.md) adds
SCHEDULED creation/update and pre-Start cancellation without frontend/runtime
integration. API usage: `backend/docs/admin-tour-management.md`.

The [Fleet Sync v1 backend slice](decisions/0019-https-fleet-sync.md) records
HTTPS telemetry, per-robot credentials and the Staff operations projection.
Contract fixtures and a Python probe are in `docs/contracts/fleet-sync/v1/`.

The owner-authorized [versioned map/POI slice](decisions/0021-map-package-and-poi-verification.md)
adds backend APIs and additive v1.2 persistence for ROS map packages, manual
deployment evidence and per-POI Technical Staff verification. Its contract and
frontend handoff are in `backend/docs/map-poi-versioning.md`. Route revision and
manual whole-route test evidence follow the scoped succession in
[ADR-0023](decisions/0023-versioned-routes-and-manual-route-verification.md);
their API sequence is in `backend/docs/route-revisions.md`. This is human
evidence only, not physical acceptance or Tour readiness. Robot pose-capture
import is ADR-0038; project POI YAML templates, branch runtime and scheduling remain pending.
Command transport is selected by [ADR-0042](decisions/0042-m2-command-transport-and-start-readiness.md)
and is implemented from M2.2.

[Decision Records](decisions/README.md) indexes accepted ADRs and product
decisions. A decision may still have a separate implementation or compatibility
gate; check its status before treating it as realized.

## 4. Deploy-unit documentation

Local implementation details stay with the code they govern:

- Web: [README](../web/README.md), [agent guide](../web/AGENTS.md),
  [web docs index](../web/docs/README.md).
- Backend: [agent guide](../backend/AGENTS.md); schema and tests are under
  `backend/`.
- Robot: [README](../robot/README.md), [agent guide](../robot/AGENTS.md),
  [robot docs index](../robot/docs/README.md); firmware and ROS package guides
  remain next to their code.
- Digital Twin: [README](../digital-twin/README.md) and
  [agent guide](../digital-twin/AGENTS.md).
- AI assistant: [README](../ai-assistant/README.md) and
  [agent guide](../ai-assistant/AGENTS.md).
- Cross-folder verification: [scripts agent guide](../scripts/AGENTS.md).

`AGENTS.md` files govern their own folders and are not moved into this
directory. Historical design/review notes remain labeled as such in their
owning unit; they do not become requirements.

## 5. Reading order for a task

1. Read the root [AGENTS.md](../AGENTS.md), then the `AGENTS.md` in the folder
   being changed.
2. For business behavior, read
   [the detailed scope](requirements/campus-tour-scope.md).
3. For UI or user flow, also read
   [the UI flow](requirements/campus-tour-ui-flow.md).
4. For a cross-system or public contract, read
   [architecture.md](architecture.md) and the related decision record.
5. Then inspect the current code, SQL schema, and tests. If target and current
   state differ, preserve the distinction and report the implementation gap.

## 6. Dated technical reviews

- [SRS v0.2 and Technical Staff account verification, 2026-10-27](reviews/2026-10-27-srs-v02-technical-staff-backend.md)
  — limited account slice, full backend verify result, SQL/Docker skips and remaining gaps.

- [Backend/Frontend Technical Lead review, 2026-10-14](reviews/2026-10-14-backend-frontend-technical-review.md)
  — source findings, focused fixes, verification and remaining debt. This is a
  dated code review, not a replacement for requirements or public contracts.
