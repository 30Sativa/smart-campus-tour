# AGENTS.md

Repo-wide instructions for coding agents. Read this first, then read the
`AGENTS.md` inside the folder you are actually changing.

---

## 1. Project Overview

**CampusTour DT-AMR** — a remote campus-tour system: a School Representative
registers a group and submits invitation rows; a row may invite one student to
their own device or represent one shared projector room. A shared-room row does
not list the students merely watching that screen. An autonomous mobile robot
(AMR) guides the tour while invited viewers join through a browser. They receive
a livestream, 2D robot position, approved pre-generated narration and private AI
Q&A when they have an individual invitation. Campus staff schedule and monitor
tours through the Digital Twin.

Repo này chứa toàn bộ hệ thống CampusTour DT-AMR: robot, digital twin, backend, ai-assistant và web. Không có phần nào của hệ thống tách sang repo khác.

---

## 2. Repository Layout

This is a monorepo. Each top-level folder is one **deploy unit** with its own
build, its own verification, and its own `AGENTS.md`.

| Folder | What it is | Deploys to | Read before editing |
|---|---|---|---|
| `robot/` | ROS 2 Humble workspace + STM32 motor firmware | robot miniPC (native Ubuntu 22.04; Docker for CI/sim/debug) | `robot/AGENTS.md` |
| `digital-twin/` | Fleet Emulator, load experiments and synchronization research tooling (WP4) | simulation workstation/server | `digital-twin/AGENTS.md` |
| `backend/` | Group registration, scheduling & dispatch API | AWS EC2 | `backend/AGENTS.md` |
| `ai-assistant/` | Single-project-language STT, dialogue/LLM and TTS service (WP4) | server/cloud, not the robot miniPC | `ai-assistant/AGENTS.md` |
| `web/` | Public site, Representative, remote Student Tour, Staff Operations and Admin (WP4) | Vercel | `web/AGENTS.md` |
| `docs/` | System-level architecture and decisions | — | `docs/architecture.md` |
| `scripts/` | Cross-folder entry points | — | — |

Rules that follow from this layout:

- **Do not move code across the top-level boundary** to "share" it. If two
  folders need the same thing, define a contract in `docs/` first.
- **Do not add a root-level build tool** (workspace manager, task runner,
  monorepo framework) unless a task explicitly asks for one.
- **Every path written in a doc, a comment, or a commit message is relative to
  the repo root**, e.g. `robot/ros2_ws/src/robot_control/`.

## Documentation authority

Start at [`docs/README.md`](docs/README.md) for the document map and reading
order. `docs/requirements/` describes target business behavior, with the status
of each decision stated in the document; the detailed scope outranks its short
summary, and the UI flow projects that scope onto screens. Source code and SQL
describe the current implementation and schema, not automatically the target.
`docs/architecture.md` and `docs/decisions/` describe cross-system technical
boundaries and accepted decisions.

The Review 1 group baseline is recorded in
[`docs/decisions/0009-review-1-tour-business-scope.md`](docs/decisions/0009-review-1-tour-business-scope.md).
The group expects the advisor to review it at Review 2; this does not mean the
advisor has already approved it. Do not implement items explicitly marked
PENDING or requiring approval. If business scope, current implementation,
schema, and a technical contract conflict, report the conflict and identify
which document/status applies; do not silently treat a target as implemented
or change a public contract to make the documents agree.

---

## 3. Working on a Task

Before changing code:

1. Identify which top-level folder the task belongs to. Read that folder's
   `AGENTS.md`.
2. Read the existing implementation before proposing a change.
3. Read `docs/README.md`, then the applicable business requirement in
   `docs/requirements/`, `docs/architecture.md` for cross-system behavior, and
   the folder's own README/docs for local behavior.
4. Inspect existing tests for the code you are about to touch.
5. Identify the **smallest** change that satisfies the task.

While changing code:

- Stay inside the folder the task belongs to. Touching a second top-level
  folder means the task has an integration component — say so explicitly
  instead of doing it silently.
- Do not refactor, rename, reformat, or upgrade anything the task did not ask
  for. Unrelated cleanup goes in a separate task.
- Prefer an existing utility, node, or endpoint over a new one.
- Do not add a dependency unless there is no reasonable alternative; say why.

After changing code:

1. Add or update tests for the behaviour you changed.
2. Run `scripts/verify` (see below).
3. Fix every failure. Do not weaken a check to make it pass.
4. Review the final diff yourself before reporting.

---

## 4. Verification

From the repo root:

```bash
scripts/verify            # every folder that has a verify script
scripts/verify robot      # one folder only
```

Exit code is the contract:

```
0     -> PASS
!= 0  -> FAIL
```

Never report a task as complete while `scripts/verify` is failing.

---

## 5. Definition of Done

This repo has **two** completion states. Use the right one.

### DONE (verified)

Everything the task changed is covered by automated checks. All of:

1. The requested behaviour is implemented.
2. Tests covering the change exist and pass.
3. `scripts/verify` exits 0.
4. No existing test was deleted or weakened without a stated reason.
5. The diff contains no unrelated changes.
6. You can state what changed and how it was verified.

### READY FOR HARDWARE TEST

Use this — **not** DONE — whenever the change affects behaviour that cannot be
proven by a script: robot navigation, TF frames, costmaps, motor/serial
protocol, firmware, or anything whose correctness is only visible in Gazebo,
RViz, or on the real robot.

Report it as:

```
READY FOR HARDWARE TEST

Changed:      <what>
Verified:     scripts/verify robot -> PASS (tier 1 + 2)
Not verified: <the behaviour a script cannot check>
Run this:     <exact launch command>
Expect:       <what a correct run looks like>
Watch for:    <the failure mode this change could introduce>
```

Never claim DONE for behaviour you were not able to execute.

---

## 6. Hard Constraints

- Do not commit build output: `build/`, `install/`, `log/`, `__pycache__/`,
  `node_modules/`, firmware `Debug/*.elf|bin|hex|map|list|o|d`.
- Do not commit secrets: DockerHub tokens, API keys, `.env` files, ST-Link or
  machine credentials.
- Do not edit `.github/workflows/` to skip, disable, or bypass a failing check.
- Do not remove a test to turn CI green. Fix the behaviour or explain why the
  test was wrong.
- Do not change a folder's public interface (API route, ROS topic/action name,
  message field) without recording it in `docs/architecture.md` — another
  work package depends on it.

### Git workflow

- Branches: `main` (production) and `develop` (integration/testing).
- Feature branches: `feature/{tên}/{fe|be}-{chức-năng}`, e.g.
  `feature/duy/be-booking`, `feature/an/fe-dashboard`.
- Flow: `feature/*` -> `develop` (merge freely once your own change works) ->
  test on `develop` like a sprint/scrum cycle -> when `develop` is stable,
  open a PR `develop` -> `main`.
- `main` is a **protected branch**: no direct pushes, no direct merges. Every
  merge into `main` must go through a pull request with at least one review
  approval. `develop` is not protected — merge into it directly once your own
  branch is working.
- An agent must never merge into `main` itself, disable branch protection, or
  push directly to `main`. Open a PR into `main` (or `develop`, if instructed)
  and stop — a human approves and merges.
