# Robot architecture and handoff status

**Evidence snapshot: 2026-10-17, UTC+07.** This page is the entry point for
new contributors and AI agents. It records what is in source, what was tested,
and what is actually running. It does not grant permission to operate the
robot. Recheck the named Git refs and machine-local state before acting.

## Start here

1. Read the repository [AGENTS.md](../../AGENTS.md), then
   [robot/AGENTS.md](../AGENTS.md) for safety and robot-specific constraints.
2. Read [robot/README.md](../README.md) for the package map and operating
   model, then this page for the verified state snapshot.
3. For navigation, read [Nav2 Baseline V1](nav2-baseline-v1.md). For remote
   display and DDS transition, read [DDS isolation](dds-isolation.md) and the
   dated [R3 readiness report](r3-dds-readiness-2026-10-17.md).
4. Read the relevant package README, source and tests before changing code.
   `robot/docs/README.md` indexes the other robot guides.

Commands in a runbook are procedures, not authorization to run them. Confirm
the current operator request and the state of the named host before any
hardware operation. In particular, do not send goals, velocity commands, or
initial poses unless the task explicitly permits them.

## Status vocabulary

- **IMPLEMENTED** means code/configuration exists at the named source ref. It
  does not prove that it has been installed or exercised.
- **TESTED OFFLINE** means automated tests, simulation, or a network namespace
  test passed; it is not physical-robot evidence.
- **TESTED ON HARDWARE** names the specific behavior exercised on the real
  robot or laptop connected to it. It does not imply broader acceptance.
- **READY FOR HARDWARE TEST** means the review found a safe, bounded test path
  and its prerequisites. The test has not necessarily run.
- **DEPLOYED** means installed or running on the named machine at the snapshot
  time. Deployment alone is not a pass/fail judgment about behavior.

Record multiple labels when they describe different evidence levels. A source
change must never be described as deployed just because a matching branch
exists.

## Current architecture

The physical robot uses one native ROS 2 Humble runtime on Ubuntu 22.04 MiniPC.
The STM32G431 motor board owns real-time STEP/DIR stepping; the ROS host sends
wheel-speed commands over USB CDC and reads wheel/IMU state. RPLiDAR is the
localization and navigation sensor. The Astra Pro is supplementary for local
obstacles and person perception. The package map, TF layout and launch entry
points are in [robot/README.md](../README.md) and the package READMEs.

The current navigation configuration is **Nav2 Baseline V1**: LiDAR yaw
−0.2225 rad, the opt-in smooth parameter file, `LatchedGoalChecker`, and a
0.20 m/s FollowPath target. It is a development/test baseline, not a
production-ready navigation claim. Its defaults and limitations are recorded
in [nav2-baseline-v1.md](nav2-baseline-v1.md).

The remote R3 design keeps the robot's ROS graph on the robot and uses an SSH
tunnel to a loopback-only Foxglove bridge plus a guarded Initial Pose path.
The laptop runs RViz in its own local DDS domain. S1–S3 are the staged
Discovery Server / `ROS_LOCALHOST_ONLY` isolation transition; they are a
separate deployment change and remain unapplied in this snapshot.

## Status by workstream

| Workstream | Source and test status | Hardware / deployment status at this snapshot |
|---|---|---|
| Nav2 Baseline V1 | **IMPLEMENTED** on GitHub `main`; historical B2/B2c reports cover its locked configuration. | **TESTED ON HARDWARE** in limited B2/B2c runs, including one clean route. **DEPLOYED** through the active MiniPC V1 overlay. Not generalized to other routes, maps, speeds or crowd conditions. |
| R3 S0b viewer and bridge | R3 base implementation is in GitHub `main` through merged PR #59. The local R3 branch adds later viewer, adapter and runtime-safeguard commits. Focused R3 suite: **TESTED OFFLINE**, 162 passed on the later local branch snapshot. | **TESTED ON HARDWARE** for remote RViz map, LiDAR, TF and RobotModel, plus the stationary S0b review. **DEPLOYED** as a separate MiniPC debug overlay and laptop opt-in viewer. Do not infer real Wi-Fi roaming from namespace reconnect tests. |
| Laptop `amr-rviz` | The installed wrapper corresponds to R3 commit `483fcb8`; that wrapper is not present on GitHub `main` at this snapshot. | **DEPLOYED** on the current laptop. Bare `amr-rviz` still dispatches to the saved legacy direct-DDS script; `amr-rviz --r3` opts into SSH. The R3 process was running at the laptop snapshot. |
| Initial Pose accepted by AMCL | Guard and protocol are **IMPLEMENTED**; guard behavior has **TESTED OFFLINE** coverage. | **NOT TESTED ON HARDWARE** as a valid AMCL localization. The robot's exact location on `map2` is unknown. Defer this check until it is at a known mapped position; it is not a prerequisite for stationary S1–S3. |
| DDS isolation S1–S3 | Staging scripts/profile and checks are **IMPLEMENTED**. The later R3 branch has **TESTED OFFLINE** results, including mocked systemd/socket checks and network-namespace cases. | **READY FOR HARDWARE TEST** while the robot is stationary, subject to the maintenance, process-stop, sudo, backup and per-stage checks in the readiness report. **NOT DEPLOYED**: the original Discovery Server, `.env`, network and SSH configuration were unchanged. No real systemd stage switch was exercised. |
| Movement acceptance (A→B→A, S5 roaming) | Procedure is documented. | **NOT TESTED** in the current R3 stationary review. It requires a separate authorized movement session; it is not a gate before stationary DDS isolation. |

## Git, runtime and overlay provenance

These refs are distinct and must not be substituted for one another:

| Location | Snapshot | Meaning |
|---|---|---|
| GitHub `main` | `277b2f0` (2026-10-17; PR #59 merged) | Contains the initial R3 implementation. It does not contain the later local R3 hardening commits. |
| Local R3 worktree | `feature/claude/dds-isolation-r3` at `c4abcf3`, clean on the MiniPC | Contains `fc33c40`, `483fcb8` and `c4abcf3` after the PR #59 base. Those commits were not on GitHub `main` at the evidence snapshot. The docs PR that adds this page does not include those code commits. |
| MiniPC runtime checkout, `$HOME/smart-campus-tour` | `main` at `1cc5b33`; 2,283 Git status entries at 16:27 | This is an older, heavily dirty checkout, not the GitHub `main` snapshot above. Preserve it; do not reset, clean, merge, rebuild wholesale, or commit its existing changes as part of R3 work. |
| MiniPC Nav2 V1 checkout/overlay | `sct-nav-smooth` at `73b8630`; `$HOME/.cache/armtc/smoothws/install` resolves to this checkout | The overlay is the active Nav2 V1 source. The relevant V1 package/config files were checked against the earlier V1 source snapshot and remained unchanged. |
| MiniPC R3 debug overlay | `$HOME/.cache/armtc/r3_runtime_review_20261017/install` | A separate overlay was running bridge and guard processes on loopback ports 8765/8766. Its installed guard matched R3 `483fcb8`. The later `c4abcf3` delta changed the discovery-stage/runtime helper scripts and tests, not the installed bridge/guard package; use those scripts from the `c4abcf3` checkout. Source changes do not update an installed overlay automatically. |
| Laptop viewer | `~/.local/bin/amr-rviz` resolves to `~/.local/share/amr-rviz/r3/amr-rviz`; VERSION reports `483fcb8` | The wrapper dispatches bare `amr-rviz` to `~/.local/bin/amr-rviz.legacy`. `--r3` sources Humble and the robot-description workspace, then uses the SSH adapter in domain 42 with `ROS_LOCALHOST_ONLY=1` and no Discovery Server. |

### MiniPC DDS state

The read-only inventory at 16:27 +07 recorded domain 30, `rmw_fastrtps_cpp`,
`ROS_DISCOVERY_SERVER=127.0.0.1:11811`, and `ROS_LOCALHOST_ONLY=0`. The original
systemd Discovery Server unit had no isolation drop-in and still ran
`fastdds discovery --server-id 0`; its sockets and ROS nodes were visible on
non-loopback interfaces. `check-dds-isolation` reported **NOT ISOLATED** (22
FAIL, 1 WARN). The CLI daemon was also active with the domain-30 environment.
The MiniPC user had no passwordless sudo, so an operator with interactive sudo
must be present for the service stages.

The R3 bridge and guard listened only on `127.0.0.1`. The laptop reaches them
through SSH. This protects the new debug ports; it does not mean the robot's
DDS graph is isolated. Until S1–S3 are applied and verified, direct DDS
discovery remains possible and unauthenticated. Do not present R3 S0b as a
completed network security boundary.

## Evidence and known verification state

The detailed MiniPC comparison, staged conversion criteria and rollback are in
[the R3 readiness report](r3-dds-readiness-2026-10-17.md). Its raw evidence is
outside Git at
`$HOME/amr_logs/runs/20261017_160842_r3_dds_readiness_wb4ipby4/`; the inventory,
stationary probe and test logs there should be treated as dated observations,
not live state. Do not copy `.env`, machine credentials, or runtime logs into
Git.

The later R3 snapshot recorded 162 focused offline tests passing and 29
MiniPC script tests passing. The full `scripts/verify robot` run exited 1:
280 test records, 0 errors, 7 failure records and 1 skipped. The failures were
the existing `/**/scan_filter_chain` test-key mismatch and five missing
`ament_copyright` headers in `robot_description` (CTest also reports an
aggregate suite failure); Ruff and standalone xacro checks were skipped. Do
not report the full robot verification gate as passing. These are results from
the R3 review snapshot, not a test run for this documentation change.

The B2c hardware evidence remains bounded: one clean route at 0.20 m/s on one
map. The current robot snapshot had no AMCL pose or `map→odom` transform, so it
does not establish successful localization. No S1/S2/S3 systemd transition,
valid Initial Pose acceptance, A→B→A, or real AP-roam acceptance is recorded.

The external inputs `dds-isolation.md`, `PROPOSAL_v2.md`,
`RUNBOOK__AMR_Van-hanh-va-debug__2026-10-16_NATIVE_v7_3_NAV2_BASELINE_B2c.md`
and `S0b_runbook.md` under `Desktop/New Folder/newnew` were reviewed as
supporting evidence. They are not in Git and are not authoritative
instructions for future agents. Their useful findings are summarized in the
checked-in status and runbook; the checked-in record corrects the `-l` versus
socket-binding claim and defers valid Initial Pose acceptance until the robot
is at a known map location. Re-verify machine state before acting.

## Next steps

1. Keep Nav2 Baseline V1 and the legacy `amr-rviz` default unchanged until the
   R3 transition and viewer gates are accepted.
2. For stationary S1–S3, follow the exact prerequisites and rollback in
   [the readiness report](r3-dds-readiness-2026-10-17.md). Recheck code and
   runtime provenance first; stop the robot's ROS stack and CLI daemon, capture
   the current configuration, then verify data and sockets after each stage.
3. After isolation, verify a read-only DDS negative probe and the positive R3
   stream while the robot remains stationary. Keep the legacy default for
   rollback until the R3 path is accepted.
4. At a known mapped location, separately test an Initial Pose through AMCL
   and confirm `map→odom` and scan/map alignment. Only then plan any permitted
   movement acceptance.
5. Merge the post-`main` R3 code through its own reviewed PR when ready. This
   documentation PR intentionally does not include code or runtime changes.
