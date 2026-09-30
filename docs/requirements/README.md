# Business Requirements

These documents describe the desired CampusTour behavior. Read their status
labels; group-confirmed decisions, items for later advisor review, optional
work, and out-of-scope work are not interchangeable.

## Canonical documents

- [campus-tour-scope.md](campus-tour-scope.md) — detailed business baseline.
  It may contain confirmed group decisions, pending items, and Future/out-of-
  scope items. The status written for each item controls; the document does not
  claim every item is advisor-approved or implemented.
- [campus-tour-scope-summary.md](campus-tour-scope-summary.md) — concise
  discussion copy. It cannot override the detailed scope.
- [campus-tour-ui-flow.md](campus-tour-ui-flow.md) — screens and user flow
  derived from the detailed scope. If they differ on a business rule, the
  detailed scope wins and this flow needs synchronization.

## How to resolve sources

- Source code and SQL schema show **current implementation and persistence**;
  they are not automatically the target business requirement.
- `docs/architecture.md` and `docs/decisions/` record cross-system technical
  contracts and accepted decisions. A business change that alters a public
  technical contract must be reconciled there before implementation.
- ADR-0009 records the Review 1 business decisions selected by the group.
  ADR-0010 replaces its secret-link entry with a Tour page link and personal
  access code, exchanged for a browser session after validation.
  The advisor will review them at Review 2; do not describe that as prior
  approval. The live-versus-video experience evaluation remains optional and
  pending confirmation as described in the detailed scope.
- When implementation, schema, scope, or technical contracts conflict, report
  the exact mismatch. Do not silently claim a target feature already exists or
  implement a proposal that the scope marks pending.
