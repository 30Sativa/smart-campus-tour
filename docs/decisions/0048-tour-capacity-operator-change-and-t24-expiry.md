# ADR-0048: Tour capacity, Operator change, the T-24h expiry and the invitation code guard

Date: 2026-11-08
Status: accepted by the owner (review batch of 08/11/2026); implements SRS v0.2 BR-05, BR-26, FR-22, FR-23, FR-40, FR-45, AC-14 and section 7.3 decisions 8 and 10

## Context

A Tour had no seat limit, so the gap register's "no capacity exists" stopped being true once BR-26 was confirmed.
PENDING rows and email-change requests waited forever and could block READY indefinitely. Staff could not hand a Tour to
another Operator, and Admin could deactivate an account a Tour still depended on. The invitation code endpoint only had
a 60 requests/minute/IP limiter.

## Decision

### Schema v1.18

One additive patch, `upgrade-v1.17-to-v1.18-capacity-and-expiry.sql`, plus the v1.18 snapshot:

- `Tours.Capacity INT NOT NULL`, default 20 (existing Tours receive 20), `CK_Tours_Capacity` 1..40.
- `EXPIRED` joins `CK_RosterRows_ParticipationState` and `CK_RosterEmailChangeRequests_State`.

No expiry timestamp column: the moment is `ScheduledStartAt - 24h` by definition, and the audit row records when the job
actually ran. Runtime grants do not change.

### Capacity (BR-26, FR-22, AC-14)

`Tours:MaxCapacity` defaults to 20 and may only be raised to 40 once NFR-CAP-01 passes. `capacity` is required when
creating a Tour and validated against that setting.

Held seats are the Tour's active PENDING and ACCEPTED rows. Create, add-row and replace-roster count them under the Tour
root lock every registration writer already takes first, and fail with 409 `TOUR_CAPACITY_EXCEEDED` carrying the seats
left. A write that does not add seats is never refused, so a legacy Tour already above 20 stays editable. Rejected,
removed and expired rows return their seat.

Staff may change capacity while the Tour is SCHEDULED or READY and not started (`POST .../{id}/capacity`). Below the held
seats is 409 `CAPACITY_BELOW_HELD`. Audited with `requestId` and `expectedRowVersion`.

### Operator change and account deactivation (section 7.3, decision 8)

`POST .../{id}/operator` replaces the Operator of a SCHEDULED/READY Tour not yet started; READY stays READY. The new
account must be an active Staff account. Legacy Tours without a route revision cannot have an Operator
(`CK_Tours_VersionedTarget_Complete`) and answer 409 `ROUTE_VERSION_REQUIRED`.

Admin deactivation answers 409 `ACCOUNT_IN_USE` with one blocker per Tour when the account operates a SCHEDULED/READY
Tour, or represents a SUBMITTED/APPROVED registration on a Tour that has not ended. The Operator change takes an update
lock on the new account's row, and deactivation holds the same lock while it checks, so one of the two always sees the
other. A Representative's new registration is not serialized this way: a token lives 15 minutes at most and the
registration is visible to Staff and Admin afterwards.

### T-24h expiry (BR-05, FR-23, FR-40)

`RosterExpiryWorker` runs every 60 seconds and sends one command per due Tour, each in its own transaction under the
Tour lock. At `ScheduledStartAt - 24h` on a SCHEDULED/READY Tour, PENDING rows become EXPIRED (their seat returns) and
PENDING email changes become EXPIRED (the row keeps its email and invitation). A second run finds nothing to change.
A request made at or after the mark answers 409 `EMAIL_CHANGE_CUTOFF`. Expired items are not decisions, so the READY
check "no pending decisions" passes.

The Representative hears about it through the existing delivery shape (ADR-0015, ADR-0047): a request row in `AuditLogs`
commits with the expiry, the email worker claims it and sends outside SQL, and an uncertain send is reported and never
repeated. One email per registration, counts only, with a new template. Audit rows hold ids and counts, never addresses.

### Invitation code guard (FR-45, section 7.3, decision 10)

Per (access code, source IP): 5 wrong attempts within 10 minutes lock that pair for 15 minutes. During the lock the
endpoint answers 429 `INVITATION_CODE_LOCKED` with the remaining minutes in Vietnamese. A correct code clears the
counter. The three values are `Invitations:CodeGuard:{MaxFailures,WindowMinutes,LockMinutes}`. The 60 requests/minute/IP
limiter stays in front.

**Accepted limits.** Counters live in memory: this is one API instance, a restart forgets them, and a second instance
would need shared storage. The pair is keyed on the code, as the SRS states, so a guesser who never repeats a code is
slowed by the outer limiter rather than by this lock. Only a hash of the code is kept.

### Representative list and Technical re-run queue

The Representative Tour list returns only SCHEDULED Tours before the 48-hour close; a Tour the Representative already
registered for stays reachable by its detail page.

`GET /api/technical/route-verifications/rerun-queue` lists revisions whose effective PASS was measured the old way
(`measurementBasis` null, so `scheduleFit` is UNKNOWN). The Technical Dashboard counts them.

## Verification

SQL tests on disposable databases cover: two registrations racing for the last seat; capacity not below held seats;
Operator change and deactivation blocks; expiry exactly at T-24h and not one minute earlier, a second run changing
nothing, seats returned; the 15-minute lock after 5 wrong codes; the Representative list after the close. Schema tests
cover the patch rerun, markers, snapshot equality and deployment rejection of a missing or untrusted CHECK.
