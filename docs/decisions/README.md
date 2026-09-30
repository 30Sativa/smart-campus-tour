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

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-lidar-primary-astra-supplementary.md) | LiDAR is the navigation backbone; the Astra Pro is supplementary | accepted |
| [0002](0002-manual-stlink-flash-no-can-bootloader.md) | STM32 firmware is flashed manually over ST-Link | accepted |
| [0003](0003-deploy-robot-via-docker-image.md) | The robot runs a prebuilt Docker image, not a build on the miniPC | accepted |
| [0004](0004-external-fleet-emulator.md) | Use an external Fleet Emulator for fleet-scale validation | accepted |
| [0005](0005-backend-authoritative-poi-per-leg-orchestration.md) | Backend owns authoritative POI navigation targets and per-leg tour orchestration | accepted |
| [0006](0006-demo-first-tour-schema.md) | Use the v1.0 demo-first SQL Server schema as the Database First persistence source | superseded for the current schema by ADR-0012 |
| [0007](0007-smac2d-rpp-no-autonomous-reverse.md) | SmacPlanner2D + Regulated Pure Pursuit, with autonomous reverse disabled | accepted |
| [0008](0008-production-fleet-transport.md) | SignalR fleet transport, separate Hubs, and navigation MVP semantics | accepted; Python compatibility gate pending |
| [0009](0009-review-1-tour-business-scope.md) | Review 1: shared viewing rows, invitations, POI content, branches, Start time, fallback and audit | accepted by team; implementation pending; GVHD review at Review 2 |
| [0010](0010-personal-access-code-entry.md) | Email a Tour page link and personal access code; enter code to create a browser session; resend versus revoke/reissue | accepted by team; supersedes ADR-0009 secret-link entry; implementation pending |
| [0011](0011-student-data-use-for-tour.md) | Use student data only for Tour registration, invitations, and operational statistics; no post-Tour admissions contact | accepted by team; implementation pending |
| [0012](0012-v1-1-schema-and-operation-scope.md) | v1.1 SQL snapshot, fixed seeded dwell, all Staff operate all Tours, stop references and append-only audit | accepted by team; applied/scaffolded locally; use cases pending |
| [0013](0013-single-application-role-per-account.md) | Auth/Web V1 supports exactly one supported application role per account | accepted by team; GVHD review at Review 2 |

<!-- TODO(Duy): những decision sắp tới đáng viết ADR:
     - chọn database cho backend
     - chọn model AI cho assistant dưới ràng buộc i3-7100T / 8GB / không GPU
     - monorepo vs multi-repo (nếu muốn ghi lại lý do gộp)
-->
