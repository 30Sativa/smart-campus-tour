# Staff row review and email-change queue (Wave C)

Management endpoints require the JWT `Staff` role. A Tour Operator is an
assigned Staff responsibility, not another application role. Admin retains
account administration; TechnicalStaff does not inherit these business
permissions.

## Registration review

Use `GET /api/staff/manage/registrations` and
`GET /api/staff/manage/registrations/{id}` to read rows and current rowversions.
Accept/reject a single row with:

```http
POST /api/staff/manage/registrations/{registrationId}/rows/{rowId}/accept
POST /api/staff/manage/registrations/{registrationId}/rows/{rowId}/reject
```

The request body includes a fresh `requestId`, `expectedRegistrationRowVersion`,
`expectedTourRowVersion`, and `expectedRowVersion`; rejection also requires a
reason (maximum 1000 characters). A stale snapshot returns 409. Aggregate
registration-wide accept/reject and Admin URL aliases are retired under
ADR-0027; only per-row Staff decisions are routed.

## Email-change queue

List pending/all requests through
`GET /api/staff/manage/roster-email-change-requests?state=PENDING`. Accept or
reject at `/api/staff/manage/roster-email-change-requests/{requestId}/accept`
or `/reject`. The response/list includes request, Tour, registration and row
versions required by the decision body. Rejection requires a reason. Acceptance
rechecks current email and reservation uniqueness, changes the single accepted
row and rotates its invitation/session atomically, and queues delivery through
the existing mail worker.

The legacy Admin direct-email route is no longer mapped. Do not integrate the
direct mutation; use the Representative request and Staff review workflow.

## Limits

Review timestamps support the SRS target's two-working-day monitoring, but no
automatic escalation or due-date calculation is implemented without the
institutional calendar. A pending-decision repository predicate exists for
future READY checks; no Tour scheduling/READY lifecycle endpoint consumes it in
this wave.
