# Decision Records

One file per accepted architecture or product decision that someone will later
ask "why is it like this?" about. Requirements, review feedback, and unresolved
proposals belong in `docs/requirements/` or the relevant review artifact, not
in this index.

## Format

```
NNNN-short-slug.md

# ADR-NNNN: Title

## Context      what forced a choice
## Decision     what we chose (present tense, not "we will")
## Consequences positive / negative, honestly
```

## When to write one

Write an ADR when the decision:

- constrains how other people write code (a layering rule, a sensor hierarchy),
- would be expensive to reverse (database choice, deployment model),
- looks wrong at first glance and needs its reason recorded, or
- was argued about.

Do **not** write one for: renaming a function, fixing a bug, adding a button,
adding a test, bumping a patch version.

## Index

Business target succession is scoped by ADR-0020. Original decisions/dates below
are retained; their superseded business portions are historical, while current
API/SQL facts and retained technical decisions remain explicit in each notice.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-lidar-primary-astra-supplementary.md) | LiDAR is the navigation backbone; the Astra Pro is supplementary | accepted |
| [0002](0002-manual-stlink-flash-no-can-bootloader.md) | STM32 firmware is flashed manually over ST-Link | accepted |
| [0003](0003-deploy-robot-via-docker-image.md) | Historical Docker physical deployment (superseded by native runtime) | superseded for physical runtime |
| [0004](0004-external-fleet-emulator.md) | Use an external Fleet Emulator for fleet-scale validation | accepted |
| [0005](0005-backend-authoritative-poi-per-leg-orchestration.md) | Backend owns authoritative POI navigation targets and per-leg tour orchestration | accepted |
| [0006](0006-demo-first-tour-schema.md) | Use the v1.0 demo-first SQL Server schema as the Database First persistence source | superseded for the current schema by ADR-0012 |
| [0007](0007-smac2d-rpp-no-autonomous-reverse.md) | SmacPlanner2D + Regulated Pure Pursuit, with autonomous reverse disabled | accepted |
| [0008](0008-production-fleet-transport.md) | SignalR fleet transport, separate Hubs, and navigation MVP semantics | superseded for robot transport by ADR-0019; M2 semantics retained |
| [0009](0009-review-1-tour-business-scope.md) | Review 1: shared viewing rows, invitations, POI content, branches, Start time, fallback and audit | accepted by team; implementation pending; GVHD review at Review 2 |
| [0010](0010-personal-access-code-entry.md) | Email a Tour page link and personal access code; enter code to create a browser session; resend versus revoke/reissue | accepted by team; supersedes ADR-0009 secret-link entry; implementation pending |
| [0011](0011-student-data-use-for-tour.md) | Use student data only for Tour registration, invitations, and operational statistics; no post-Tour admissions contact | accepted by team; implementation pending |
| [0012](0012-v1-1-schema-and-operation-scope.md) | v1.1 SQL snapshot, fixed seeded dwell, all Staff operate all Tours, stop references and append-only audit | accepted by team; applied/scaffolded locally; use cases pending |
| [0013](0013-single-application-role-per-account.md) | Auth/Web V1 supports exactly one supported application role per account | accepted by team; GVHD review at Review 2 |
| [0014](0014-admin-poi-management.md) | Admin manages POI content and only edits geometry before route/history use | implementation scope authorized; group/GVHD review at Review 2 |
| [0015](0015-invitation-issuance-and-resend-email.md) | Secure invitation codes, Resend queue and minimal Student entry | implementation scope authorized; opt-in configuration required |
| [0016](0016-student-qa-assistant-stack.md) | Backend-mediated Student Q&A; Python/FastAPI assistant; Gemini via provider adapter; approved content pack | accepted by team; implementation pending |
| [0017](0017-admin-route-management.md) | Admin Route CRUD; frozen referenced itineraries; CRUD, bootstrap seed and technical import boundaries | owner-authorized implementation scope; supersedes seed-only Route/dwell portions of 0009/0012 |
| [0018](0018-admin-tour-management.md) | Backend SCHEDULED Tour CRUD, durable retries and pre-Start cancellation with access revocation | owner-authorized implementation scope; no runtime or frontend integration |
| [0019](0019-https-fleet-sync.md) | HTTPS Fleet Sync v1 telemetry with per-robot credentials and Staff operations projection | selected for M0/B1 implementation; group confirmation and physical readiness remain pending |

| [0020](0020-staff-owns-tour-preparation.md) | Staff owns Tour preparation (`/staff/manage/*`); Admin keeps accounts, roles and audit | accepted by group; advisor review pending; backend authorization change pending |

| [0020](0020-srs-v02-business-baseline-and-technical-staff.md) | SRS v0.2 target adoption, scoped business succession and TechnicalStaff account foundation | owner-authorized; limited account slice implemented; other gaps/pending decisions retained |
| [0021](0021-map-package-and-poi-verification.md) | ROS map package versions, manual deployment records and per-POI Technical Staff verification | owner-authorized backend slice implemented; physical acceptance, route tests and frontend remain pending |


<!-- TODO(Duy): những decision sắp tới đáng viết ADR:
     - chọn database cho backend
     - monorepo vs multi-repo (nếu muốn ghi lại lý do gộp)
-->
