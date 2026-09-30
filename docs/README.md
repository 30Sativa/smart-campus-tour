# Documentation Guide

Use this page to find the source for each kind of information. Requirement
status matters: a target behavior is not evidence that code or hardware supports
it.

## 1. Business / Requirements

- [Detailed CampusTour scope](requirements/campus-tour-scope.md) — current
  business baseline after Review 1, including which decisions the group has
  made, which evaluation items remain optional, and what remains to survey.
  Follow the status written beside each item; it is not an implementation
  report or proof of advisor approval.
- [Scope summary](requirements/campus-tour-scope-summary.md) — short version for
  group/advisor discussion. It does not override the detailed scope.
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
