# Test/harness audit — 2026-10-05

## Scope and authority

Audit of repo-owned tracked files and non-ignored untracked source, including
Python, C host tests, xUnit, Vitest, verification runners, compatibility spikes,
support fixtures and manual hardware/stream checks. Excludes installed/vendored
dependencies and generated build output. Every individual test definition is
classified in the appendix; shared support is listed separately.

Read root and deploy-unit AGENTS.md, docs/README.md, current business scope,
docs/architecture.md, ADR-0008 and local implementation/verification guides.
This is cross-deploy-unit test cleanup, not production integration work.
No production code, public interface, dependency manifest, CI check or verify
gate is changed by this audit. No commit or push.

Pre-existing backend production/test edits and untracked authentication files
are preserved. Concurrent web work moved a debounce helper while the first
root verify build ran. Concurrent robot work later updated RViz namespace
configuration and added one related contract test. This audit did not make or
revert those changes.
The first build failed on the old imports, and the final stable-state verify
is reported below. A production fix by this audit is forbidden.

## Counts

Source definition count is reproducible from Python AST test_ functions,
C test_ functions, xUnit Fact/Theory/custom Fact methods and Vitest it/test
registrations. Each parameterized definition counts once; runner-expanded
cases are reported separately. Test support and manual procedures do not
inflate the automated test-file count.

| Unit | Files before | Files after | Definitions before | Definitions after |
|---|---:|---:|---:|---:|
| backend | 18 | 18 | 81 | 81 |
| robot | 17 | 17 | 205 | 204 |
| web | 39 | 39 | 213 | 213 |
| digital-twin | 1 | 0 | 1 | 0 |
| ai-assistant | 0 | 0 | 0 | 0 |
| **Total** | **75** | **74** | **500** | **498** |

This cleanup alone removes three definitions: **500 → 497**. The final
worktree has **498**, because concurrent RViz work added
test_navigation_rviz_topics_are_relative_for_robot_namespace in
robot/ros2_ws/src/robot_control/test/test_nav2_baseline_contract.py. It is
classified CONTRACT/ARCHITECTURE and kept. The table reflects the final
observed worktree, not attribution of that additional change to this audit.

The backend count includes the pre-existing untracked
backend/tests/SmartCampus.IntegrationTests/ClaimsPrincipalExtensionsTests.cs.
Digital Twin keeps its test-project/solution scaffold for future real behavior
tests; zero discovered tests is explicitly reported, not a behavioral PASS.

## Removed or merged tests: assertion-level justification

1. **TEMPORARY HARNESS:** delete
   digital-twin/tests/FleetEmulator.Tests/SmokeTests.cs, containing
   FleetEmulatorEntryPointIsAvailable. It only reflects Program.Main and checks
   non-null. It verified the one-time project foundation and does not execute
   emulator, transport, startup output or business behavior. The executable
   project build already requires a valid entry point. There is no equivalent
   behavioral test because emulator behavior is still unimplemented; no such
   coverage is claimed or removed. No deletion is based on its PASS status.

2. **DUPLICATE:** merge test_depth_is_local_only out of
   robot/ros2_ws/src/robot_control/test/test_nav2_baseline_contract.py.
   Its two assertions are already stronger-covered in the same file:
   test_global_costmap_has_no_depth_or_sonar forbids PointCloud2 in the global
   YAML; test_local_costmap_keeps_lidar_depth_and_disables_sonar requires the
   local pointcloud data_type to be PointCloud2 and checks its plugin/source.
   No unique assertion or local-only depth invariant is removed.

3. **DUPLICATE:** merge test_wheel_base_calibration_is_unchanged out of
   robot/ros2_ws/src/robot_control/test/test_nav2_baseline_contract.py into
   test_wheel_geometry_and_real_odometry_calibration in
   robot/ros2_ws/src/robot_description/test/test_geometry_consistency.py.
   Both checked manual wheel_base=0.4714; the canonical test also compares it
   with standalone bridge/node calibration. Add the unique radius lock
   0.09725 to that canonical test, retaining its comparisons with URDF,
   simulation controller and firmware diameter. This removes a redundant
   task-bound 'unchanged during Nav2 patch' check without relaxing calibration.

No OBSOLETE test was proved safe to delete. No production behavior disappeared
as part of this task. No test was deleted for speed, fewer files, skips or PASS.

## Important coverage retained

| Current invariant/regression | Retained canonical coverage |
|---|---|
| robot-ros2 is the prebuilt hardware production service | robot/docker/test_image_profiles.py: test_compose_targets_tags_devices_and_networking; test_default_ci_image_is_hardware_and_never_inherits_dev_layers |
| Hardware has no explicit debug/simulation/build tooling except required transitives | Same file: test_hardware_copies_complete_artifacts_without_builder_filesystems; test_build_guard_rejects_tools_but_allows_required_runtime_libraries; runtime resolver tests |
| ros2-debug is debug/development; ros2-sim is simulation | Same file: stage ancestry, separate debug tools/sim rosdep and Compose targets/tags/source mounts |
| Hardware/debug/sim dependency separation | Same file: test_only_optional_runtime_dependencies_are_skipped; test_debug_tools_and_simulation_dependencies_are_installed_separately; resolver filtering |
| Hardware still has required ROS CLI | Same file: common base ros2cli-common-extensions/rosbag2 checks, hardware inherits base |
| Nav2 PushRosNamespace and global TF remaps | robot/ros2_ws/src/robot_control/test/test_nav2_baseline_contract.py: test_nav2_launches_push_the_robot_namespace; test_nav2_keeps_the_global_tf_tree |
| Costmap namespace topics and safe cmd_vel remapping | Same file: test_nav2_launches_define_robot_ns_for_the_params_file; test_costmap_sensor_topics_resolve_under_the_robot_namespace; test_nav2_output_still_goes_through_mode_manager; robot/ros2_ws/src/robot_control/test/test_namespace_contract.py |
| Humble plugin-key/DWB/RPP and slow-turn regressions | All unique Nav2 baseline checks retained, including DWB critics leftovers, progress timeout, acceleration/braking and disabled-camera stale behavior |
| Calibration, serial/count wrap, IMU, stale clock and non-finite commands | Geometry canonical test, EKF contracts, STM32 odometry, mode-manager and firmware host tests |
| Projection accuracy, worker freshness/concurrency and input sampling | All robot_perception tests and frozen fusion_scene oracle retained |
| Auth/roles, safe seeding, SQL concurrency and public responses | All backend tests retained, including live SQL integration and pre-existing user tests |
| UI permissions, confirmations, network cleanup and current legacy paths | All web tests retained; different pure/mock/UI/integration levels are not treated as duplicates |

Static Docker checks validate source/configuration contracts; actual built-image
package contents still need Docker build/image tests. Static Nav2 checks and
offline ROS stubs do not prove physical navigation, TF timing or motor response.

## Active harnesses and support (kept)

| Paths | Classification | Why retained / execution boundary |
|---|---|---|
| backend/tests/SignalRCompatibilityHarness/Program.cs; backend/tests/SignalRCompatibilityHarness/run.ps1; backend/tests/SignalRCompatibilityHarness/run-s2.ps1; backend/tests/SignalRCompatibilityHarness/run-s2b.ps1; backend/tests/SignalRCompatibilityHarness/Dockerfile; backend/tests/SignalRCompatibilityHarness/SignalRCompatibilityHarness.csproj | CONTRACT/ARCHITECTURE | ADR-0008 production compatibility acceptance gate is still pending/BLOCKED. S1 basic TLS/auth/binding and S2 reliability are different phases; candidate-2 S2B is a different released client, not a duplicate. Production Hub/bridge is not implemented. |
| robot/tools/signalr-compat/client.py; robot/tools/signalr-compat/s2_client.py; robot/tools/signalr-compat/s2b_client.py; robot/tools/signalr-compat/Dockerfile.pysignalr; robot/tools/signalr-compat/requirements.txt; robot/tools/signalr-compat/requirements-pysignalr.txt | CONTRACT/ARCHITECTURE | Pinned reproducible client halves of that active gate; no robot-runtime dependency added. |
| backend/tests/SignalRCompatibilityHarness/s2-last-run.json; backend/tests/SignalRCompatibilityHarness/s2b-pysignalr-last-run.json; backend/tests/SignalRCompatibilityHarness/README.md | CONTRACT/ARCHITECTURE support | Historical blocked evidence, not runnable tests or a production approval. Keep failures reproducible. |
| robot/ros2_ws/src/robot_perception/test/fusion_scene.py | PERMANENT REGRESSION support | Deterministic scene and independent frozen projection/fusion oracle used by permanent regression tests. Its benchmark main does not make the fixture disposable. |
| robot/quest-stream/tests/fake_adb.py | PERMANENT REGRESSION support | Simulated Quest plus real H.264 used by stream recovery integration. |
| web/src/test/setup.ts | PERMANENT REGRESSION support | Shared jsdom/testing bootstrap, no independent test definition. |
| scripts/verify, robot/scripts/verify, backend/scripts/verify, digital-twin/scripts/verify, web/scripts/verify | CONTRACT/ARCHITECTURE runner | Current per-unit build/test/exit-code gates, unchanged. |
| ai-assistant/scripts/verify | CONTRACT/ARCHITECTURE runner | Explicit SKIPPED skeleton until source exists, not a fake test PASS. |
| robot/firmware/stm32/motor_controller/scripts/verify.sh | PERMANENT REGRESSION runner | Host compiler runs 19 current parser/queue test functions. |
| robot/tools/motor_serial_debug.ps1; robot/tools/motor_test_forward.ps1; robot/tools/motor_test_backward.ps1; robot/tools/motor_test_one_wheel.ps1; robot/tools/motor_test_speed_steps.ps1; robot/tools/motor_test_spin_left.ps1; robot/tools/motor_test_spin_right.ps1 | PERMANENT REGRESSION manual harness | Reusable hardware directions/rate/isolated-wheel scenarios share a canonical serial runner; different motion scenarios are not duplicate tests. Do not automatically actuate hardware during an audit. |
| robot/firmware/stm32/motor_controller/scripts/imu_test.py | PERMANENT REGRESSION manual harness | Current USB IMU yaw/accuracy/tare diagnostics; host parser tests do not cover physical sensor stability. |
| robot/ros2_ws/src/orbbec_bringup/scripts/verify_astra_pro.sh; robot/ros2_ws/src/orbbec_bringup/orbbec_bringup/depth_check_node.py; robot/ros2_ws/src/orbbec_bringup/orbbec_bringup/costmap_contrib_node.py | PERMANENT REGRESSION manual harness | Reusable USB/ROS camera, TF/depth and costmap acceptance checks for current supplementary-sensor architecture. Diagnostic nodes are production-source files and remain untouched. |
| robot/ros2_ws/src/robot_perception/scripts/bench_detector.py | PERMANENT REGRESSION manual harness | Repeatable actual-miniPC model/runtime resource measurements and manifest generation, not evidence a completed migration can be discarded. |
| robot/quest-stream/scripts/check-quest.sh; robot/quest-stream/scripts/measure.sh | PERMANENT REGRESSION manual harness | Repeatable physical Quest/connectivity/stream measurement; real device/deployment required. |
| robot/docs/nav2-turn-test.md; robot/docs/phase1-camera.md; robot/docs/phase2-perception.md; robot/docs/phase3-nav2.md; robot/docs/phase4-ai.md | PERMANENT REGRESSION manual procedures | Current hardware acceptance instructions, outside automated definition counts. |

The SignalR README's historical ROS base image differs from today's Ubuntu
minimal base in robot/Dockerfile. Preserve the evidence as historical; a future
checkpoint rerun must establish current runtime parity. This audit does not
silently update or approve that transport contract.

## Verification

Final repo-root `bash scripts/verify`: **exit 0**. Ran with the existing local
SQL Server Express instance via process-local
`SMARTCAMPUS_SCHEMA_TEST_CONNECTION=Server=.\SQLEXPRESS;Integrated Security=true;TrustServerCertificate=true`.
The SQL tests created and dropped their own disposable databases; no existing
database/schema was migrated. All verify scripts and CI gates are unchanged.

| Check | Result |
|---|---|
| backend/scripts/verify | 50 unit + 80 integration cases PASS, zero skips, including live SQL |
| web/scripts/verify | npm ci, typecheck, lint, 251 Vitest cases in 39 files and production build PASS |
| digital-twin/scripts/verify | Restore/build PASS; zero discovered tests, as expected after removing the reflection-only foundation test |
| robot/scripts/verify | Tier 1 PASS including all 11 Docker/profile/resolver tests; ruff, xacro CLI and ROS/colcon Tier 2 explicitly SKIPPED |
| ai-assistant/scripts/verify | SKIPPED, no source/runtime implemented |
| All 15 robot Python test files, each in an isolated interpreter | 184 definitions discovered: 180 PASS and 4 SKIPPED initially on Windows; the two FFmpeg-dependent cases subsequently PASS on WSL. Concurrent RViz work then added one definition: reran Nav2 baseline 43/43 PASS and scripts/verify robot exit 0, leaving only 2 real-rclpy cases SKIPPED out of 185 final Python definitions |
| robot/quest-stream/tests/test_server.py on WSL | 20/20 PASS, including real FFmpeg filter and end-to-end stream/restart/USB replug fixture |
| robot/firmware/stm32/motor_controller/scripts/verify.sh on WSL | 13 BNO08x + 6 USB queue test functions PASS, GCC -Wall -Wextra -Werror |
| backend/tests/SignalRCompatibilityHarness/run.ps1, run-s2.ps1, run-s2b.ps1 | Each attempted, exit 1 before client tests: Docker Desktop Linux daemon unavailable. No compatibility result/soak PASS claimed; existing evidence preserved |
| Canonical merge coverage probes | 4/4: canonical tests reject global depth, absent local depth, manual wheel-base drift and common-radius drift even when all geometry agrees. Inputs patched only in memory, no production source touched |
| git diff --check | PASS |

Across retained automated tests, deduplicating repeated invocations:
**583 expanded cases/functions PASS, 2 real-ROS cases SKIPPED**. The three
blocked standalone compatibility runners are separate from that count.
No real motor/camera/navigation behavior was changed or executed; manual
hardware procedures, actual Docker image package checks, ROS Humble build/test
and the SignalR compatibility gate remain unverified in this environment.
This verifies the cleanup, not an all-environment system acceptance claim.

GCC and FFmpeg were installed only in the local WSL test environment because
no host compiler/FFmpeg was initially available. No repo/runtime dependencies
were added. The first verify failure was caused by concurrent web helper
relocation; imports were updated by the other work before the final successful
verify. Subsequent concurrent robot edits are in
robot/ros2_ws/src/robot_navigation/README.md,
robot/ros2_ws/src/robot_navigation/launch/navigation.launch.py,
robot/ros2_ws/src/robot_navigation/rviz/navigation.rviz, and RViz assertions
in the shared Nav2 test file. Those changes stayed intact and are outside this
audit. This audit's edits are only the three test files described above
(one deletion) plus this report; pre-existing backend changes stayed intact.

## File-by-file classification

The class below applies to each test in the file unless the individual appendix
records an exception. Descriptions concern current implementation, including
explicitly labeled mocks; they do not claim pending business targets are built.

| Test file | Definitions before → after | Classification / action | Value protected |
|---|---:|---|---|
| backend/tests/SmartCampus.IntegrationTests/AccountEndpointTests.cs | 8 → 8 | PERMANENT REGRESSION; keep | Admin authorization, safe paging/search/sort, creation, token revocation and account lifecycle. |
| backend/tests/SmartCampus.IntegrationTests/ApiBehaviorOptionsTests.cs | 1 → 1 | CONTRACT/ARCHITECTURE; keep | Automatic model-state errors use the public BaseResponse envelope. |
| backend/tests/SmartCampus.IntegrationTests/AuthEndpointTests.cs | 4 → 4 | PERMANENT REGRESSION; keep | Hashed refresh-cookie sessions, JWT identity, role rejection, login/refresh/logout and failed-logout behavior. |
| backend/tests/SmartCampus.IntegrationTests/AuthenticationPrimitiveTests.cs | 3 → 3 | PERMANENT REGRESSION; keep | Password hashing, random salt and deterministic username normalization. |
| backend/tests/SmartCampus.IntegrationTests/ClaimsPrincipalExtensionsTests.cs | 2 → 2 | PERMANENT REGRESSION; keep | Required subject GUID and fail-closed identity validation; pre-existing untracked user work, untouched. |
| backend/tests/SmartCampus.IntegrationTests/DatabaseScaffoldMappingTests.cs | 3 → 3 | CONTRACT/ARCHITECTURE; keep | Current v1.1 EF tables, binary hashes, concurrency tokens and relationship multiplicity; not a completed migration probe. |
| backend/tests/SmartCampus.IntegrationTests/DemoPoiSeederTests.cs | 14 → 14 | PERMANENT REGRESSION; keep | Still-supported explicit demo seeding command, environment guard, idempotency, preservation, conflicts, rollback and concurrency. |
| backend/tests/SmartCampus.IntegrationTests/GlobalExceptionHandlerTests.cs | 3 → 3 | PERMANENT REGRESSION; keep | Observable HTTP exception mapping, field errors and no internal-detail disclosure; pre-existing user edits, untouched. |
| backend/tests/SmartCampus.IntegrationTests/InfrastructureDependencyInjectionTests.cs | 2 → 2 | CONTRACT/ARCHITECTURE; keep | One scoped DbContext for the commit boundary and missing-configuration failure. |
| backend/tests/SmartCampus.IntegrationTests/InitialAdminSeederTests.cs | 14 → 14 | PERMANENT REGRESSION; keep | Still-supported opt-in initial-admin command, no normal-startup seeding, rollback and safe credential handling. v1.0 shared-user-table compatibility is explicitly supported, not obsolete. |
| backend/tests/SmartCampus.IntegrationTests/PoiManagementEndpointTests.cs | 3 → 3 | PERMANENT REGRESSION; keep | Admin-only POI mutation, RowVersion conflicts, concurrent writers, reference/history pose locks and Ready-Tour locks. |
| backend/tests/SmartCampus.IntegrationTests/SchemaV11Tests.cs | 5 → 5 | CONTRACT/ARCHITECTURE; keep | Live SQL snapshot constraints, filtered uniqueness, session races, branch limits, robot claims, stop FKs and append-only log permissions. |
| backend/tests/SmartCampus.IntegrationTests/SharedResponseSerializationTests.cs | 1 → 1 | CONTRACT/ARCHITECTURE; keep | Public paged response serialization properties/order. |
| backend/tests/SmartCampus.UnitTests/AccountValidatorTests.cs | 11 → 11 | PERMANENT REGRESSION; keep | Persisted field bounds, roles, actor IDs, pagination and whitelisted deterministic sort. |
| backend/tests/SmartCampus.UnitTests/LoginValidatorTests.cs | 2 → 2 | PERMANENT REGRESSION; keep | Username whitespace/length rejection without modifying password whitespace. |
| backend/tests/SmartCampus.UnitTests/PagedResultTests.cs | 1 → 1 | PERMANENT REGRESSION; keep | Total page rounding, including empty and boundary totals. |
| backend/tests/SmartCampus.UnitTests/UnitOfWorkBehaviorTests.cs | 3 → 3 | PERMANENT REGRESSION; keep | Commit only successful commands; queries do not resolve a persistence context. |
| backend/tests/SmartCampus.UnitTests/ValidationBehaviorTests.cs | 1 → 1 | PERMANENT REGRESSION; keep | Validation prevents execution and reports field failures. |
| digital-twin/tests/FleetEmulator.Tests/SmokeTests.cs | 1 → 0 | TEMPORARY HARNESS; delete | Foundation-only reflection check for Main; .NET executable compilation already validates the entry point. |
| robot/docker/test_image_profiles.py | 11 → 11 | CONTRACT/ARCHITECTURE; keep | Hardware/debug/sim layers, Compose services, runtime-only dependency resolution, CLI, tool exclusion and allowed transitive libraries. Resolver tests are permanent unit regressions. |
| robot/firmware/stm32/motor_controller/tests/test_bno08x_parse.c | 13 → 13 | PERMANENT REGRESSION; keep | Host tests execute current SHTP/quaternion parser: false report IDs, truncation, last reports, counts, accuracy, tare and yaw offsets. |
| robot/firmware/stm32/motor_controller/tests/test_usb_rx_queue.c | 6 → 6 | PERMANENT REGRESSION; keep | Current CDC queue FIFO, invalid flags, overflow, burst rates, ring wrap and long-line truncation. |
| robot/quest-stream/tests/test_server.py | 20 → 20 | PERMANENT REGRESSION; keep | Quest filter/encoder/ADB/HTTP behavior and real FFmpeg stream/restart/USB-disconnect integration; fake_adb is a reusable fixture. |
| robot/ros2_ws/src/gazebo_preview_bridge/test/test_gazebo_telemetry.py | 3 → 3 | CONTRACT/ARCHITECTURE; keep | Current development SimulationPreview payload, coordinate validity, yaw/quaternion and UTC fields. |
| robot/ros2_ws/src/robot_control/test/test_ekf_contract.py | 5 → 5 | CONTRACT/ARCHITECTURE; keep | EKF ownership of odom/TF, wheel twist plus IMU yaw, relative topics and explicit real-robot calibration/speed settings. |
| robot/ros2_ws/src/robot_control/test/test_mode_manager.py | 2 → 2 | PERMANENT REGRESSION; keep | Clock rollback/freshness and non-finite motion commands; different node/boundary from STM32 checks. |
| robot/ros2_ws/src/robot_control/test/test_namespace_contract.py | 8 → 8 | CONTRACT/ARCHITECTURE; keep | Relative endpoints, robot_id arguments, explicit map validation and namespace-aware topic parameters. |
| robot/ros2_ws/src/robot_control/test/test_nav2_baseline_contract.py | 44 → 43 | CONTRACT/ARCHITECTURE; merge duplicates | Current Humble plugin keys, safety envelope, costmaps, namespace push/global TF, sensor/cmd_vel remaps, behavior trees, RViz install and dependencies. Old Navfn/DWB negative checks retain regression value. |
| robot/ros2_ws/src/robot_description/test/test_geometry_consistency.py | 1 → 1 | CONTRACT/ARCHITECTURE; keep | Authoritative CAD versus simulation and calibrated hardware geometry, common wheel radius and firmware diameter. |
| robot/ros2_ws/src/robot_description/test/test_mesh_references.py | 3 → 3 | CONTRACT/ARCHITECTURE; keep | Shipped mesh references, STL validity, collision envelope and CAD assembly alignment. |
| robot/ros2_ws/src/robot_description/test/test_sensor_mounts.py | 1 → 1 | CONTRACT/ARCHITECTURE; keep | CAD sonar order/axes and matching saved hw/sim URDFs; a calibration regression, not a one-time migration. |
| robot/ros2_ws/src/robot_perception/test/test_input_sampling_ros.py | 2 → 2 | PERMANENT REGRESSION; keep | Real ROS subscription take rate, latest unique RGB-D pairs and unsampled bbox-only behavior; intentionally isolated fresh interpreter. |
| robot/ros2_ws/src/robot_perception/test/test_math.py | 12 → 12 | PERMANENT REGRESSION; keep | Actual perception parsing, geometry and slowdown-policy functions; lightweight ROS stubs are permanent test support. |
| robot/ros2_ws/src/robot_perception/test/test_node.py | 26 → 26 | PERMANENT REGRESSION; keep | Worker concurrency, bounded latest-only buffers, stale/future/order/clock errors, shutdown, fusion, diagnostics and fail-safe slowdown. |
| robot/ros2_ws/src/robot_perception/test/test_projection_regression.py | 14 → 14 | PERMANENT REGRESSION; keep | Independent frozen/OpenCV oracle plus physical scene sanity for projection, ROI/core, axes/order, calibration, sparse/invalid clouds and distortion fallback; retain legacy fixture. |
| robot/ros2_ws/src/stm32_bridge/test/test_odometry.py | 34 → 34 | PERMANENT REGRESSION; keep | Real production helpers: count/wrap/timing/serial parsing, odometry, IMU accuracy, joints, covariance and wheel limits. The two yaw tests call different functions and are not interchangeable. |
| web/src/api/client.test.ts | 5 → 5 | PERMANENT REGRESSION; keep | HTTP bodies, cookie inclusion, JSON errors, shared concurrent refresh and rejected-session clearing. |
| web/src/app/router/router.test.tsx | 18 → 18 | PERMANENT REGRESSION; keep | Real routing composition, bootstrap timing, guards, Admin precedence and still-live legacy redirects. Migration origin does not make live routes obsolete. |
| web/src/auth/AuthBootstrap.test.tsx | 2 → 2 | PERMANENT REGRESSION; keep | Session restore and StrictMode single refresh; unit lifecycle complements router integration. |
| web/src/auth/AuthLayout.test.tsx | 4 → 4 | PERMANENT REGRESSION; keep | Current auth composition, single brand, mock-data disclosure and sign-in artwork/copy. |
| web/src/auth/LoginPage.test.tsx | 12 → 12 | PERMANENT REGRESSION; keep | Accessible login, validation, exact passwords, in-flight duplicate submission, cookie transport and role-specific landing. |
| web/src/auth/access.test.ts | 14 → 14 | CONTRACT/ARCHITECTURE; keep | Current role normalization, supported area matrix and login return policy. Legacy Visitor frontend vocabulary is distinct from backend Auth V1 roles. |
| web/src/auth/use-logout.test.tsx | 2 → 2 | PERMANENT REGRESSION; keep | Remote session revocation precedes local clear/navigation; local recovery on endpoint failure. |
| web/src/components/ui/use-pagination.test.tsx | 2 → 2 | PERMANENT REGRESSION; keep | Page slices/filter reset and visible range/current-page presentation. |
| web/src/features/administration/accounts/accounts.test.tsx | 5 → 5 | PERMANENT REGRESSION; keep | API-backed account list/create/lifecycle, field validation, safe errors, confirmation and read-only unsupported roles. |
| web/src/features/administration/admin-attention.test.ts | 2 → 2 | PERMANENT REGRESSION; keep | Admin counts and review/finalization task priority. |
| web/src/features/administration/admin-nav.test.ts | 2 → 2 | CONTRACT/ARCHITECTURE; keep | Admin navigation contains pre-run work/records and correct active routes, no robot-operation controls. |
| web/src/features/administration/components/TourParts.test.tsx | 3 → 3 | PERMANENT REGRESSION; keep | RegistrationBar states, pending-review indicator and truthful empty state. |
| web/src/features/administration/pois/poi-form.test.tsx | 3 → 3 | PERMANENT REGRESSION; keep | Persisted decimal constraints, dirty field/RowVersion preservation and content-only edits with locked yaw. |
| web/src/features/digital-twin/SimulatorPreview.test.tsx | 2 → 2 | PERMANENT REGRESSION; keep | Paused labeled browser demo, playback rate/reset and timer teardown. |
| web/src/features/digital-twin/campus-assets.test.ts | 1 → 1 | CONTRACT/ARCHITECTURE; keep | Actual shipped simulator OBJ/MTL references and finite geometry; different asset/axis convention from visitor campus tests. |
| web/src/features/digital-twin/demo-motion.test.ts | 3 → 3 | PERMANENT REGRESSION; keep | Circular demo continuity/tangent and its public mapToScene wrapper; complements map-config implementation tests. |
| web/src/features/digital-twin/map-config.test.ts | 6 → 6 | PERMANENT REGRESSION; keep | Shared affine/scene/grid/student transforms, heading convention, calibration gating and degenerate fit rejection. |
| web/src/features/landing/landing-motion.test.ts | 1 → 1 | PERMANENT REGRESSION; keep | Current reveal observer visibility/unobserve/disconnect lifecycle. |
| web/src/features/quest-stream/QuestLiveVideo.test.tsx | 9 → 9 | PERMANENT REGRESSION; keep | WHEP receive-only setup, offline detection, bounded reconnect/backoff, retry and peer/server-session cleanup. |
| web/src/features/quest-stream/whep.test.ts | 3 → 3 | PERMANENT REGRESSION; keep | WHEP URL resolution and invalid/legacy HLS URL rejection; distinct pure boundary from peer lifecycle. |
| web/src/features/representative/representative-flow.test.tsx | 10 → 10 | PERMANENT REGRESSION; keep | Currently shipped representative routes: own-group protection, locking/rejection, roster steps and confirmed cancellation. |
| web/src/features/representative/roster-import.test.ts | 8 → 8 | PERMANENT REGRESSION; keep | CSV/XLSX template/read/write, compressed shared strings, Vietnamese data, all-or-nothing validation and size/type/row limits. |
| web/src/features/staff/StaffShell.test.tsx | 3 → 3 | PERMANENT REGRESSION; keep | Role-sensitive console chrome and mobile dismiss/focus behavior. |
| web/src/features/staff/attention.test.ts | 7 → 7 | PERMANENT REGRESSION; keep | Operational next steps, fresh heartbeat versus stale pose, count/queue priority and server target. |
| web/src/features/staff/components/OverviewAnalytics.test.tsx | 2 → 2 | PERMANENT REGRESSION; keep | Only supplied measurements and explicit empty states; no fabricated telemetry. |
| web/src/features/staff/components/RouteSchematic.test.tsx | 1 → 1 | PERMANENT REGRESSION; keep | Ordered POIs/source and map interaction without fabricated camera image. |
| web/src/features/staff/status.test.ts | 5 → 5 | PERMANENT REGRESSION; keep | Human-readable status/severity, enum case, unknown and unhealthy-state presentation. |
| web/src/features/student/student-matching.test.ts | 7 → 7 | PERMANENT REGRESSION; keep | Existing mock name/class match, Unicode normalization and generic rejection; currently live implementation, not proof of target personal invitation access. |
| web/src/features/student/student-workflow.test.tsx | 5 → 5 | PERMANENT REGRESSION; keep | Existing mock join/live/wait/completed screens; target invitation/session workflow remains separate unimplemented work. |
| web/src/features/visitor/campus-model.test.ts | 5 → 5 | PERMANENT REGRESSION; keep | Visitor Z-up model conversion, surveyed/calibrated anchors, moving robot and camera fit. |
| web/src/features/visitor/components/CampusMap3D.test.tsx | 2 → 2 | PERMANENT REGRESSION; keep | WebGL unavailable UI and camera controls/surveyed focus; actual GPU pixels remain manual. |
| web/src/features/visitor/visitor-flows.test.tsx | 10 → 10 | PERMANENT REGRESSION; keep | Still-routed legacy visitor booking/tour/assistant/profile/navigation behavior; old product scope is not evidence the code has been removed. |
| web/src/mocks/admin-sim.test.ts | 14 → 14 | PERMANENT REGRESSION; keep | Active shared mock-world admin states, review races, reasons, request idempotency and email retry. |
| web/src/mocks/representative-sim.test.ts | 14 → 14 | PERMANENT REGRESSION; keep | Active shared mock-world ownership, registration, resubmission, roster/version locking and group-link visibility. |
| web/src/mocks/staff-mock.test.ts | 2 → 2 | PERMANENT REGRESSION; keep | API/auth adapter prevents Admin-only run commands; direct world-state tests do not cover this boundary. |
| web/src/mocks/staff-sim.test.ts | 5 → 5 | PERMANENT REGRESSION; keep | Active simulation state machine: robot claim/release, Start/End Early, failure/recovery, POI Hold and one VisitClosed. |
| web/src/routes/admin/admin-workflow.test.tsx | 3 → 3 | PERMANENT REGRESSION; keep | Actual admin UI confirmation/error/reload/read-only behavior; not duplicate of underlying mock state transitions. |
| web/src/routes/public/PublicHomePage.test.tsx | 6 → 6 | PERMANENT REGRESSION; keep | Public CTA landing, anchor integrity, remote-tour copy and theme transition. |
| web/src/routes/staff/staff-workflow.test.tsx | 5 → 5 | PERMANENT REGRESSION; keep | Actual run UI/readiness/confirmations/reasons and telemetry disclosure; complements pure mock state tests. |

## Individual test-definition inventory

Before-cleanup definitions: CONTRACT/ARCHITECTURE: 100; DUPLICATE: 2; PERMANENT REGRESSION: 397; TEMPORARY HARNESS: 1. OBSOLETE: 0.

### backend/tests/SmartCampus.IntegrationTests/AccountEndpointTests.cs

| Test definition | Classification | Action |
|---|---|---|
| AdminAccounts_RequireAdminAndAllowAdmin | PERMANENT REGRESSION | keep |
| ListAccounts_PagesDeterministicallyAndReturnsOnlySafeFields | PERMANENT REGRESSION | keep |
| ListAccounts_SearchesAndSortsInDatabase | PERMANENT REGRESSION | keep |
| ListAccounts_ReturnsInvalidRolesAsNullAndLifecycleStillFailsClosed | PERMANENT REGRESSION | keep |
| ListAccounts_RejectsInvalidSizeAndExpansion | PERMANENT REGRESSION | keep |
| CreateAccount_EnforcesRoleAndUsernameContractsAndStoresOnlyHashAndAudit | PERMANENT REGRESSION | keep |
| DeactivateAndReactivate_RevokesRefreshTokensAndIsIdempotent | PERMANENT REGRESSION | keep |
| LifecycleEndpoints_ReturnNotFoundForMissingTargets | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.IntegrationTests/ApiBehaviorOptionsTests.cs

| Test definition | Classification | Action |
|---|---|---|
| InvalidModelState_UsesBaseResponseEnvelope | CONTRACT/ARCHITECTURE | keep |

### backend/tests/SmartCampus.IntegrationTests/AuthEndpointTests.cs

| Test definition | Classification | Action |
|---|---|---|
| LoginRefreshAndLogout_UseHashedRefreshCookieAndSignedShortLivedAccessToken | PERMANENT REGRESSION | keep |
| InitialAdminSeederAdmin_CanLoginWithHashedPasswordAndSingleRole | PERMANENT REGRESSION | keep |
| Login_RejectsUnknownInactiveMissingMultipleAndUnsupportedRoles | PERMANENT REGRESSION | keep |
| LogoutFailure_ReturnsErrorEnvelopeAndClearsRefreshCookie | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.IntegrationTests/AuthenticationPrimitiveTests.cs

| Test definition | Classification | Action |
|---|---|---|
| IdentityPasswordHasher_HashesAndVerifiesPassword | PERMANENT REGRESSION | keep |
| IdentityPasswordHasher_UsesRandomSaltForEachHash | PERMANENT REGRESSION | keep |
| UsernameNormalizer_TrimsAndUsesInvariantUppercaseDeterministically | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.IntegrationTests/ClaimsPrincipalExtensionsTests.cs

| Test definition | Classification | Action |
|---|---|---|
| GetRequiredUserId_ReturnsSubjectGuid | PERMANENT REGRESSION | keep |
| GetRequiredUserId_MissingOrInvalidSubjectThrowsUnauthorized | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.IntegrationTests/DatabaseScaffoldMappingTests.cs

| Test definition | Classification | Action |
|---|---|---|
| Model_ContainsOnlyTablesFromCurrentSchema | CONTRACT/ARCHITECTURE | keep |
| Model_PreservesBinaryHashesAndConcurrencyTokens | CONTRACT/ARCHITECTURE | keep |
| Model_PreservesRegistrationAndAssignmentRelationships | CONTRACT/ARCHITECTURE | keep |

### backend/tests/SmartCampus.IntegrationTests/DemoPoiSeederTests.cs

| Test definition | Classification | Action |
|---|---|---|
| UnsafeTarget_IsRejectedBeforeOpeningConnection | PERMANENT REGRESSION | keep |
| Command_RefusesUnsafeOrCombinedInvocationWithoutHttp | PERMANENT REGRESSION | keep |
| FirstSeed_CreatesOnlyFourPoisWithStableIdsAndExplicitDemoContext | PERMANENT REGRESSION | keep |
| Rerun_PreservesAllPayloadAndTimestamps | PERMANENT REGRESSION | keep |
| PartialFixture_OnlyInsertsMissingIdsAndPreservesExistingRows | PERMANENT REGRESSION | keep |
| DuplicateNormalizedNameWithAnotherId_IsConflictAndNeverMerged | PERMANENT REGRESSION | keep |
| ChangedPayload_IsConflictEvenWhenSomeFixtureRowsAreMissing | PERMANENT REGRESSION | keep |
| UpdatedRealPose_KeepsRouteStopReferenceAndRerunNeverDowngradesIt | PERMANENT REGRESSION | keep |
| InsertFailure_RollsBackEntireBatch | PERMANENT REGRESSION | keep |
| ConcurrentSeeds_ProduceOneCreationAndOneSkip | PERMANENT REGRESSION | keep |
| Command_SeedsThenSkipsWithoutStartingHttpOrRequiringJwt | PERMANENT REGRESSION | keep |
| Command_ConflictReturnsNonzeroWithoutOverwriting | PERMANENT REGRESSION | keep |
| Command_InsertFailureReturnsNonzeroWithoutSqlDiagnostics | PERMANENT REGRESSION | keep |
| NormalStartup_DoesNotSeedDemoDatabase | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.IntegrationTests/GlobalExceptionHandlerTests.cs

| Test definition | Classification | Action |
|---|---|---|
| TryHandleAsync_MapsKnownExceptions | PERMANENT REGRESSION | keep |
| TryHandleAsync_ValidationException_ReturnsErrorsByField | PERMANENT REGRESSION | keep |
| TryHandleAsync_UnexpectedException_DoesNotExposeDetails | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.IntegrationTests/InfrastructureDependencyInjectionTests.cs

| Test definition | Classification | Action |
|---|---|---|
| AddInfrastructure_UsesSameScopedDbContextForCommitBoundary | CONTRACT/ARCHITECTURE | keep |
| AddInfrastructure_MissingConnectionString_FailsFast | CONTRACT/ARCHITECTURE | keep |

### backend/tests/SmartCampus.IntegrationTests/InitialAdminSeederTests.cs

| Test definition | Classification | Action |
|---|---|---|
| SeedAsync_RejectsUsernameWhitespaceBeforeAccessingDatabase | PERMANENT REGRESSION | keep |
| SeedAsync_CreatesAdminAndLeavesOtherTablesEmpty | PERMANENT REGRESSION | keep |
| SeedAsync_UsesSharedUserTablesOnV10SchemaWithoutAdoptingV11 | PERMANENT REGRESSION | keep |
| SeedAsync_RerunSkipsWithoutChangingExistingAccount | PERMANENT REGRESSION | keep |
| SeedAsync_ExistingUsernameWithoutAdminRoleIsConflict | PERMANENT REGRESSION | keep |
| SeedAsync_InactiveExistingAdminIsConflictAndIsNotReactivated | PERMANENT REGRESSION | keep |
| SeedAsync_NormalizedUsernameMismatchIsConflict | PERMANENT REGRESSION | keep |
| SeedAsync_RoleInsertFailureRollsBackUser | PERMANENT REGRESSION | keep |
| InitialAdminSeedCommand_ExitsWithoutStartingHttpServer | PERMANENT REGRESSION | keep |
| InitialAdminSeedCommand_RejectsPasswordOnCommandLineWithoutEchoingIt | PERMANENT REGRESSION | keep |
| InitialAdminSeedCommand_RejectsUnprefixedPasswordArgumentWithoutStartingHttpServer | PERMANENT REGRESSION | keep |
| NormalApiStartup_FailsFastWhenJwtSigningKeyIsMissing | PERMANENT REGRESSION | keep |
| NormalApiStartup_FailsFastWhenJwtSigningKeyIsShort | PERMANENT REGRESSION | keep |
| NormalApiStartup_DoesNotBootstrapConfiguredAdmin | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.IntegrationTests/PoiManagementEndpointTests.cs

| Test definition | Classification | Action |
|---|---|---|
| PoiEndpoints_RequireAdminCreateInactiveAndReturnRelevantStatuses | PERMANENT REGRESSION | keep |
| PoiUpdates_RejectStaleVersionsAndNoOpDoesNotAddAudit_ConcurrentSameVersionHasOneConflict | PERMANENT REGRESSION | keep |
| PoiUsageLocksPoseAfterRouteReferenceAndAllChangesWhileTourIsReady | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.IntegrationTests/SchemaV11Tests.cs

| Test definition | Classification | Action |
|---|---|---|
| BusinessKeys_RejectDuplicates_AllowDifferentRegistrationsAndRoutes | CONTRACT/ARCHITECTURE | keep |
| Sessions_ConcurrentAdmissionHasOneWinner_ExpiredRowMustBeClosed | CONTRACT/ARCHITECTURE | keep |
| Branches_OnlyOnePendingPerRequesterPoint_OneAcceptedIncludingStaffDirect | CONTRACT/ARCHITECTURE | keep |
| StopReferencesAndRobotClaims_RejectMissingStops_KeepHistoryAfterRouteChange | CONTRACT/ARCHITECTURE | keep |
| LogRole_AllowsAppendAndRead_RejectsUpdateDelete_AndPreservesEmailStages | CONTRACT/ARCHITECTURE | keep |

### backend/tests/SmartCampus.IntegrationTests/SharedResponseSerializationTests.cs

| Test definition | Classification | Action |
|---|---|---|
| PagedResponse_SerializesSharedPropertiesInContractOrder | CONTRACT/ARCHITECTURE | keep |

### backend/tests/SmartCampus.UnitTests/AccountValidatorTests.cs

| Test definition | Classification | Action |
|---|---|---|
| CreateAccountValidator_RejectsWhitespaceInUsername | PERMANENT REGRESSION | keep |
| CreateAccountValidator_RequiresFieldsAndActor | PERMANENT REGRESSION | keep |
| CreateAccountValidator_EnforcesPersistedLengthLimits | PERMANENT REGRESSION | keep |
| CreateAccountValidator_RejectsUnsupportedRoles | PERMANENT REGRESSION | keep |
| CreateAccountValidator_AcceptsSupportedRoles | PERMANENT REGRESSION | keep |
| GetAccountsValidator_EnforcesPaginationBounds | PERMANENT REGRESSION | keep |
| GetAccountsValidator_AcceptsBoundaryValues | PERMANENT REGRESSION | keep |
| GetAccountsValidator_RejectsUnsupportedSort | PERMANENT REGRESSION | keep |
| GetAccountsSortParser_ParsesWhitelistedFields | PERMANENT REGRESSION | keep |
| GetAccountsSortParser_UsesDeterministicDefault | PERMANENT REGRESSION | keep |
| LifecycleValidators_RequireAccountAndActorIds | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.UnitTests/LoginValidatorTests.cs

| Test definition | Classification | Action |
|---|---|---|
| LoginValidator_RejectsWhitespaceInUsername | PERMANENT REGRESSION | keep |
| LoginValidator_EnforcesUsernameLengthAndAllowsPasswordWhitespace | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.UnitTests/PagedResultTests.cs

| Test definition | Classification | Action |
|---|---|---|
| TotalPages_RoundsUpFromTotalItems | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.UnitTests/UnitOfWorkBehaviorTests.cs

| Test definition | Classification | Action |
|---|---|---|
| Handle_Command_CommitsAfterHandlerSucceeds | PERMANENT REGRESSION | keep |
| Handle_Query_DoesNotResolvePersistenceOrCommit | PERMANENT REGRESSION | keep |
| Handle_FailedCommand_DoesNotCommit | PERMANENT REGRESSION | keep |

### backend/tests/SmartCampus.UnitTests/ValidationBehaviorTests.cs

| Test definition | Classification | Action |
|---|---|---|
| Handle_InvalidRequest_UsesAsyncValidatorAndSkipsHandler | PERMANENT REGRESSION | keep |

### digital-twin/tests/FleetEmulator.Tests/SmokeTests.cs

| Test definition | Classification | Action |
|---|---|---|
| FleetEmulatorEntryPointIsAvailable | TEMPORARY HARNESS | delete foundation smoke |

### robot/docker/test_image_profiles.py

| Test definition | Classification | Action |
|---|---|---|
| test_default_ci_image_is_hardware_and_never_inherits_dev_layers | CONTRACT/ARCHITECTURE | keep |
| test_only_optional_runtime_dependencies_are_skipped | CONTRACT/ARCHITECTURE | keep |
| test_debug_tools_and_simulation_dependencies_are_installed_separately | CONTRACT/ARCHITECTURE | keep |
| test_hardware_copies_complete_artifacts_without_builder_filesystems | CONTRACT/ARCHITECTURE | keep |
| test_build_guard_rejects_tools_but_allows_required_runtime_libraries | CONTRACT/ARCHITECTURE | keep |
| test_dependency_layers_do_not_depend_on_full_source_or_models | CONTRACT/ARCHITECTURE | keep |
| test_compose_targets_tags_devices_and_networking | CONTRACT/ARCHITECTURE | keep |
| test_interactive_shells_inherit_one_auto_source_and_no_network_defaults | CONTRACT/ARCHITECTURE | keep |
| test_apt_output_handles_multiple_keys_architectures_and_duplicates | PERMANENT REGRESSION | keep |
| test_non_apt_empty_or_invalid_resolution_is_a_failure | PERMANENT REGRESSION | keep |
| test_resolver_keeps_installed_runtime_keys_and_filters_optional_ones | PERMANENT REGRESSION | keep |

### robot/firmware/stm32/motor_controller/tests/test_bno08x_parse.c

| Test definition | Classification | Action |
|---|---|---|
| test_find_basic | PERMANENT REGRESSION | keep |
| test_find_khong_nham_byte_du_lieu | PERMANENT REGRESSION | keep |
| test_khong_co_report_mong_muon | PERMANENT REGRESSION | keep |
| test_report_la_va_cat_cut | PERMANENT REGRESSION | keep |
| test_quat_to_euler | PERMANENT REGRESSION | keep |
| test_wrap180 | PERMANENT REGRESSION | keep |
| test_tare | PERMANENT REGRESSION | keep |
| test_build_set_feature | PERMANENT REGRESSION | keep |
| test_find_report_last | PERMANENT REGRESSION | keep |
| test_count_reports | PERMANENT REGRESSION | keep |
| test_report_accuracy | PERMANENT REGRESSION | keep |
| test_yaw_offset_quat | PERMANENT REGRESSION | keep |
| test_report_len | PERMANENT REGRESSION | keep |

### robot/firmware/stm32/motor_controller/tests/test_usb_rx_queue.c

| Test definition | Classification | Action |
|---|---|---|
| test_fifo_order | PERMANENT REGRESSION | keep |
| test_bad_flag_khong_nuot_lenh_hop_le | PERMANENT REGRESSION | keep |
| test_queue_day_thi_set_bad | PERMANENT REGRESSION | keep |
| test_khong_don_ung_o_10_20hz | PERMANENT REGRESSION | keep |
| test_wrap_vong_tron | PERMANENT REGRESSION | keep |
| test_dong_qua_dai_bi_cat | PERMANENT REGRESSION | keep |

### robot/quest-stream/tests/test_server.py

| Test definition | Classification | Action |
|---|---|---|
| test_left_eye_is_the_left_half | PERMANENT REGRESSION | keep |
| test_right_eye_is_the_right_half | PERMANENT REGRESSION | keep |
| test_output_size_fps_and_square_pixels | PERMANENT REGRESSION | keep |
| test_override_wins | PERMANENT REGRESSION | keep |
| test_filter_is_accepted_by_ffmpeg_and_gives_1280x720 | PERMANENT REGRESSION | keep |
| test_invalid_config_is_refused | PERMANENT REGRESSION | keep |
| test_publishes_rtsp_over_tcp_to_mediamtx | PERMANENT REGRESSION | keep |
| test_webrtc_safe_h264 | PERMANENT REGRESSION | keep |
| test_keyframe_interval | PERMANENT REGRESSION | keep |
| test_path_endpoint_and_password_hiding | PERMANENT REGRESSION | keep |
| test_mediamtx_reachable | PERMANENT REGRESSION | keep |
| test_parse | PERMANENT REGRESSION | keep |
| test_pick_ready_quest | PERMANENT REGRESSION | keep |
| test_nothing_attached | PERMANENT REGRESSION | keep |
| test_unauthorized_explains_what_to_do | PERMANENT REGRESSION | keep |
| test_serial_filter | PERMANENT REGRESSION | keep |
| test_screenrecord_streams_h264_to_stdout | PERMANENT REGRESSION | keep |
| test_status_reports_state_reason_and_whep_path | PERMANENT REGRESSION | keep |
| test_health_preflight_and_unknown | PERMANENT REGRESSION | keep |
| test_publish_mediamtx_down_disconnect_and_recover | PERMANENT REGRESSION | keep |

### robot/ros2_ws/src/gazebo_preview_bridge/test/test_gazebo_telemetry.py

| Test definition | Classification | Action |
|---|---|---|
| test_payload_shape_and_yaw | CONTRACT/ARCHITECTURE | keep |
| test_payload_rejects_non_finite_coordinates | CONTRACT/ARCHITECTURE | keep |
| test_payload_rejects_degenerate_quaternion | CONTRACT/ARCHITECTURE | keep |

### robot/ros2_ws/src/robot_control/test/test_ekf_contract.py

| Test definition | Classification | Action |
|---|---|---|
| test_ekf_fuses_diff_drive_twist_constraint_and_imu_yaw | CONTRACT/ARCHITECTURE | keep |
| test_ekf_owns_final_odom_and_tf_in_real_launch | CONTRACT/ARCHITECTURE | keep |
| test_real_launch_inverts_both_feedback_counts_for_odometry | CONTRACT/ARCHITECTURE | keep |
| test_real_robot_speed_policy_is_explicit | CONTRACT/ARCHITECTURE | keep |
| test_bridge_publishes_relative_measurement_topics_only | CONTRACT/ARCHITECTURE | keep |

### robot/ros2_ws/src/robot_control/test/test_mode_manager.py

| Test definition | Classification | Action |
|---|---|---|
| test_command_freshness_rejects_clock_rollback | PERMANENT REGRESSION | keep |
| test_non_finite_twist_is_rejected | PERMANENT REGRESSION | keep |

### robot/ros2_ws/src/robot_control/test/test_namespace_contract.py

| Test definition | Classification | Action |
|---|---|---|
| test_mode_manager_uses_relative_ros_names | CONTRACT/ARCHITECTURE | keep |
| test_robot_io_nodes_use_relative_ros_names | CONTRACT/ARCHITECTURE | keep |
| test_camera_pointcloud_remap_is_relative | CONTRACT/ARCHITECTURE | keep |
| test_primary_launch_files_accept_robot_id | CONTRACT/ARCHITECTURE | keep |
| test_real_localization_requires_explicit_existing_map | CONTRACT/ARCHITECTURE | keep |
| test_topic_parameters_are_relative | CONTRACT/ARCHITECTURE | keep |
| test_no_config_hardcodes_a_robot_id | CONTRACT/ARCHITECTURE | keep |
| test_canonical_robot_id_replaces_legacy_bus_id | CONTRACT/ARCHITECTURE | keep |

### robot/ros2_ws/src/robot_control/test/test_nav2_baseline_contract.py

| Test definition | Classification | Action |
|---|---|---|
| test_global_planner_is_smac_2d | CONTRACT/ARCHITECTURE | keep |
| test_navfn_is_gone | CONTRACT/ARCHITECTURE | keep |
| test_progress_checker_key_is_humble_singular | CONTRACT/ARCHITECTURE | keep |
| test_goal_checker_and_controller_keys_stay_plural | CONTRACT/ARCHITECTURE | keep |
| test_controller_is_regulated_pure_pursuit | CONTRACT/ARCHITECTURE | keep |
| test_rpp_baseline_safety_flags | CONTRACT/ARCHITECTURE | keep |
| test_rpp_speed_stays_at_the_supervised_baseline | CONTRACT/ARCHITECTURE | keep |
| test_rpp_regulation_is_actually_active | CONTRACT/ARCHITECTURE | keep |
| test_heading_and_recovery_turns_share_the_supervised_speed_envelope | CONTRACT/ARCHITECTURE | keep |
| test_turn_acceleration_is_limited_without_weakening_braking | CONTRACT/ARCHITECTURE | keep |
| test_progress_timeout_budgets_slow_half_turn_then_translation | CONTRACT/ARCHITECTURE | keep |
| test_rpp_lookahead_is_not_shorter_than_the_robot | CONTRACT/ARCHITECTURE | keep |
| test_rpp_inflation_gain_matches_the_local_costmap | CONTRACT/ARCHITECTURE | keep |
| test_dwb_is_gone | CONTRACT/ARCHITECTURE | keep |
| test_dwb_critics_config_is_gone | CONTRACT/ARCHITECTURE | keep |
| test_global_costmap_is_lidar_only | CONTRACT/ARCHITECTURE | keep |
| test_global_costmap_has_no_depth_or_sonar | CONTRACT/ARCHITECTURE | keep |
| test_local_costmap_keeps_lidar_depth_and_disables_sonar | CONTRACT/ARCHITECTURE | keep |
| test_navigation_rviz_has_four_independent_sonar_displays_off_by_default | CONTRACT/ARCHITECTURE | keep |
| test_navigation_rviz_matches_humble_amcl_and_rpp_interfaces | CONTRACT/ARCHITECTURE | keep |
| test_navigation_rviz_is_in_package_install_data | CONTRACT/ARCHITECTURE | keep |
| test_obstacle_layers_combine_with_maximum | CONTRACT/ARCHITECTURE | keep |
| test_depth_is_local_only | DUPLICATE | merge into canonical (see justification) |
| test_camera_disabled_launch_cannot_stall_the_costmap | CONTRACT/ARCHITECTURE | keep |
| test_local_inflation_radius_covers_the_robot | CONTRACT/ARCHITECTURE | keep |
| test_global_inflation_radius_covers_the_robot | CONTRACT/ARCHITECTURE | keep |
| test_costmaps_agree_on_robot_radius | CONTRACT/ARCHITECTURE | keep |
| test_robot_radius_covers_the_cad_chassis_box | CONTRACT/ARCHITECTURE | keep |
| test_nav2_launches_push_the_robot_namespace | CONTRACT/ARCHITECTURE | keep |
| test_nav2_keeps_the_global_tf_tree | CONTRACT/ARCHITECTURE | keep |
| test_nav2_launches_define_robot_ns_for_the_params_file | CONTRACT/ARCHITECTURE | keep |
| test_costmap_sensor_topics_resolve_under_the_robot_namespace | CONTRACT/ARCHITECTURE | keep |
| test_sonar_topics_match_the_bridge | CONTRACT/ARCHITECTURE | keep |
| test_nav2_output_still_goes_through_mode_manager | CONTRACT/ARCHITECTURE | keep |
| test_baseline_behavior_trees_never_invoke_backup | CONTRACT/ARCHITECTURE | keep |
| test_behavior_trees_are_installed | CONTRACT/ARCHITECTURE | keep |
| test_backup_plugin_stays_loaded_for_manual_testing | CONTRACT/ARCHITECTURE | keep |
| test_waypoint_follower_is_kept_for_tour_stops | CONTRACT/ARCHITECTURE | keep |
| test_real_amcl_does_not_assume_the_map_origin | CONTRACT/ARCHITECTURE | keep |
| test_sim_still_seeds_amcl_at_the_spawn_origin | CONTRACT/ARCHITECTURE | keep |
| test_amcl_frames_match_the_rest_of_the_stack | CONTRACT/ARCHITECTURE | keep |
| test_nav2_uses_base_footprint_everywhere | CONTRACT/ARCHITECTURE | keep |
| test_plugin_packages_are_declared_dependencies | CONTRACT/ARCHITECTURE | keep |
| test_wheel_base_calibration_is_unchanged | DUPLICATE | merge into canonical (see justification) |
| test_navigation_rviz_topics_are_relative_for_robot_namespace (concurrent addition) | CONTRACT/ARCHITECTURE | keep; rerun PASS |


### robot/ros2_ws/src/robot_description/test/test_geometry_consistency.py

| Test definition | Classification | Action |
|---|---|---|
| test_wheel_geometry_and_real_odometry_calibration | CONTRACT/ARCHITECTURE | keep |

### robot/ros2_ws/src/robot_description/test/test_mesh_references.py

| Test definition | Classification | Action |
|---|---|---|
| test_xacro_references_every_mesh_once | CONTRACT/ARCHITECTURE | keep |
| test_stl_files_are_valid_and_match_body_envelope | CONTRACT/ARCHITECTURE | keep |
| test_mesh_origins_match_cad_assembly | CONTRACT/ARCHITECTURE | keep |

### robot/ros2_ws/src/robot_description/test/test_sensor_mounts.py

| Test definition | Classification | Action |
|---|---|---|
| test_cad_positions_and_downward_beams | CONTRACT/ARCHITECTURE | keep |

### robot/ros2_ws/src/robot_perception/test/test_input_sampling_ros.py

| Test definition | Classification | Action |
|---|---|---|
| test_real_rgbd_takes_are_sampled_and_pairs_are_fresh_unique | PERMANENT REGRESSION | keep |
| test_real_bbox_only_subscription_remains_unsampled | PERMANENT REGRESSION | keep |

### robot/ros2_ws/src/robot_perception/test/test_math.py

| Test definition | Classification | Action |
|---|---|---|
| test_letterbox_round_trip | PERMANENT REGRESSION | keep |
| test_parser_supported_end_to_end_and_rejects_unknown_tensor | PERMANENT REGRESSION | keep |
| test_classic_layout_person_only | PERMANENT REGRESSION | keep |
| test_cloud_honors_row_padding_endian_and_filters_nan | PERMANENT REGRESSION | keep |
| test_cloud_rejects_short_payload | PERMANENT REGRESSION | keep |
| test_range_core_uses_p25_band_and_requires_support | PERMANENT REGRESSION | keep |
| test_distortion_projection_matches_known_plumb_bob_point | PERMANENT REGRESSION | keep |
| test_slowdown_policy_startup_hysteresis_clear_and_unknown | PERMANENT REGRESSION | keep |
| test_policy_uses_forward_corridor_and_each_side | PERMANENT REGRESSION | keep |
| test_policy_rejects_stale_order_and_zero_semantics | PERMANENT REGRESSION | keep |
| test_bbox_only_speed_limit_combination_is_rejected | PERMANENT REGRESSION | keep |
| test_people_position_is_not_changed_by_marker_height | PERMANENT REGRESSION | keep |

### robot/ros2_ws/src/robot_perception/test/test_node.py

| Test definition | Classification | Action |
|---|---|---|
| test_locate_phase_timing_success_exceptions_guards_and_empty_boxes | PERMANENT REGRESSION | keep |
| test_worker_profiles_nonempty_locate_success_error_stale_and_replaced_results | PERMANENT REGRESSION | keep |
| test_fusion_diagnostics_percentiles_unknown_and_last_100_attempts | PERMANENT REGRESSION | keep |
| test_sample_group_limits_each_reader_before_take_and_keeps_latest | PERMANENT REGRESSION | keep |
| test_sample_group_missed_ticks_do_not_accumulate_or_allow_concurrent_takes | PERMANENT REGRESSION | keep |
| test_health_tick_releases_normal_inputs_but_bbox_only_stays_ungated | PERMANENT REGRESSION | keep |
| test_rgbd_pending_is_latest_only_and_cloud_timestamps_cannot_be_reused | PERMANENT REGRESSION | keep |
| test_locate_empty_boxes_skips_cloud_tf_and_projection | PERMANENT REGRESSION | keep |
| test_sync_accepts_40ms_and_rejects_60ms | PERMANENT REGRESSION | keep |
| test_duplicate_and_out_of_order_observations_are_unknown | PERMANENT REGRESSION | keep |
| test_stale_rgb_and_stale_cloud_are_unknown | PERMANENT REGRESSION | keep |
| test_observation_that_ages_during_inference_is_stale | PERMANENT REGRESSION | keep |
| test_clock_jump_resets_timestamp_ordering_and_policy | PERMANENT REGRESSION | keep |
| test_hung_worker_keeps_one_latest_pending_and_health_timer_runs | PERMANENT REGRESSION | keep |
| test_worker_replaces_unconsumed_result_and_processes_only_latest_pending | PERMANENT REGRESSION | keep |
| test_idle_worker_exits_when_shutdown_notifies_condition | PERMANENT REGRESSION | keep |
| test_rgbd_fusion_runs_on_worker_and_fusion_errors_remain_unknown | PERMANENT REGRESSION | keep |
| test_future_rgb_or_cloud_timestamp_is_still_unknown | PERMANENT REGRESSION | keep |
| test_model_load_failure_is_reported | PERMANENT REGRESSION | keep |
| test_inference_exception_and_unsupported_tensor_are_model_error | PERMANENT REGRESSION | keep |
| test_model_error_survives_stale_health_tick | PERMANENT REGRESSION | keep |
| test_tf_lookup_uses_latest_transform_and_missing_tf_is_not_hidden | PERMANENT REGRESSION | keep |
| test_stale_100_percent_and_errors_fall_back_to_50 | PERMANENT REGRESSION | keep |
| test_speed_limit_off_publishes_nothing | PERMANENT REGRESSION | keep |
| test_source_stamp_to_detection_e2e_metric | PERMANENT REGRESSION | keep |
| test_exact_policy_boundaries | PERMANENT REGRESSION | keep |

### robot/ros2_ws/src/robot_perception/test/test_projection_regression.py

| Test definition | Classification | Action |
|---|---|---|
| test_near_centre_bbox | PERMANENT REGRESSION | keep |
| test_left_and_right_bboxes_keep_sign_and_axis | PERMANENT REGRESSION | keep |
| test_multiple_bboxes_preserve_order | PERMANENT REGRESSION | keep |
| test_near_and_far_person_and_small_roi | PERMANENT REGRESSION | keep |
| test_invalid_nan_inf_and_zero_points | PERMANENT REGRESSION | keep |
| test_empty_bbox_list | PERMANENT REGRESSION | keep |
| test_sparse_roi_success_insufficient_roi_and_insufficient_core | PERMANENT REGRESSION | keep |
| test_bbox_without_depth_outside_image_and_failing_second_box | PERMANENT REGRESSION | keep |
| test_unorganized_cloud_matches_organized | PERMANENT REGRESSION | keep |
| test_calibration_variants | PERMANENT REGRESSION | keep |
| test_full_cloud_projection_matches_legacy_without_opencv | PERMANENT REGRESSION | keep |
| test_supported_plumb_bob_matches_opencv | PERMANENT REGRESSION | keep |
| test_zero_negative_nan_depth_and_float32_input_match_opencv | PERMANENT REGRESSION | keep |
| test_other_distortion_lengths_keep_opencv_behavior | PERMANENT REGRESSION | keep |

### robot/ros2_ws/src/stm32_bridge/test/test_odometry.py

| Test definition | Classification | Action |
|---|---|---|
| test_steps_per_meter_matches_firmware | PERMANENT REGRESSION | keep |
| test_first_sample_is_baseline_no_motion | PERMANENT REGRESSION | keep |
| test_straight_line_forward | PERMANENT REGRESSION | keep |
| test_pure_rotation_in_place | PERMANENT REGRESSION | keep |
| test_wheel_odometry_is_independent_of_imu_yaw | PERMANENT REGRESSION | keep |
| test_int32_wrap_is_handled | PERMANENT REGRESSION | keep |
| test_theta_normalized_to_pi_range | PERMANENT REGRESSION | keep |
| test_parse_feedback_six_field | PERMANENT REGRESSION | keep |
| test_parse_feedback_five_field_fallback | PERMANENT REGRESSION | keep |
| test_parse_feedback_eight_field_with_yaw | PERMANENT REGRESSION | keep |
| test_parse_feedback_eight_field_yaw_invalid | PERMANENT REGRESSION | keep |
| test_parse_feedback_twelve_field_with_two_sonars | PERMANENT REGRESSION | keep |
| test_parse_feedback_sixteen_field_with_four_sonars | PERMANENT REGRESSION | keep |
| test_parse_feedback_seventeen_field_with_accuracy | PERMANENT REGRESSION | keep |
| test_parse_feedback_sixteen_field_has_no_accuracy | PERMANENT REGRESSION | keep |
| test_parse_feedback_ignores_unknown_trailing_fields | PERMANENT REGRESSION | keep |
| test_parse_feedback_accuracy_is_clamped | PERMANENT REGRESSION | keep |
| test_imu_yaw_variance_mapping | PERMANENT REGRESSION | keep |
| test_yaw_to_quaternion_z_roundtrip | PERMANENT REGRESSION | keep |
| test_imu_message_publishes_yaw_and_accuracy_covariance | PERMANENT REGRESSION | keep |
| test_cached_imu_measurement_is_not_republished | PERMANENT REGRESSION | keep |
| test_invalid_wheel_samples_do_not_publish_fake_zero_twist | PERMANENT REGRESSION | keep |
| test_joint_states_follow_corrected_feedback_deltas_and_refresh_at_stop | PERMANENT REGRESSION | keep |
| test_joint_states_use_relative_topic_and_leave_wheel_tf_to_rsp | PERMANENT REGRESSION | keep |
| test_diff_drive_vy_constraint_variance | PERMANENT REGRESSION | keep |
| test_parse_feedback_garbage_returns_none | PERMANENT REGRESSION | keep |
| test_yaw_quaternion_roundtrip | PERMANENT REGRESSION | keep |
| test_non_finite_twist_is_rejected | PERMANENT REGRESSION | keep |
| test_wheel_pair_below_limit_is_unchanged | PERMANENT REGRESSION | keep |
| test_straight_wheel_pair_above_limit_scales_equally | PERMANENT REGRESSION | keep |
| test_in_place_rotation_preserves_symmetric_opposite_wheels | PERMANENT REGRESSION | keep |
| test_mixed_command_scales_both_wheels_when_one_exceeds_limit | PERMANENT REGRESSION | keep |
| test_pair_scaling_preserves_ratio_and_sign | PERMANENT REGRESSION | keep |
| test_forward_twist_is_inverted_for_installed_drive | PERMANENT REGRESSION | keep |

### web/src/api/client.test.ts

| Test definition | Classification | Action |
|---|---|---|
| accepts the empty response returned by logout and includes its cookie | PERMANENT REGRESSION | keep |
| continues to parse JSON data | PERMANENT REGRESSION | keep |
| does not silently accept malformed nonempty JSON | PERMANENT REGRESSION | keep |
| shares one refresh between concurrent unauthorized requests and retries with the new token | PERMANENT REGRESSION | keep |
| clears the local session when the refresh cookie is rejected | PERMANENT REGRESSION | keep |

### web/src/app/router/router.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| restores an Admin session before rendering the requested protected area | PERMANENT REGRESSION | keep |
| sends a protected route to login when session restoration fails | PERMANENT REGRESSION | keep |
| waits for session restoration before redirecting a protected route | PERMANENT REGRESSION | keep |
| sends a signed-out visitor from /staff to sign in | PERMANENT REGRESSION | keep |
| sends a signed-out visitor from /admin to sign in | PERMANENT REGRESSION | keep |
| sends an operator who types /admin back to their own console | PERMANENT REGRESSION | keep |
| keeps Admin Accounts behind the Admin route guard | PERMANENT REGRESSION | keep |
| lets an operator into /staff | PERMANENT REGRESSION | keep |
| lets an administrator into /staff as well | PERMANENT REGRESSION | keep |
| still accepts a token minted before the operations roles were merged | PERMANENT REGRESSION | keep |
| renders the administration overview at /admin, not the operations console | PERMANENT REGRESSION | keep |
| keeps /admin/roles as a real route rather than a legacy redirect | PERMANENT REGRESSION | keep |
| serves %s as a real admin page | PERMANENT REGRESSION | keep |
| opens a Tour at /admin/tours/:id instead of redirecting it to operations | PERMANENT REGRESSION | keep |
| keeps a mistyped admin path inside administration | PERMANENT REGRESSION | keep |
| redirects %s to %s | PERMANENT REGRESSION | keep |
| sends an unknown path back to the public page | PERMANENT REGRESSION | keep |
| does not expose the removed public self-registration route | PERMANENT REGRESSION | keep |

### web/src/auth/AuthBootstrap.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| restores the account from the refresh cookie once, including under StrictMode | PERMANENT REGRESSION | keep |
| starts signed out when no valid refresh cookie is available | PERMANENT REGRESSION | keep |

### web/src/auth/AuthLayout.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| renders the sign-in route inside the shared auth composition | PERMANENT REGRESSION | keep |
| carries the brand once, inside the auth column rather than the form | PERMANENT REGRESSION | keep |
| keeps the development badge outside the auth column entirely | PERMANENT REGRESSION | keep |
| renders the sign-in copy over the photograph | PERMANENT REGRESSION | keep |

### web/src/auth/LoginPage.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| renders the sign-in form and toggles password visibility | PERMANENT REGRESSION | keep |
| labels every field, so no input relies on its placeholder | PERMANENT REGRESSION | keep |
| ties a validation message to the field it belongs to | PERMANENT REGRESSION | keep |
| rejects whitespace in a username before calling the API | PERMANENT REGRESSION | keep |
| preserves password whitespace exactly | PERMANENT REGRESSION | keep |
| rejects an overlong username and allows correction to the backend length limit | PERMANENT REGRESSION | keep |
| posts credentials to the backend with the refresh cookie enabled | PERMANENT REGRESSION | keep |
| disables controls and ignores repeated submissions while signing in | PERMANENT REGRESSION | keep |
| announces a safe message after a failed login | PERMANENT REGRESSION | keep |
| lands a %s account in its home area | PERMANENT REGRESSION | keep |
| rejects roles outside the three Auth V1 roles | PERMANENT REGRESSION | keep |
| does not offer public self-registration | PERMANENT REGRESSION | keep |

### web/src/auth/access.test.ts

| Test definition | Classification | Action |
|---|---|---|
| has exactly four roles | CONTRACT/ARCHITECTURE | keep |
| keeps the representative area to representatives only | CONTRACT/ARCHITECTURE | keep |
| keeps a visitor out of operations and administration | CONTRACT/ARCHITECTURE | keep |
| keeps staff out of administration | CONTRACT/ARCHITECTURE | keep |
| allows signed-in roles to browse the visitor area | CONTRACT/ARCHITECTURE | keep |
| lets an admin into both, which is the policy this app has always had | CONTRACT/ARCHITECTURE | keep |
| reads a token minted before the two operations roles were merged | CONTRACT/ARCHITECTURE | keep |
| lands each role in its own area after sign-in | CONTRACT/ARCHITECTURE | keep |
| sends an admin to administration even after being bounced off an operations page | CONTRACT/ARCHITECTURE | keep |
| still returns an admin to the administration page they asked for | CONTRACT/ARCHITECTURE | keep |
| returns staff to the operations page they asked for | CONTRACT/ARCHITECTURE | keep |
| ignores a destination the role does not belong in | CONTRACT/ARCHITECTURE | keep |
| falls back to the role home when there is nothing remembered | CONTRACT/ARCHITECTURE | keep |
| builds the permission matrix from the same predicate the guard uses | CONTRACT/ARCHITECTURE | keep |

### web/src/auth/use-logout.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| revokes the cookie session before clearing local auth and navigating | PERMANENT REGRESSION | keep |
| still clears local auth and navigates if the logout request fails | PERMANENT REGRESSION | keep |

### web/src/components/ui/use-pagination.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| slices pages and starts again at page 1 when the filter changes | PERMANENT REGRESSION | keep |
| shows the range, marks the current page and hides itself for one page | PERMANENT REGRESSION | keep |

### web/src/features/administration/accounts/accounts.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| loads the API list, searches remotely, sorts remotely, and pages with size | PERMANENT REGRESSION | keep |
| creates a %s account and invalidates the list | PERMANENT REGRESSION | keep |
| blocks account creation for a username containing whitespace | PERMANENT REGRESSION | keep |
| shows duplicate and validation errors from the API without exposing raw bodies | PERMANENT REGRESSION | keep |
| confirms managed-account lifecycle actions and keeps Admin/invalid-role rows read-only | PERMANENT REGRESSION | keep |

### web/src/features/administration/admin-attention.test.ts

| Test definition | Classification | Action |
|---|---|---|
| counts pending reviews, Ready Tours and Tours still being prepared | PERMANENT REGRESSION | keep |
| puts reviews first, with a direct action, then Tours ready to finalize | PERMANENT REGRESSION | keep |

### web/src/features/administration/admin-nav.test.ts

| Test definition | Classification | Action |
|---|---|---|
| lists only pre-run work and records, nothing that drives a robot | CONTRACT/ARCHITECTURE | keep |
| lights the right entry for %s | CONTRACT/ARCHITECTURE | keep |

### web/src/features/administration/components/TourParts.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| shows waiting groups prominently and describes every registration state | PERMANENT REGRESSION | keep |
| removes the waiting indicator when the last group is approved | PERMANENT REGRESSION | keep |
| explains an empty tour without showing a misleading bar | PERMANENT REGRESSION | keep |

### web/src/features/administration/pois/poi-form.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| creates with yaw zero and uses the persisted decimal range in browser constraints | PERMANENT REGRESSION | keep |
| keeps dirty fields through a query refetch and submits the original RowVersion on conflict | PERMANENT REGRESSION | keep |
| does not let a locked stored yaw block a content-only edit | PERMANENT REGRESSION | keep |

### web/src/features/digital-twin/SimulatorPreview.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| labels the demo, starts paused, plays, pauses and resets the pose | PERMANENT REGRESSION | keep |
| changes playback rate and cleans up the timer on unmount | PERMANENT REGRESSION | keep |

### web/src/features/digital-twin/campus-assets.test.ts

| Test definition | Classification | Action |
|---|---|---|
| loads the shipped OBJ with every referenced material and finite geometry | CONTRACT/ARCHITECTURE | keep |

### web/src/features/digital-twin/demo-motion.test.ts

| Test definition | Classification | Action |
|---|---|---|
| completes a loop without a position or heading discontinuity | PERMANENT REGRESSION | keep |
| faces along the route at a quarter turn | PERMANENT REGRESSION | keep |
| maps metres to the ground plane and preserves heading | PERMANENT REGRESSION | keep |

### web/src/features/digital-twin/map-config.test.ts

| Test definition | Classification | Action |
|---|---|---|
| keeps the old map-to-scene convention with the identity transform | PERMANENT REGRESSION | keep |
| rotates position and heading together | PERMANENT REGRESSION | keep |
| converts metres to occupancy-grid pixels, row 0 at the top | PERMANENT REGRESSION | keep |
| does not place a robot on an uncalibrated drawing | PERMANENT REGRESSION | keep |
| gives the student map a clockwise heading with 0 pointing up | PERMANENT REGRESSION | keep |
| fits an affine transform from three landmarks and reproduces them | PERMANENT REGRESSION | keep |

### web/src/features/landing/landing-motion.test.ts

| Test definition | Classification | Action |
|---|---|---|
| reveals each section element when it enters the viewport | PERMANENT REGRESSION | keep |

### web/src/features/quest-stream/QuestLiveVideo.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| says the stream is not configured when there is no WHEP URL | PERMANENT REGRESSION | keep |
| offers receive-only video to the WHEP endpoint, then shows the live picture | PERMANENT REGRESSION | keep |
| reports offline when there is no stream yet (404) and reconnects by itself | PERMANENT REGRESSION | keep |
| treats an unreachable server as offline | PERMANENT REGRESSION | keep |
| reconnects when the connection fails after going live | PERMANENT REGRESSION | keep |
| reconnects immediately when the user presses retry | PERMANENT REGRESSION | keep |
| closes the connection and frees the server session on unmount | PERMANENT REGRESSION | keep |
| says so when the browser has no WebRTC | PERMANENT REGRESSION | keep |
| backs off 2 s, 4 s, 8 s, then every 10 s | PERMANENT REGRESSION | keep |

### web/src/features/quest-stream/whep.test.ts

| Test definition | Classification | Action |
|---|---|---|
| accepts the WHEP endpoint as is | PERMANENT REGRESSION | keep |
| turns the MediaMTX page address into its WHEP endpoint | PERMANENT REGRESSION | keep |
| rejects empty values, non-http URLs and old HLS playlists | PERMANENT REGRESSION | keep |

### web/src/features/representative/representative-flow.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| summarises the registrations on the overview | PERMANENT REGRESSION | keep |
| lists Tours: register where Scheduled, open the registration where one exists | PERMANENT REGRESSION | keep |
| explains why a locked Tour takes no registration | PERMANENT REGRESSION | keep |
| shows the join link and group code of an approved group | PERMANENT REGRESSION | keep |
| disables changes on a locked Tour and says why | PERMANENT REGRESSION | keep |
| shows Admin’s rejection reason and the way to fix it | PERMANENT REGRESSION | keep |
| cancels only after confirmation | PERMANENT REGRESSION | keep |
| checks group information before moving to the roster step | PERMANENT REGRESSION | keep |
| filters My Registrations by state | PERMANENT REGRESSION | keep |
| does not open another school’s registration | PERMANENT REGRESSION | keep |

### web/src/features/representative/roster-import.test.ts

| Test definition | Classification | Action |
|---|---|---|
| reads the template it offers for download | PERMANENT REGRESSION | keep |
| round-trips a roster through .xlsx, Vietnamese names included | PERMANENT REGRESSION | keep |
| reads a compressed workbook with shared strings, as Excel writes it | PERMANENT REGRESSION | keep |
| names the row and column of every problem and imports nothing | PERMANENT REGRESSION | keep |
| skips fully blank rows, keeps duplicates, accepts accented headers and semicolons | PERMANENT REGRESSION | keep |
| refuses a file without a HoTen column, an empty list and one over the limit | PERMANENT REGRESSION | keep |
| refuses old .xls, other types and files over 2 MB before reading them | PERMANENT REGRESSION | keep |
| writes a workbook every reader here can open | PERMANENT REGRESSION | keep |

### web/src/features/staff/StaffShell.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| shows the active page and only offers administration to admins | PERMANENT REGRESSION | keep |
| shows the signed-in account at the top right and no page search | PERMANENT REGRESSION | keep |
| opens the mobile navigation and restores focus when dismissed | PERMANENT REGRESSION | keep |

### web/src/features/staff/attention.test.ts

| Test definition | Classification | Action |
|---|---|---|
| offers the step the state calls for, and never Start from a list | PERMANENT REGRESSION | keep |
| separates a live heartbeat from a stale pose, and holds a robot awaiting a check | PERMANENT REGRESSION | keep |
| counts sessions by TourState and running ones needing assistance | PERMANENT REGRESSION | keep |
| summarises approved groups only | PERMANENT REGRESSION | keep |
| puts a Tour needing assistance first, then a held robot, then a due start | PERMANENT REGRESSION | keep |
| ignores rehearsal robots and the robot already serving a Tour | PERMANENT REGRESSION | keep |
| reads the target from the server progress, not from a guess | PERMANENT REGRESSION | keep |

### web/src/features/staff/components/OverviewAnalytics.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| summarises only the readings supplied by the operations responses | PERMANENT REGRESSION | keep |
| shows explicit empty states instead of inventing measurements | PERMANENT REGRESSION | keep |

### web/src/features/staff/components/RouteSchematic.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| shows the ordered POIs and live robot source without inventing a camera image | PERMANENT REGRESSION | keep |

### web/src/features/staff/status.test.ts

| Test definition | Classification | Action |
|---|---|---|
| never shows a backend enum to a person | PERMANENT REGRESSION | keep |
| reads the enum whatever case it arrives in | PERMANENT REGRESSION | keep |
| does not dress an unhealthy state as a healthy one | PERMANENT REGRESSION | keep |
| shows an unknown status as it came, toned neutral | PERMANENT REGRESSION | keep |
| puts the worst alert first | PERMANENT REGRESSION | keep |

### web/src/features/student/student-matching.test.ts

| Test definition | Classification | Action |
|---|---|---|
| normalizes Vietnamese names correctly (bỏ dấu, thường hóa, đ/d, khoảng trắng) | PERMANENT REGRESSION | keep |
| normalizes class names | PERMANENT REGRESSION | keep |
| matches exactly with accentless, case-insensitive name and matching class | PERMANENT REGRESSION | keep |
| matches when roster row has no class even if input class is omitted | PERMANENT REGRESSION | keep |
| fails if roster row has class but input omitted or has different class | PERMANENT REGRESSION | keep |
| fails if name is not found in roster with generic security message | PERMANENT REGRESSION | keep |
| requires name to be entered | PERMANENT REGRESSION | keep |

### web/src/features/student/student-workflow.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| renders Join Form by default when no session exists | PERMANENT REGRESSION | keep |
| rejects invalid student info with security error message | PERMANENT REGRESSION | keep |
| joins tour-101 (Running) and enters Live View with Video, 2D Map, and AI | PERMANENT REGRESSION | keep |
| joins tour-102 (Scheduled) and enters Waiting Room with audio test | PERMANENT REGRESSION | keep |
| renders completed tour end screen with visited POIs | PERMANENT REGRESSION | keep |

### web/src/features/visitor/campus-model.test.ts

| Test definition | Classification | Action |
|---|---|---|
| does not pretend uncalibrated plan coordinates are room positions | PERMANENT REGRESSION | keep |
| uses surveyed anchors and a single axis/scale/rotation transform | PERMANENT REGRESSION | keep |
| calibrates the percentage plan and never gives the robot a fixed anchor | PERMANENT REGRESSION | keep |
| loads the supplied OBJ geometry with Z-up converted to a horizontal floor | PERMANENT REGRESSION | keep |
| fits the entire model in narrow and wide viewports and preserves top orientation | PERMANENT REGRESSION | keep |

### web/src/features/visitor/components/CampusMap3D.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| explains WebGL unavailability without offering dead camera controls | PERMANENT REGRESSION | keep |
| switches views, zooms, resets and focuses only surveyed locations | PERMANENT REGRESSION | keep |

### web/src/features/visitor/visitor-flows.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| follows Home → Explore → Map → location and preserves the destination for booking | PERMANENT REGRESSION | keep |
| recovers an empty search by clearing filters | PERMANENT REGRESSION | keep |
| requires an available slot and shows the actual booking confirmation | PERMANENT REGRESSION | keep |
| shows an alternative date action when no robots are available | PERMANENT REGRESSION | keep |
| never cancels before confirmation and supports keyboard tabs | PERMANENT REGRESSION | keep |
| confirms tour commands and opens the assistant from an active tour | PERMANENT REGRESSION | keep |
| turns an assistant answer into actionable location links | PERMANENT REGRESSION | keep |
| preserves unsaved profile edits when a notification preference changes | PERMANENT REGRESSION | keep |
| marks unread notifications as read and keeps history accessible | PERMANENT REGRESSION | keep |
| closes account navigation with Escape and restores its trigger | PERMANENT REGRESSION | keep |

### web/src/mocks/admin-sim.test.ts

| Test definition | Classification | Action |
|---|---|---|
| A: a Scheduled Tour with a group waiting cannot be finalized, and says exactly why | PERMANENT REGRESSION | keep |
| B: with nothing waiting it finalizes to Ready, which Staff then sees | PERMANENT REGRESSION | keep |
| C: re-opening a Ready Tour keeps approved groups approved | PERMANENT REGRESSION | keep |
| D: a Running Tour is read-only for Admin; ending it is Staff End Early | PERMANENT REGRESSION | keep |
| refuses a stale version instead of acting on old data | PERMANENT REGRESSION | keep |
| approving a group never makes the Tour Ready; approving the last one makes it finalizable | PERMANENT REGRESSION | keep |
| detects a roster replaced while Admin was reviewing, then accepts after reload | PERMANENT REGRESSION | keep |
| needs a reason to reject, and keeps it for the representative | PERMANENT REGRESSION | keep |
| a failed e-mail leaves the group Approved and can be sent again | PERMANENT REGRESSION | keep |
| sends only for approved groups of a Tour that has not run | PERMANENT REGRESSION | keep |
| creates a Scheduled Tour with no robot, once per request id, and validates per field | PERMANENT REGRESSION | keep |
| edits only while Scheduled | PERMANENT REGRESSION | keep |
| flags a route whose config is incomplete | PERMANENT REGRESSION | keep |
| cancels a Tour that has not run, with a reason, and keeps it | PERMANENT REGRESSION | keep |

### web/src/mocks/representative-sim.test.ts

| Test definition | Classification | Action |
|---|---|---|
| sees only their own registrations, one per state worth showing | PERMANENT REGRESSION | keep |
| shows the rejection reason to the representative | PERMANENT REGRESSION | keep |
| offers registration only on Scheduled Tours without an active registration of theirs | PERMANENT REGRESSION | keep |
| sends a group that Admin then finds in the review queue | PERMANENT REGRESSION | keep |
| refuses a second registration for the same Tour | PERMANENT REGRESSION | keep |
| gives the join link and group code only after Admin approves | PERMANENT REGRESSION | keep |
| sends a Rejected group back to review after a fix | PERMANENT REGRESSION | keep |
| replaces the roster of an approved group, which goes back to review | PERMANENT REGRESSION | keep |
| does not change the e-mail of an approved group (flow §10.2) or accept an unchanged roster | PERMANENT REGRESSION | keep |
| cancels and registers again on the same record | PERMANENT REGRESSION | keep |
| locks everything once the Tour is Ready, and says why | PERMANENT REGRESSION | keep |
| refuses a save made on stale data | PERMANENT REGRESSION | keep |
| validates the form fields and the roster | PERMANENT REGRESSION | keep |
| hides the join link once the Tour has ended | PERMANENT REGRESSION | keep |

### web/src/mocks/staff-mock.test.ts

| Test definition | Classification | Action |
|---|---|---|
| locks every run action for an Admin-only account, with the reason | PERMANENT REGRESSION | keep |
| leaves the server gates as they are for Staff | PERMANENT REGRESSION | keep |

### web/src/mocks/staff-sim.test.ts

| Test definition | Classification | Action |
|---|---|---|
| never starts a Scheduled session, and starts a Ready one only when the robot is free | PERMANENT REGRESSION | keep |
| takes the robot at Start after End Early and an on-site confirmation | PERMANENT REGRESSION | keep |
| needs a reason to end early | PERMANENT REGRESSION | keep |
| enters NeedsAssistance on a navigation failure and recovers with a new leg id | PERMANENT REGRESSION | keep |
| holds only at a POI, and Next closes the visit exactly once | PERMANENT REGRESSION | keep |

### web/src/routes/admin/admin-workflow.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| explains why a Tour cannot be finalized, then finalizes it after the last approval | PERMANENT REGRESSION | keep |
| asks for a reload when the roster changed during review | PERMANENT REGRESSION | keep |
| keeps a running Tour read-only | PERMANENT REGRESSION | keep |

### web/src/routes/public/PublicHomePage.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| sends a signed-out visitor to sign in, not to a removed visitor route | PERMANENT REGRESSION | keep |
| sends an operator to operations, not to administration | PERMANENT REGRESSION | keep |
| sends an admin to administration | PERMANENT REGRESSION | keep |
| keeps the section anchors the navigation points at | PERMANENT REGRESSION | keep |
| explains the remote tour without suggesting students follow the robot in person | PERMANENT REGRESSION | keep |
| reveals the new theme from the theme button when view transitions are available | PERMANENT REGRESSION | keep |

### web/src/routes/staff/staff-workflow.test.tsx

| Test definition | Classification | Action |
|---|---|---|
| keeps live state and missing telemetry visible in the compact status card | PERMANENT REGRESSION | keep |
| offers each session the next step its state calls for | PERMANENT REGRESSION | keep |
| keeps Start disabled with the server reason while the robot serves another session | PERMANENT REGRESSION | keep |
| starts a Ready session only after on-site confirmations and a dialog | PERMANENT REGRESSION | keep |
| ends a session early only with a confirmed reason, as Cancelled | PERMANENT REGRESSION | keep |

