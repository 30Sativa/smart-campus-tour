# ADR-0075: Staff switches Viewers to the fallback video, kept in step by POI

- **Status:** Proposed 28/11/2026 by team member Thành; stage 1 implemented (switch, history, Viewer notice and label).
  Stage 2 point 7, first half (Staff set the POI marks with the video), implemented 28/11/2026; seeking on the relay and
  point 8 are not. Needs the repository owner's acceptance.
- **Partially supersedes:** ADR-0063 decision 2 (the Viewer's browser switched to the fallback video by itself whenever
  the live picture was lost, played it from the start in a loop and played its sound).
- **Keeps:** ADR-0063 decisions 1 and 3–6 (Cloudinary `authenticated` asset, relay path `fallback-{tourId:N}`, token
  kind `F`, reaper, End Early ends it, the browser never learns the address).
- **Related:** FR-25/FR-38, `campus-tour-scope.md` §6 ("During RUNNING fallback: mute live audio … return to live at a
  waiting POI and replay that POI guide").

## Context

When the Quest headset loses its picture, every Viewer's browser switched on its own, each at its own moment. A
flickering headset made the picture and the label change back and forth. The recording always started at its first
second, so it showed a corridor the robot had left long ago. Staff could not tell what Viewers were seeing, and
nothing in the Tour history said that Viewers had watched a recording.

Losing the headset picture is not a safety event: the robot, its map position, the approved narration and Q&A keep
working. Only the picture is missing.

## Decision

1. **Staff decides, not the browser.** A RUNNING Tour has a video mode, `LIVE` (default) or `FALLBACK`. Only the
   Tour's Operator changes it, with `PUT /api/staff/manage/tours/{id}/video-mode` `{mode, reason}` (reason 1–500
   characters). Switching to `FALLBACK` needs an uploaded fallback video (ADR-0063 decision 1). Asking for the mode
   the Tour already has is 409 `VIDEO_MODE_INVALID`, as is any request outside RUNNING. No automatic switching in
   either direction: the console offers "Chuyển sang video dự phòng" and, while on the recording, "Chuyển về trực tiếp".
2. **History.** Every switch writes a Tour event, `VIDEO_FALLBACK_STARTED` or `VIDEO_LIVE_RESTORED`, with the actor,
   the time and the reason (`ReasonNote`). The mode is the newest of these two events; a Tour with none is `LIVE`.
   There is no new column: the mode survives an API restart because it is the history.
3. **Who may watch the fallback.** ADR-0063 decision 3, plus: the Tour's mode is `FALLBACK`. Switching back to `LIVE`
   therefore makes the relay's reaper cut every open fallback connection within its 5 s check, copied URLs included.
4. **Viewer.** The Student view carries `progress.videoMode` and `progress.videoModeSince`. On `FALLBACK` the page
   first shows a notice ("Hình trực tiếp tạm gián đoạn. Đang chuyển sang bản ghi hành trình…") for a few seconds, then
   plays the recording with the label **"Bản ghi hành trình – không phải trực tiếp"**. On `LIVE` it shows a short
   "Đã trở lại hình trực tiếp" notice. A lost live picture in `LIVE` mode shows the reconnecting message, never the
   recording.
5. **Sound.** The recording always plays muted. The approved POI narration (ADR-0060) keeps playing on the page as
   usual, so the guide's words follow the POI the robot is really at.
6. **Back to live.** The console recommends switching back while the robot stands at a POI, so Viewers hear that POI's
   narration again with the live picture. It is a recommendation, not a check.

### Stage 2 (marks implemented; relay seek not implemented)

7. Staff enter, at upload, the start second of each POI in the recording.
   **Implemented (marks only):** the create/update Tour `configuration` takes `fallbackVideoMarks
   [{revisionStopId, startSeconds}]` and GET Tour returns them in recording order. They are stored without a schema
   change as a `FALLBACK_VIDEO_MARKS_SET` TourEvent (actor = Staff who saved; DataJson names the video URL and the
   marks). Only the newest such event counts and only while its URL is still the Tour's `fallbackVideoUrl`, so a new
   video starts without marks. Rules: a mark needs a fallback video, one mark per stop of the Tour's route revision,
   0–86 400 s, at most 100; stops may be left without a mark (not in the recording), and the order is not forced to
   follow the stop order because a voting route may be recorded in another order. Omitting the field on update keeps
   the marks. In the form Staff type phút:giây per stop, or play the file just uploaded locally and take the current
   moment; a mark past the end of that file blocks saving. Not implemented yet: on `FALLBACK` the recording starts at the
   segment of the POI the robot is at (or driving to) and jumps when the robot reaches the next POI. The relay must
   then publish from a given second (ffmpeg `-ss`) and restart on a POI change.
8. Only then the console adds "Ở lại bản ghi đến hết Tour". Until stage 2, Staff should use the fallback only for a
   short gap and switch back as soon as the headset works again, because the recording still starts at its beginning.

## Rejected alternatives

- **Automatic switching on picture loss (ADR-0063).** A flickering headset makes the picture jerk and the label change
  constantly; each Viewer switches at a different time; Staff do not know what Viewers see.
- **One looped recording for the whole Tour.** The picture drifts away from the robot's real place on the route.
- **Second-accurate sync.** The robot's speed differs from the rehearsal run; POI granularity is enough.

## Consequences

- One API call and one Tour event per switch; the mode read is one indexed query on `TourEvents` per Student view poll
  and per fallback relay check.
- Viewers who never get a switch never see the recording, even if their own connection to the relay fails; they see the
  reconnecting message.
- The Staff detail returns `video {mode, since, actorName, reason, hasFallbackVideo}` for a RUNNING Tour.
- Not verified here: the relay on the real host, reaper timing after switching back, browser autoplay of the muted
  recording. The hardware test must cover them.
