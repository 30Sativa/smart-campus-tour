# CampusTour scope summary — SRS v0.2

Owner-authorized target adopted 2026-10-27; SRS v0.2 aligned to Phiếu v1.9.
[Detailed scope](campus-tour-scope.md) and
[gap/source register](srs-v02-backend-gap-register.md) control implementation.
Prior Review 1 text remains in Git at `e70fb52`; no advisor approval is implied.

- Five PWA roles: Admin (account/config/admin audit), Technical Staff
  (map versions/import/physical verification), Staff (content, route, row review,
  invitations, scheduling and assigned operation), Representative (own group),
  Viewer (invitation/session only). Operator is assigned Staff; attendant is
  a physical participant without a separate workspace.
- One surveyed indoor floor and one real AMR. Prospective high-school students
  join remotely through a Representative. Benefits are hypotheses to validate.
- Map/POI/route/content reference exact revisions. Technical Staff confirms
  tested tuples; Staff cannot confirm. Movement changes need retest; old retained
  tested versions remain valid. Scheduling and READY enforce this on the server.
- Reserve one robot for 15min before + longest tested allowed path +15min after.
  Explicit Staff Operator assignment, no pending row/email decisions at READY.
  Start from READY at/after published time checks safety and claims once before
  the first leg is sent.
- One registration per Representative/Tour, ≤10 viewing rows, closes 48h before
  start. Staff reviews rows/email requests within 2 working days. Added rows
  await review; unchanged accepted rows retain codes/sessions. Email correction
  is Representative request + Staff decision; old credential survives pending.
- Resend keeps code/session; reissue/revoke invalidates old access. One session,
  same-device reconnect ≤2min, server invalid-code throttling. Delivery is
  separate from participation. Shared-screen rows do not list mere spectators.
- Viewer Q&A matches only approved bank entries. Provider supports drafting.
  Instance queue: 8 executing /20 total; Busy only above total; 95% ≤10s includes
  waiting at defined load. Session rate limits alone do not implement this.
- Live/fallback authorization is continuous and copied URLs convey no right.
  Revoke/reissue stops playback ≤10s. During fallback mute live audio/pause dwell,
  keep actual-robot map and return at POI. End Early blocks all media and Q&A,
  retaining Ended/Result only.
- Physical gate and two people are mandatory before external viewers. Heartbeat
  stop ≤3s; movement requires fresh telemetry, resolved command state, no incident,
  console connected and attendant present. CANCELLED/ACK is not physical stop.
- Mandatory research at 1/5/10/20 robots ×5Hz, 30s warm-up, 5min, ≥3 repetitions,
  two baselines; p95 <1s is evaluated per tested load before dashboard render.
  No advance claim for N=20. Publish 40-point capacity only after the declared
  two-Tour/viewer/Q&A test passes.
- **Pending:** F-14, conflicting branch cutoff, YAML/frame mapping, M2 command
  transport, invalid-code defaults, voice-provider terms, research
  delivery/freshness thresholds and physical evidence.

Current delivery implements TechnicalStaff account create/list/lifecycle,
login/refresh and isolation of its role only. All other target changes remain
staged in the backend gap register; current Admin business APIs are recorded as
implementation mismatches. HTTPS Fleet Sync ADR-0019 stays telemetry-only.
