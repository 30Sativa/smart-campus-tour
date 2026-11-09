# ADR-0053: Quick Tours start when they are ready

- **Status:** Accepted by the repository owner, 2026-11-09. No advisor approval is recorded.
- **Supersedes:** ADR-0050 decisions 3 to 5 (a short-notice Tour on a fixed shift, and the option being off while unset). ADR-0050 decisions 1 and 2 (early Start inside the shift, `allViewersJoined`) and its registration rules for a short-notice Tour stay.
- **Amends:** ADR-0035 (the robot is held for a whole shift) and ADR-0042 §7 (the lower bound of `withinStartWindow`), for quick Tours only.
- **Schema:** none. `Tours.IsShortNotice` (v1.19) marks a quick Tour.

## Context

ADR-0050 let Staff create a Tour at short notice, but the Tour still had to pick a fixed shift and wait for its time; Start opened at most 10 minutes before it. A Tour created at 13:30 for a demonstration waited until the next shift at 16:05, although the people it was for were already there. Choosing a date and shift for a Tour meant to run now was the wrong question.

ADR-0050 rejected starting at any time once READY for two reasons: outside its hold the run could take the robot from another Tour, and viewers coming at the published time would miss it. `allViewersJoined` answers the second before the published time. The first is answered if the Tour's robot hold begins when it is created.

## Decision

1. **The same create call, fewer constraints.** A quick Tour is created with the usual `POST /api/staff/manage/tours`, with a route revision, robot, Operator, capacity and a required `shortNoticeReason`, and no `scheduledStartAt`: no date, no shift, no 72-hour lead. The slot list no longer judges shifts for it.
2. **Latest Start, not start time.** Its `ScheduledStartAt` is the latest Start: creation plus `Tours:ShortNoticeMinLeadMinutes` (the ADR-0050 key, kept; 30 minutes when unset), on the next whole minute. Quick Tours are always available: there is no on/off switch and no `SHORT_NOTICE_DISABLED`. It is the published time viewers are given, and the usual late limit and automatic cancellation (ADR-0047) apply after it.
3. **A hold from creation.** The robot is held from creation until a run begun at the latest Start would end: `[now, latest Start + expected duration + 15 minutes]`. The hold is checked for overlap with every other hold of the robot. No shift is needed, but an Admin block of a day or of a shift that overlaps the hold refuses it, and the route may be no longer than the longest shift holds.
4. **Start when ready.** Start opens when the hold opens, at creation. Before the published time `allViewersJoined` still needs every accepted row in the waiting room; the Tour must still be READY with no undecided row, and every other Start check applies unchanged.
5. **The ADR-0050 registration rules.** A quick Tour is short notice: no 48-hour or 24-hour mark, registration closes at the latest Start or when Staff marks READY, and the T-24h job skips it.
6. **Staff sees it where Tours already are.** The create form asks for the kind first; the quick form has no date or shift and explains the hold, Start and deadline. In the shift calendar a quick Tour is marked "Nhanh" at its latest Start (usually in "Ngoài ca"), the list and detail label it, and a shift its hold overlaps takes no new Tour. `GET .../tours/shifts` returns `quickTourWaitMinutes` for the form's wording.

## Alternatives rejected

- Keep a short-notice Tour on a shift with an earlier Start window (the first draft of this decision): Staff still chose a date and shift for a Tour meant to run now.
- Start at any time with no deadline: nothing would release a robot held by a Tour nobody starts, and viewers would have no time to be given.
- A separate endpoint, availability query, list filter and calendar tab for quick Tours (an earlier draft of this decision): more surface than "a Tour with fewer constraints" needs. Create refuses with the reason when the robot is not free.
- Move the hold at Start: a second reservation write and overlap check in the Start transaction, for no gain once the hold starts at creation.
- Let Staff add invitation rows to a quick Tour: a change to who owns rows (BR-11). A quick Tour with no accepted row can be marked READY and started; anything more needs its own decision.

## Consequences

- No schema change and no new endpoint. `scheduledStartAt` on create may be null with `shortNoticeReason`; `quickTourWaitMinutes` on the shifts read. `shortNotice` on `/slots` and `shortNoticeMinLeadMinutes` on the slots response are removed.
- A short-notice Tour created under ADR-0050 keeps its whole-shift hold; Start opens when that hold opens, at the shift opening, still inside it.
- The configured wait is both how long Staff has to fill and start the Tour and how long the robot may sit held. The default is 30 minutes, the value `appsettings.json` already carried; a server that needs longer sets the key.
- Keeping the option off by default was rejected: it guarded nothing that the robot hold, Admin blocks and Start checks do not already guard, and it left the feature hidden until someone found the key.
- Invitation emails still print the published time, which for a quick Tour is its latest Start. Wording such as "starts when everyone has joined" is left for a later change.
- No physical behavior changed; robot-side safety evidence remains as ADR-0049 records it.
