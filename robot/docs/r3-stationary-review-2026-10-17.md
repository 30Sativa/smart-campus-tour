# R3 stationary review — 2026-10-17

Status: **READY FOR HARDWARE TEST; not DONE/verified.** The R3-specific suite
passes, but the robot verification gate retains pre-existing failures. S1–S3
were not performed. No Nav2 goal, velocity command, accepted initial pose,
network change, package installation, SSH configuration change or Discovery
Server restart was performed.

The robot was stationary in a room, without an established pose on map2.
AMCL reported that an initial pose was required. The absence of `map -> odom`
was observed on both machines; no artificial transform or pose was introduced.

## Changes and evidence

| Problem | Change / result |
|---|---|
| RobotModel missing laptop meshes | `amr-rviz --r3` sources Humble and the laptop workspace. Missing workspace/model fails before launching a broken viewer. Audited all 36 mesh references from the actual robot URDF: none missing. |
| Launcher TERM/fatal adapter failure could leave RViz or descendants alive | Supervise all children with `wait -n`, explicit signal handling and owned-child cleanup. Test normal close, TERM, invalid arguments, adapter refusal and refusal before projector initialization. |
| Adapter could appear connected with stale sensor data | Check both receipt time and scan header age. `LIVE` also requires map, static TF and model received in the current connection; old local DDS caches do not qualify. |
| Map/static TF missing after a bridge cold start | Reproduced real BEST_EFFORT/VOLATILE bridge readers despite RELIABLE/TRANSIENT_LOCAL publishers. Delay latched subscriptions for discovery metadata, retry missing essential history, and expose incomplete data as STALE. After a real bridge cold restart, all three readers were RELIABLE/TRANSIENT_LOCAL and the laptop received fresh snapshots. |
| Large slow frame could be misclassified as a dead link | Count received TCP bytes as progress, even before a complete WebSocket frame. Bound frame/message and reply buffers. Test a frame taking longer than the dead-link threshold. Essential-history retry waits 30 s so normal large map transfers have time to finish. |
| Native RViz LaserScan intermittently extrapolated beyond latest TF | Reuse the existing, unchanged `scan_rviz` exclusively in laptop DDS. Render its PointCloud2 in the selected Fixed Frame. No wait or latest-TF fallback in the UI; preserve scan stamps. |
| UI offered unsupported control/camera functions | A separate R3 layout enables scan/model and removes Nav2 panel/Goal Tool and unsupported Astra display. Legacy and Nav2 V1 layouts remain unchanged. Initial Pose remains guarded. |
| Delayed TCP initial pose could be accepted long after a click | Protocol v2 requires `sent_at`. Guard rejects requests older than 2 s or more than 0.5 s in the future, before and after motion sampling. Adapter/guard must be upgraded together. Robot-clock stamping for AMCL remains. |
| Concurrent/disconnected requests and invalid numerical data | Reject concurrent requests and requests awaiting confirmation; check client connection before forward. Reject invalid/future odom, nonfinite motion, negative variances and overflowing input; normalize large finite quaternions without overflow. |
| Guard reply could stall indefinitely | Bound reply size and response wait. Report NO_ANSWER and reconnect without replaying the request. |
| Unsafe inherited DDS settings / writable bridge | Sanitize transport settings after sourcing; refuse direct adapter startup with discovery/profile/peer overrides. Refuse a bridge advertising `clientPublish`. SSH uses explicit loopback forwards and strict known-host checking. |
| Stage script skipped rollback when `systemctl restart` itself failed | Route restart failures through rollback too. Verified with fake systemctl/ss/proc, never against the running robot service. |
| Isolation checker could give false assurance | Check guard/TCP listeners too; report INCOMPLETE for missing runtime evidence; avoid claiming effective SSH keys-only policy from partial readable config. |

The QoS diagnosis matches the pinned upstream implementation:
[bridge 3.6.0 source](https://github.com/foxglove/foxglove-sdk/blob/ros-v3.6.0/ros/src/foxglove_bridge/src/ros2_foxglove_bridge.cpp),
`determineQoS()` and `subscribe()`. With no publisher endpoint information it
selects volatile/best effort, then keeps that reader while clients subscribe.
Reader sharing means an old client holding a bad subscription can obstruct
repair: update clients together and close stale S0b copies. The tested case is
the maintained R3 adapters; this is not a claim about arbitrary old clients.

## Real-device checks

Evidence root on the **laptop**, outside Git:
`$HOME/amr_logs/runs/20261017_151228_r3_review_brn6um/`.
Robot debug sessions are separate from the original Nav2 session. The latest
review debug session is recorded by `$HOME/amr_logs/r3-review-current` on the
**miniPC**; the control-stack session remains
`$HOME/amr_logs/runs/20261017_145405_r3_s0b/`.

| Check | Measured evidence |
|---|---|
| Map and model integrity | Actual map is 1419 × 1949 cells; map and URDF hashes agree between robot and laptop. Latched data reaches a late local subscriber. `asset-audit.json`, `robot-before.json`, `laptop-before.json`. Static map timestamps are old by design. |
| Tunnel interruption | Terminated only a review-owned SSH tunnel, ports 8875/8876, laptop domain 144. Laptop scan gap about 7.55 s including reconnect/backoff; simultaneous robot scan gap max 0.094 s. `events.log`, `real-tunnel.log`, `robot-reconnect.json`, `laptop-reconnect.json`. This does not simulate robot Wi-Fi loss or autonomous navigation. |
| Bridge restart | Only bridge/guard were restarted. Reproduced missing history, fixed the adapter, then cold-started bridge with adapters already waiting. Map/static TF/model replayed and real reader QoS was correct. `laptop-cold-restart-final.json`, robot debug logs. |
| Read-only boundary | Server advertises only `connectionGraph`, SDK protocol `foxglove.sdk.v1`. Direct LAN connection to 8765 and 8766 is refused; listeners are loopback. `real-security.json`. No control channel or velocity payload was sent. |
| Guard rejections | Wrong frame -> REJECTED; expired request -> REJECTED; unsupported operation -> ERROR. A real ROS subscriber observed **0 initialpose messages**. `real-guard-rejections.json`. No successful pose reset was attempted. |
| Actual RViz and assets | Real laptop OpenGL renderer started, model assets loaded, data became LIVE. After local projection, a 15 s render/cleanup test had 0 extrapolation and 0 message-filter-drop logs. `projected-cleanup-real.log/json`. This is a short stationary check, not a guarantee for all network conditions. |
| Local projection semantics | In one 12 s sample: 145 raw scans, 119 projected clouds; all 119 retained matching scan stamps and frame `odom`. `real-projection.json`. Missing TF deliberately drops a visualization sample; raw robot data is unaffected. |
| Settled QoS | Projector output and RViz subscriber both BEST_EFFORT/VOLATILE. A one-time incompatible-reliability warning can occur while RViz initializes its temporary default reader; it did not persist after the configured endpoint settled. |
| Real cleanup | Terminating the review launcher cleaned all **7** owned processes, including projector, adapter, RViz, tunnel and supervisors; temporary ports were released. `projected-cleanup-real.json`. |
| Laptop graph isolation | Actual adapter, projector and RViz environments: domain 42, localhost-only, no discovery server. No laptop viewer/projector reader appeared on the robot scan topic. `laptop-environments.json`, `robot-scan-readers.json`. |
| Resource use | In 10 s idle windows: bridge ~5.85% of one core, ~78 MiB RSS, nice 10; guard ~0.30%, ~60 MiB, nice 10. With two clients bridge ~6.83%. After closing test clients, bridge/guard descriptors returned to 28/22. Laptop projector ~8.3%, adapter ~2.2%, RViz ~15.2% of one core in a sampled window. These are idle measurements, not active-navigation benchmarks. |
| Control preservation | `control-before.txt` and `control-after.txt` match: same Nav2/AMCL/controller PID/start times, same `.env` and V1 file hashes, same Discovery Server PID/start time/ExecStart/no drop-in. V1 source/config/layout diff remains empty. |

No physical mobility, active-goal, roaming, robot Wi-Fi interruption or real
systemd stage-switch test was substituted with these checks.

## Software verification and limits

With Humble and the built workspace sourced, using a separate localhost ROS
domain and clearing robot discovery/profile overrides:

- R3 tools + script tests + the robot_navigation tests: **148 passed**.
- `bash scripts/verify robot`: **exit 1**, before and after the change.
- After the change: 280 native test records, 7 reported failures, 1 skipped.
  The same underlying failures existed before: outdated
  `test_lidar_clears_no_returns_without_clearing_near_range_rejects` indexing
  `/**/scan_filter_chain`, and missing copyright notices in five
  robot_description files. CTest also reports the copyright suite as a failure,
  hence the additional failure record. No test/check was disabled or weakened.
- Ruff and standalone xacro checks were unavailable/skipped on this laptop;
  they are not counted as passing. Build and R3 ROS tests did execute.
- V1 runtime files were preserved; these existing gate failures remain visible
  instead of changing the baseline as part of a debug-path review.

Logs: `r3-tests.log`, `verify-before.log`, `verify-after.log` in the laptop
evidence directory.

## Operator command and rollout decision

`amr-rviz` now points to the installed wrapper under
`$HOME/.local/share/amr-rviz/r3/`, independent of the worktree. The original
script is preserved byte-for-byte as `$HOME/.local/bin/amr-rviz.legacy`
(SHA256 `212dd754b1d7746daa7384a7c6371f0021701ae43688c6555c7b5283a1db2a4e`).

```bash
amr-rviz                     # legacy remains the default
amr-rviz --r3                # map frame, for an already localized robot
amr-rviz --r3 -f odom        # local stationary scan/model inspection
```

Existing tee logging remains usable. Close an existing R3 viewer before
starting another on the same laptop domain/ports. Do not use the historical
`amr-rviz-4g`, `amr-rviz-debug` or old S0b launcher for isolated operation;
those still use or assume the old direct-DDS workflow. They were not modified.

The miniPC uses a new debug-only overlay
`$HOME/.cache/armtc/r3_runtime_review_20261017/`; the Nav2 terminal/overlay was
not changed. The reviewed guard is protocol v2. The wrapper never starts,
stops or reconfigures the robot control runtime over SSH.

**Decision: do not execute S1–S3 yet, and do not promote R3 to the default.**
The SSH data path and stationary negative checks are ready for the remaining
S0b acceptance test. First place/identify the stationary robot at a known pose
on the correct map and verify a valid 2D Pose Estimate -> FORWARDED -> ACCEPTED,
with `map -> odom -> base_footprint` and the expected overlay. This does not
require A -> B -> A, but cannot be established from an unknown room pose.
The existing verification failures also prevent marking the branch verified.
Before S2/S3, use the reviewed `source-minipc` safeguards as described in the
rollout plan; the old runtime checkout still has the old source helper.

After those gates, S1 -> S2 -> S3 remain controlled stationary changes with
stack stop/restart and rollback. The current robot is still **NOT ISOLATED**,
as expected before those steps: `isolation-before.txt` reports open DDS sockets.
Navigation, roam, active-goal rejection on physical hardware and lost robot
Wi-Fi still require their separate authorized hardware sessions.
