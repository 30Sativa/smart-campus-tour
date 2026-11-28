# ADR-0063: A Tour's fallback video plays only through the relay

- **Status:** Proposed 17/11/2026; implemented in code. The relay path is checked only on the real relay host (MediaMTX
  `runOnDemand` with ffmpeg) and with a real Cloudinary account. Needs the repository owner's acceptance.
- **Partially superseded by:** ADR-0075 (decision 2: the Operator switches Viewers to the fallback video; the
  browser no longer switches by itself, and the recording plays muted).
- **Follows:** ADR-0055 (token-gated relay), ADR-0034 (fallback video stays editable on a Tour).
- **Supersedes:** ADR-0009 §6 on watching the fallback video after End Early (SRS v0.2 FR-48: after End Early only
  Ended/Result remains).
- **Related:** FR-25/FR-38/FR-48, NFR-SEC-02, AC-07, `campus-tour-scope.md` ("Authorize live/fallback at initial and
  continued playback… including existing playback and copied URLs").

## Context

`Tours.FallbackVideoUrl` was a typed HTTPS link. The Student session handed it to the browser (only after End Early),
which played it with a plain `<video>`. Anyone with the link could watch it for ever, so revocation and End Early could
not take it away, as SRS v0.2 requires within 10 s "including copied URLs". During RUNNING, when the live picture is
lost, no fallback played at all.

Cloudinary (the chosen media store) has expiring, token- or cookie-based delivery only on its Advanced plan and above,
with a custom domain. On the Free plan an `authenticated` asset needs a signed URL, but the signature never expires: a
copied signed URL keeps working.

## Decision

1. **Storage.** Staff uploads the video straight from the browser to Cloudinary with a signature from
   `POST /api/staff/manage/tours/fallback-video-upload`: delivery type `authenticated`, a fresh public ID
   `smartcampus/tours/fallback/{guid}` every time (no upload overwrites a stored reference), and an eager
   `c_limit,h_720,w_1280,vc_h264:baseline:3.1,ki_2.0` MP4 (H.264 Baseline has no B-frames, which WebRTC cannot carry; a
   key frame every 2 s lets a new viewer start fast). The Tour stores only the unsigned reference
   `https://res.cloudinary.com/{cloud}/video/authenticated/{publicId}.mp4`, which plays nowhere. The API secret stays in
   `Cloudinary:*` on the API; the video never passes through the API.
2. **Playback through the relay.** The fallback video is the relay path `fallback-{tourId:N}`. The Student page asks
   `GET /api/student/tours/{id}/fallback-access` for `{whepUrl, token, expiresAt}` (token kind `F`, same format and
   life as ADR-0055) while the Tour is RUNNING and has a video, and plays it when the live picture is lost or missing,
   labelled as degraded mode with the live audio muted, until the live picture plays again.
3. **Who may watch.** Exactly the live rules' session part: an open, unexpired, unrevoked session on an active ACCEPTED
   row, of that Tour, which is RUNNING. Not tied to a robot. A live token never opens a fallback path and a fallback
   token never opens the camera.
4. **Revocation.** MediaMTX asks the backend on every connection; the existing reaper rechecks every open WebRTC
   session every 5 s and kicks the ones the backend refuses, so End Early, a revoked session or a completed Tour ends
   the video for everyone, copied URLs included (a URL without a valid token is refused).
5. **Publishing.** The first authorised viewer makes MediaMTX run `mediamtx-relay-fallback` (`runOnDemand`). It asks
   `GET /api/internal/stream-relay/fallback-source?key=…&path=…` for the signed Cloudinary URL (only while the Tour
   is RUNNING, only for a reference an upload made, so the relay host never fetches a typed address), then ffmpeg
   publishes it in a loop over RTSP on `127.0.0.1:8554`, copying the video and turning the audio into Opus. The backend
   allows that publish only for user `fallback` with the relay key. MediaMTX stops ffmpeg 10 s after the last viewer.
6. **The browser never learns the video's address.** The session answer carries `hasFallbackVideo` instead of a URL.
   A Tour whose stored link is not an upload (an older typed link) plays nothing; the Staff form says so.

## Consequences

- One ffmpeg process per Tour whose fallback is being watched, on the relay host; little CPU (video copied).
- EC2 egress grows by the fallback's bitrate per viewer, like the live picture. Cloudinary bandwidth is spent once per
  ffmpeg start, not per viewer.
- The video must be at most 100 MB (Free plan) and needs a few minutes after upload before the 720p version exists;
  until then the relay cannot start it and the viewer sees "chưa mở được video dự phòng".
- After End Early students see only the end screen; nobody watches the fallback video any more (ADR-0009 §6 replaced).
- Same single-API-instance and backend-down behaviour as ADR-0055.
- Not verified here: MediaMTX on the relay host, ffmpeg reading the signed URL, Cloudinary's eager transformation on a
  real account. The hardware test must cover them.

## Update 2026-11-28

### Context

Report 4 §1.3 Table 7 cites this together with ADR-0055; copied fallback URLs must obey the same
invitation/session access boundary as live video.

### Decision

Keep the implemented Cloudinary authenticated asset and signed-source handoff behind MediaMTX.
Playback uses `fallback-{tourId:N}`, a deterministic per-Tour path, and token kind F bound to the Tour/session.
Only eligible sessions of a RUNNING Tour receive fallback access; End Early closes entitlement.
The live camera still uses ADR-0055's configured robot path, not a random per-Tour live path.
Session polling is 5 seconds RUNNING / 30 seconds waiting; the relay reaper independently checks open sessions
every 5 seconds. The required revoke/reissue stop bound is 10 seconds, to be verified in real browsers.

### Rejected alternatives

- Sending a permanent Cloudinary asset URL to the browser: bypasses session revocation and can be copied.
- Per-viewer robot uploads: increases campus uplink use without improving authorization.

### Consequences

One on-demand ffmpeg process is needed per active fallback Tour and relay egress grows with viewers.
Backend/reaper outages or missing relay query evidence prevent a blanket claim of the revocation bound.
Fallback is clearly labelled and does not fabricate robot pose or establish physical stop.

### Status / Notes

Report 4 records the paired media decision as Accepted; source/auth/reaper integration exists on main `1b586a70`.
Hardware, Cloudinary and copied-URL timing evidence are not supplied by this docs-only update.
The technical path correction and its reason are recorded in the ADR-0055 update.
