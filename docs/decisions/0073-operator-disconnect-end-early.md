# ADR-0073: backup Staff End Early and group notices

Status: owner-authorized task, 27/11/2026, Phiếu v1.12 §3.2.c as quoted in the task.

Another Staff may End Early only after the assigned Operator console has not contacted the API for at least
`Tours:OperatorDisconnectEndEarlyMinutes` (default 5, positive). Admin has no running-tour control. Other controls
remain Operator-only. This scoped business rule succeeds ADR-0043's Operator-only End Early; older Report 3/F-14
text is left for the group to reconcile. ADR-0049's safer-action rule and the existing robot-stop semantics stay intact.

Web: the existing End Early button follows allowedActions.endEarly; no separate backup button or countdown in V1.

SQL Server changes `Tours.RowVersion` on every UPDATE. v1.26 therefore adds `TourOperatorPresence(TourId, LastSeenAt)`
(one nullable DATETIMEOFFSET(3), FK/PK TourId), instead of a column on Tours. No process-memory fallback is used.
Start stamps presence in its transaction. The existing detail GET records only the assigned Operator of a RUNNING
Tour, at most once per 10 seconds, in a short explicit persistence transaction before opening the detail snapshot.
Both that write and End Early acquire the shared Tour root lock first. End Early reads presence after the lock;
committed reconnects therefore win against stale browser observations. A missing/null timestamp on a legacy Tour
allows backup Staff immediately; read models expose disconnectedSince = null with no timestamp and the server's
allowedActions.endEarly disambiguates this case. Restart never resets or extends the window.

End Early queues one TOUR_CANCEL_NOTICE_REQUESTED audit containing registration IDs with active APPROVED/ACCEPTED rows,
in the same transaction as TOUR_ENDED_EARLY and its request receipt. It does not revoke invitations or close sessions.
The request's DataJson records kind = ENDED_EARLY for End Early or CANCELLED for CancelTour/AutoCancel; the worker selects
the template only from this committed flag. Legacy requests without a kind, or with an unsupported kind, record
FAILED/NOTICE_KIND_INVALID without sending or inferring from Tour fields. Disabled email
records FAILED/EMAIL_DISABLED without failing End Early. No technical reason, access code, Tour link or other row's
data is included. Existing cancellation behavior is unchanged.

The additive patch is idempotent and requires v1.25 or v1.26. The v1.25 snapshot remains immutable. Runtime gets
SELECT/INSERT and column UPDATE(LastSeenAt) only; deployment gates require the new structure and grants. No live
or shared database is modified by implementation or verification.

## Update 2026-11-28

### Context

Phiếu v1.12 §3.2.c, Report 3 BR-17/21 and Report 4 §1.3 Table 6 require a controlled way to end a
RUNNING Tour if its assigned Operator console disappears. Admin has no running-Tour authority.

### Decision

The assigned Operator may End Early. Another Staff member may do so after at least five minutes of
Operator-console disconnect; otherwise return `OPERATOR_STILL_CONNECTED`.
Persist contact in `TourOperatorPresence`; read it under the same Tour root lock used by the heartbeat writer.
`TourOperatorPresencePolicy` and `Tours:OperatorDisconnectEndEarlyMinutes` implement the configured interval,
default 5. Check RUNNING before the backup-presence rule; a COMPLETED Tour returns `TOUR_STATE_INVALID`.
Audit actor, time, reason and backup metadata `byBackupStaff`, `operatorUserId`, `operatorLastSeenAt`.
Queue `kind: "ENDED_EARLY"` for the generic group email in the same transaction; Cancel/AutoCancel queue
`"CANCELLED"`. The worker reads the committed kind, never infers it from Tour fields.
Admin and other non-Staff roles remain forbidden; no other Operator control is opened.

Web: the existing End Early button follows `allowedActions.endEarly`; no separate backup button or countdown in V1.

### Rejected alternatives

- Admin override: conflicts with BR-17 and the role boundary.
- Automatic End Early on disconnect: a transient outage would irreversibly terminate a class's Tour.
- In-memory presence or a heartbeat column on Tours: restart changes the window or heartbeat UPDATE changes RowVersion.
- Inferring the email kind from mutable Tour fields: can select the wrong template and disclose a technical reason.

### Consequences

The backup path is durable and audited, but normally waits five minutes and writes periodic presence.
Email delivery is post-commit and can fail; no email, state or ACK proves a physical robot stop.
A missing/unsupported notice kind records `FAILED/NOTICE_KIND_INVALID` without sending.

### Status / Notes

Implementation checked on main `1b586a70`; cited in Report 4 §1.3 Table 6.
Two code exceptions differ from the minimum-evidence rule above: null/missing presence currently allows backup
immediately, and configuration accepts any positive interval, including below five.
The Phiếu rule is retained and [change #470](https://github.com/30Sativa/smart-campus-tour/issues/470) tracks alignment.
The quoted web sentence describes the existing button's availability gate. In current
`web/src/routes/staff/LiveOperationsPage.tsx`, rendering also requires `running && isOperator`;
`allowedActions.endEarly=true` alone does not reveal a button to backup Staff. This docs update does not change web.
