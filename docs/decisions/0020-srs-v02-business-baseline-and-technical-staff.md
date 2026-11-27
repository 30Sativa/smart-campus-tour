# ADR-0020: SRS v0.2 business target and Technical Staff account foundation

Date: 2026-10-27. Status: **owner-authorized target baseline and this limited
account implementation**. This does not record advisor approval, a physical
test pass, or implementation of the remaining target.
Source: Report 3 SRS v0.2 aligned to Phiếu v1.9, read live on 2026-10-27.
The source ledger and implementation gaps are in
[the backend gap register](../requirements/srs-v02-backend-gap-register.md).

## Context

The owner explicitly requests adoption of the new SRS for backend work. Repo
Review 1 rules assign business preparation/review to Admin, allow every Staff
account to operate every Tour, use whole-registration approval, and allow
post-End-Early fallback. These are no longer the target. Current SQL and APIs
remain implementation evidence until deliberately migrated. Report 4 supports
design; pending diagrams cannot override the SRS.

This ADR supersedes only the business portions listed below. Original ADR
decisions, dates and approval records remain historical. It does not silently
change existing public API authorization outside the account slice.

## Scoped succession

| Existing source | Superseded target portion | Successor target | Retained |
|---|---|---|---|
| ADR-0009 | Admin business preparation/review/statistics; direct email correction; fallback after End Early | Staff business ownership, row review/email requests, terminal media revocation | One physical AMR, tested branches, published-time Start, evidence-based audit |
| ADR-0010 | Admin access support, Staff excluded, direct email overwrite, post-End-Early video | Staff support for managed tours; Representative own rows; request/review email change; all terminal media blocked | Ordinary URL + code, one session, resend distinct from reissue/revoke |
| ADR-0011 | Retention duration left operationally unspecified | SRS BR-20/NFR-PRIV-01: delete 30 days after tour; consent before real data | Data minimization, no admissions CRM/contact, no attendance inference |
| ADR-0012 | All Staff operate all Tours; no assignment/revision model; whole-list invalidation | Assigned Staff Operator; exact version-bound configuration; unchanged-row credentials survive edits | SQL v1.1 is current persistence, Tour-first locks, append-only audit, fixed RouteStop dwell, no per-Tour dwell editor |
| ADR-0013 | Three supported account roles | Add TECHNICAL_STAFF / TechnicalStaff | Exactly one supported role/account; invalid assignments fail closed; no DDL single-role constraint |
| ADR-0014 | Admin owns target POI/content workflow | Staff proposes/content; Technical Staff versions/imports/verifies | Existing Admin API remains current implementation; concurrency/history protections retained |
| ADR-0015 | Whole-registration approval dependency, old support ownership/idle policy as target | Row eligibility independent of other pending rows; Staff review; 2-minute same-device reconnect | Code protection, correlated email attempts, resend semantics, commit before delivery, current implementation evidence |
| ADR-0016 | Runtime provider/general-answer generation for Viewer | Approved answer bank only; provider drafting requires Staff approval | Backend boundary, no roster data to AI, no AI robot commands |
| ADR-0017 | Admin route authoring and mutable catalog as complete target | Staff route revisions; Technical exact-version confirmation | Current Admin CRUD contract, freezing/history, lock/audit techniques |
| ADR-0018 | Admin scheduling as target; schema lacks explicit Operator assignment | Staff scheduling and explicit Operator assignment; reservation/READY guards | Current Admin endpoints, creator attribution, durable retries, pre-start cancel history and transactions |
| ADR-0019 | None | No business override changes transport | HTTPS Fleet Sync telemetry-only, per-robot credentials, empty commands array, Staff browser projection |

Repo ADR-0017/0018/0019 are distinct from SDD ADRs of the same numbers
(hosting / historical general answers / media relay). Never conflate them.

## Account slice implemented now

| Persisted UserRoles.Role | Application / JSON role / JWT role claim | UI label |
|---|---|---|
| ADMIN | Admin | Admin |
| STAFF | Staff | Staff |
| TECHNICAL_STAFF | TechnicalStaff | Technical Staff |
| SCHOOL_REPRESENTATIVE | Representative | Representative |

Admin can create/list/deactivate/reactivate TechnicalStaff through the existing
account endpoints. Creation accepts one application role string; no new role
reassignment endpoint is introduced. Admin bootstrap remains separate.
Login and refresh resolve exactly one supported persisted role and issue one
canonical role claim. Missing, mixed or unknown assignments are rejected.
Deactivation/refresh revocation and existing token-expiry limitations remain
unchanged. TechnicalStaff inherits none of Admin, Staff or Representative;
existing role policies are not broadened.

Viewer uses invitation/session, not a user account. Tour Operator is an
explicitly assigned Staff responsibility, not another role. Safety attendant
has no separate account/workspace. No Technical map/POI workspace or
confirmation API is implemented by adding this account role.

## Database First assessment

UserRoles.Role is VARCHAR(32), with composite PK (UserId, Role), FK to Users,
and no role-value CHECK constraint. TECHNICAL_STAFF fits the existing column.
Generated EF maps the same string. No schema, migration, shared-DB command,
or re-scaffold is required for this slice. Keep the SQL snapshot byte-identical:
deployment compatibility hashes cover comments too. Its old role-list/operation
comments are historical; this ADR defines the new target and role contract.
Application single-role enforcement remains mandatory.
Later row approvals, assignments and map revisions require their own schema
design/ADR and reviewed SQL process before generated code changes.

## Pending boundaries

Do not implement F-14 until advisor review. Preserve both conflicting branch
cutoffs (before Tour departure vs before leaving branch point) pending decision.
Project YAML schema and frame/unit conversion require template-owner validation.
M2 command transport is selected by ADR-0042 (accepted 2026-11-03) and is
implemented from M2.2; dispatch stays off until M2.3 safety evidence. Telemetry
sync must continue returning no commands. Invalid-code default threshold/cooldown, voice provider
terms, research delivery/freshness thresholds and physical safety evidence
also remain explicit open items. This ADR does not close them.

## Consequences and delivery

The staged backend register specifies dependencies and acceptance criteria.
Only the account role foundation ships now; other old endpoints retain current
behavior and are listed as gaps. Frontend must add the exact TechnicalStaff
value to types, account forms and guards; no frontend file is changed here.
TechnicalStaff login success is not evidence of a Technical workspace or of
AC-06/full AC-08 acceptance.

## Update 2026-11-28

### Context

The owner requests documentation alignment to the live Phiếu v1.12 and revised Report 3 read on 2026-11-28,
while preserving the 27/10/2026 account/adoption decision. Report 4 §1.3 Table 3 reuses this number for another subject.

### Decision

Phiếu v1.12 supplies current business ownership and scope: Staff prepares routes/Tours/content, Technical Staff
manages robots/maps and technical checks, Admin manages accounts/roles/configuration/audit and has no running-Tour
control. Viewer answers are approved-bank/fixed replies; Gemini assists Staff drafts, and narration uses four-eyes
approval. Viewer voting (ADR-0065) replaces Representative branch requests; the cutoff question is closed.
ADR-0073 defines backup Staff End Early, and ADR-0066 defines map-specific readiness and assignment behavior.

### Status / Notes

This update changes neither the original decision date/decider nor its account-role contract.
**Repository ADR-0020 exists and is not the modular-backend ADR.** Correct Report 4's technical citation to
new ADR-0074; ADR-0016 retains the Q&A policy/boundary and this file is not renumbered.
Main `1b586a70` is implementation evidence, not proof that every adopted business rule is satisfied.
The Q&A policy/queue gap is [#469](https://github.com/30Sativa/smart-campus-tour/issues/469);
missing-presence evidence is [#470](https://github.com/30Sativa/smart-campus-tour/issues/470);
legacy readiness ordering is [#471](https://github.com/30Sativa/smart-campus-tour/issues/471).
ADR-0070/0071/0072 are Proposed – out of V1 scope per this task; their implemented code is recorded separately
in [#472](https://github.com/30Sativa/smart-campus-tour/issues/472). F-14 grants no Admin runtime permission.

### Rejected alternatives

- Keeping Admin business ownership or an Admin End Early override: violates the adopted role boundary.
- Treating a table or a Report 4 diagram as proof of implementation: hides observable API/runtime differences.

### Consequences

The shared business source resolves competing rules, but role separation adds authoring/verification handoffs.
Keeping the original records and explicit gaps costs reconciliation work; it avoids inventing approvals or test results.
