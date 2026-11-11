# ADR-0052: The Quest camera runs only while someone needs it

- **Status:** Implemented and deployed 09/11/2026 (#253, API documentation #254), proposed by team member Thanh; the
  11/11/2026 review asked for this line to show that it is in use. No separate owner acceptance is recorded. The robot
  side is opt-in (`QUEST_CONTROL_URL` empty = the camera runs whenever the Quest is plugged in, as before).
- **Related:** ADR-0019 (Fleet Sync, robot authentication, single API instance), ADR-0045 (in-memory Fleet Head v1,
  the same pattern), `robot/quest-stream/README.md` ("Chỉ bật camera khi cần", "Phát ra Internet").

## Context

`robot/quest-stream` streams the Quest 3 picture through MediaMTX on the NUC and, for the deployed site, a public
MediaMTX relay on the EC2 host. Until now it streamed whenever the headset was plugged in: the headset kept encoding
and draining its battery, the NUC kept decoding, and anyone holding the public WHEP URL could watch the room at any
time, including outside Tours. Viewer bandwidth is billed only while a browser plays the stream.

## Decision

1. **Who needs the camera.** A robot's camera is wanted while a Tour with `AssignedRobotId` = that robot is
   `RUNNING`, or while a Staff lease on that robot has not expired. Nothing else switches it on.
2. **Staff lease, in memory.** `POST /api/staff/manage/robots/{robotCode}/camera-lease` (Staff role) keeps the camera
   on for `FleetCamera:LeaseSeconds` (default 120). The pre-start check page renews it every 30 s while it is open
   and visible, so the preview is ready before Start and the camera goes off about two minutes after the last page
   closes. Leases and the robot's last poll live only in API memory (an API restart forgets them; the next renewal
   restores them). No SQL write, TourEvent or audit row.
3. **Robot poll.** `POST /api/fleet/camera/v1/poll` (Fleet Robot scheme, no body, `FleetSync` rate-limit budget)
   answers `{wanted, reason: TOUR_RUNNING|STAFF_WATCHING|IDLE, pollSeconds}`. `quest-stream` asks every
   `pollSeconds` with the robot's Fleet Sync identity and stops scrcpy/FFmpeg when not wanted; the Quest is not
   touched at all while idle.
4. **Fail safe for Tours.** When the backend does not answer, the robot keeps its last answer for
   `QUEST_CONTROL_GRACE` (60 s), then `QUEST_CONTROL_FAILSAFE=on` (default) keeps capturing: a backend outage must not
   black out a running Tour. A site that prefers privacy over availability sets it `off`.
5. **Viewers.** Every web player can be paused, and stops pulling the stream while its tab is hidden; both close the
   WebRTC connection, so no relay bandwidth is spent on a picture nobody sees.

## Consequences

- Switching on takes about 20–30 s (scrcpy start + FFmpeg probing); the start-check page explains the wait.
- Who may watch the public WHEP URL is unchanged: reading `quest` on the relay is still open while the camera runs.
  Token-gated reading is a separate decision.
- Same single-API-instance limit as Fleet Sync and Fleet Head (ADR-0019, ADR-0045).
