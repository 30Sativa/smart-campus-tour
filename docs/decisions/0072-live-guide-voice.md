# ADR-0072: The Operator speaks live to the Viewers (push-to-talk)

- **Status:** Proposed 25/11/2026 at the request of the group ("không muốn kiểu staff gửi đoạn ghi âm mà thay vào đó
  là đàm thoại trực tiếp … có nút nhấn vô để nói và bên người xem nghe được ngay"). Backend, web and relay config
  implemented. Needs the repository owner's acceptance and a test on real devices and the real relay (microphone,
  autoplay on phones and projector PCs, latency).
- **Revises:** ADR-0070 rule 2 and rule 6 for the Operator's voice: the live console no longer records clips; the
  Operator speaks live instead. Text messages, Viewer text replies and the clip API stay as ADR-0070 describes them
  (clips already sent still play).
- **Related:** ADR-0055 (stream relay, MediaMTX HTTP auth and reaper), ADR-0063 (per-Tour relay path
  `fallback-{tourId}`), ADR-0070 (talk window, who is a Viewer), `docs/architecture.md` §7.2.

## Context

ADR-0070 lets the Operator send a recorded voice clip of up to 30 s. The group wants the Operator to talk to the
group as a guide does: hold a button, speak, and the Viewers hear it at once. The stream relay (ADR-0055) already
carries WebRTC with backend-checked tokens and a reaper that cuts sessions whose access ended.

## Decision

1. **Path.** One relay path per Tour, `voice-{tourId:N}` (32 lowercase hex characters), `source: publisher`, with no
   SRT passphrase and no on-demand command. The relay accepts no other `voice-` form.
2. **Who publishes.** Only `Tours.OperatorUserId`, while the ADR-0070 talk window is open (`RUNNING`, or
   `SCHEDULED`/`READY` from 15 minutes before the start). `GET /api/staff/manage/tours/{id}/talk/voice-access`
   returns `{url, token, expiresAt}` with `url` ending `/voice-{tourId}/whip` and a token of kind `P`; 403 for another
   Staff, 409 `TALK_OPENS_LATER`/`TALK_CLOSED` outside the window, 409 `VOICE_NOT_AVAILABLE` when the relay is not
   configured.
3. **Who listens.** Any Student session of that Tour, including shared-screen rows, so a projector room hears the
   guide: `GET /api/student/tours/{tourId}/talk/voice-access` (session cookie, exact-origin check) returns a token of
   kind `L` and a `/whep` URL, under the same window.
4. **Relay check.** `/api/internal/stream-relay/auth` allows `publish` of a voice path only with a `P` token for that
   Tour whose holder is still its Operator in the window, and `read` only with an `L` token whose session is still in
   the Tour in the window. The reaper's `recheck` ignores the token's expiry and keeps a session only while those
   conditions hold, so ending the Tour, a new Operator or a revoked invitation cuts the voice within 5 s.
5. **Push-to-talk.** The Operator holds the button (pointer, Space or Enter); a tap shorter than 350 ms latches the
   microphone on until the next tap. The first press asks for the microphone (echo cancellation, noise suppression,
   automatic gain) and connects; the connection then stays open and only the track is switched on while held, so
   later presses are heard immediately. It hangs up when the page closes or the channel closes.
6. **Viewers.** The Student page connects receive-only while the channel is open, retries every 3 s rising to 10 s
   while nobody is on air (the relay answers 404), follows the page's mute, shows "Hướng dẫn viên đang nói" while
   sound comes through, and shows "Bật tiếng hướng dẫn viên" when the browser blocks autoplay.
7. **One-way.** Viewers still answer in text only (ADR-0070 rule 2). Nothing is recorded or stored.

## Consequences

- A second public interface on the relay: the backend tokens `P`/`L` and the `voice-` path, recorded in
  `docs/architecture.md`. The relay must be reinstalled with `robot/quest-stream/relay/install-relay.sh`.
- Viewers keep a WHEP retry going during the talk window while the Operator has not pressed the button yet: a small,
  bounded load on the relay and the backend auth hook.
- Latency, echo and autoplay depend on the devices and network; they are not proven by tests.
- Not done: Viewer voice, talking to one row, recording the guide's voice.
