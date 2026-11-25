# ADR-0070: The Operator talks with the Viewers (Tour talk)

- **Status:** Proposed 25/11/2026 at the request of the group ("đàm thoại staff với trang học sinh"); backend and web
  implemented. Needs the repository owner's acceptance and a test on real devices (microphone, autoplay on phones and
  projector PCs).
- **Revises:** ADR-0065 "Out of scope: … a Staff-to-Viewer channel", for the assigned Operator only.
- **Related:** ADR-0045 (in-memory head commands, one API instance), ADR-0065 (Viewer vote), ADR-0011 (Student data
  only for the Tour), `docs/architecture.md` §3.2.3 (Student session cookie) and §7.1 (private Q&A window).

## Context

With the vote (ADR-0065) the Viewers choose the next POI, but nobody on the campus side can speak to them: the live
stream carries no sound, narration is prepared in advance and the AI assistant answers privately. The group wants the
Operator to talk with the group during the Tour, e.g. "Các bạn muốn đi điểm nào tiếp theo?" before a vote closes, or a
few words more about the POI the robot stands at, and to hear back from them.

## Decision

1. **Who.** Only `Tours.OperatorUserId` sends to the Viewers. Every Staff may follow the conversation read-only on the
   live console. A Viewer is an invited roster row with an open Student session, by the same rules as Q&amp;A and the
   vote; a shared-screen row is one Viewer.
2. **What.** The Operator sends text (at most 500 characters), a recorded voice clip (at most 30 s and 1 MB: WebM/Opus,
   Ogg, MP4/AAC, MPEG), or both, to **every** Viewer of the Tour. A Viewer answers in text only (at most 500
   characters, 6 messages a minute per row). A Viewer's message is read only by Staff; no Viewer ever sees another
   row's message or identity. No Viewer audio is recorded: two-way voice from many browsers and projector rooms needs
   echo control and a media relay this project does not have.
3. **When.** The channel takes messages while the Tour is `RUNNING`, and in the waiting room from 15 minutes before the
   scheduled start of a `SCHEDULED`/`READY` Tour, the window of Q&amp;A (`TALK_OPENS_LATER` earlier, `TALK_CLOSED` after
   the end). Reading stays possible.
4. **Storage.** In memory on the one API instance, like the head command queue (ADR-0045) and the Q&amp;A gate: per Tour
   the newest 300 messages and 40 clips, forgotten 6 hours after the last message. A restart starts a new epoch and
   the conversation is gone. Nothing is written to SQL, so there is no schema change, no retention task and the
   ADR-0011 data rules are not extended: the content is not kept after the Tour.
5. **Transport.** HTTP polling every 2 s (30 s while the channel is closed), not SignalR: the Student page has no hub
   today and a spoken exchange tolerates two seconds. `GET …/talk?epoch=&after=`; `POST …/talk`; `GET …/talk/{id}/audio`
   under `/api/staff/manage/tours/{id}` (JWT, Staff) and `/api/student/tours/{tourId}` (session cookie with the origin
   check). Clips are fetched as blobs because both requests are authenticated.
6. **Playback.** A clip that arrives after the Student page loaded plays by itself once, when the browser allows it;
   otherwise its button reads "Bấm để nghe". The live page shows the conversation in its own tab "Hướng dẫn viên" with
   an unread count; the waiting room shows it above the AI assistant.

## Consequences

- The Operator can ask the group what they want and add spoken commentary; the vote stays the only way the next POI is
  chosen (ADR-0065 rule 7 is unchanged).
- Running more than one API instance loses messages between instances, as head control already does; a shared store
  (or SQL) would be the next step if that changes.
- Voice clips are recorded in the Operator's browser; the microphone permission is asked on the first "Nói".
- Not done: Viewer voice, private Staff replies to one row, moderation tools, a transcript after the Tour.
