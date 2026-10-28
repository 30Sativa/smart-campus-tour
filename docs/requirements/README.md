# Business requirements

The current backend target is **Report 3 SRS v0.2 aligned to Phiếu v1.9**,
adopted by owner instruction on 2026-10-27 through
[ADR-0020](../decisions/0020-srs-v02-business-baseline-and-technical-staff.md).
Adoption does not imply advisor approval or completed implementation.

## Reading order and authority

1. [Current detailed scope](campus-tour-scope.md) summarizes the live SRS target.
2. [Backend gap register and source ledger](srs-v02-backend-gap-register.md)
   records exact SRS IDs, observed code/schema, dependencies and acceptance.
3. [Scope summary](campus-tour-scope-summary.md) and
   [UI flow](campus-tour-ui-flow.md) project that target; they cannot override it.
4. `docs/architecture.md` and repo ADRs define public technical contracts,
   including current endpoints and implementation status.
5. Code/SQL describe implementation, not the target. Report 4 is supporting
   design; diagrams pending redraw do not negate SRS requirements.

Read the stated status: **target** is owner-authorized future behavior;
**current** is observed implementation; **pending** requires the stated
decision/evidence and must not be implemented automatically. AC references are
acceptance targets, not Passed results or invented Report 5 test-case IDs.

## History

The previous scope, summary and UI-flow wording remains preserved unchanged in
Git at baseline `e70fb52`:
[scope](https://github.com/30Sativa/smart-campus-tour/blob/e70fb52/docs/requirements/campus-tour-scope.md),
[summary](https://github.com/30Sativa/smart-campus-tour/blob/e70fb52/docs/requirements/campus-tour-scope-summary.md),
[flow](https://github.com/30Sativa/smart-campus-tour/blob/e70fb52/docs/requirements/campus-tour-ui-flow.md).
It is historical Review 1 material, not a second active target. Original ADR
content/dates are retained with scoped succession notices. Old P0/P1/R1 IDs
belong to that historical baseline; current work uses SRS UC/FR/BR/NFR/AC IDs.

HTTPS Fleet Sync ADR-0019 remains effective and telemetry-only. Business
ownership succession does not authorize robot commands or alter that contract.
