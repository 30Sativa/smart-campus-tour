# Invitation email setup (Resend)

Implemented contract: docs/architecture.md Section 3.2.3; decision:
docs/decisions/0015-invitation-issuance-and-resend-email.md.

## Backend configuration

Invitations are opt-in. Keep API/crypto keys out of Git and VITE_* variables.
Use .NET User Secrets locally, or backend environment variables when hosted.

| Environment key | Value |
| --- | --- |
| Invitations__Enabled | true after all required settings exist |
| Invitations__HashKey | base64 of 32 random bytes, stable across restarts |
| Invitations__ProtectionKey | a different base64 32-byte secret, stable across restarts |
| Invitations__PublicBaseUrl | https://www.fptcampustour.cloud |
| Invitations__SupportEmail | your real support email |
| Invitations__ExpiryHoursAfterStart | 24 (default; range 1–168) |
| Invitations__SessionIdleMinutes | 10 (default; range 1–60) |
| Resend__ApiKey | backend-only Resend API key |
| Resend__From | CampusTour <tour@your-verified-domain> |

For User Secrets use colon-separated keys, e.g. Resend:ApiKey, for
backend/src/SmartCampus.Api/SmartCampus.Api.csproj. Do not paste keys into chat,
screenshots or logs. Generate crypto secrets using the platform cryptographic
random generator. Back them up securely: swapping keys invalidates existing codes.
Enabled configuration is validated at startup; errors report only the key name.

Verify the sender domain/DNS in Resend before real sending. See
[domain setup](https://resend.com/docs/dashboard/domains/introduction) and
[sending API](https://resend.com/docs/api-reference/emails/send-email).
The integration uses .NET HttpClient without an additional SDK package.

Restart backend after configuration. CORS must include the exact FE origin.
For future hosted BE change VITE_API_BASE_URL to its HTTPS URL and redeploy FE;
PublicBaseUrl remains the FE domain. Crypto keys must survive host changes.

## Operation and API

Approval creates one code and separate email per active approved roster row.
Previously approved groups use “Cấp và gửi lời mời” in live Admin registration
review or the owner's Representative detail.

GET /api/registrations/{registrationId}/invitations returns enabled/canIssue/items.
POST that path + /issue accepts requestId, expectedRowVersion (registration),
expectedTourRowVersion. POST + /{invitationId}/resend, /reissue or /revoke
accepts requestId and expectedRowVersion (invitation). All use BaseResponse;
writes have null data. Never return access codes or encrypted values in support
responses. Retain the same request UUID after an uncertain HTTP response.

- Gửi lại email: same current code/expiry, no session interruption.
- Thu hồi và cấp mã mới: close sessions, replace code, keep expiry and ID.
- Thu hồi mã: invalidate code/sessions without sending mail.
- Sending failure keeps APPROVED. Resend after the one-minute cooldown.
- ACCEPTED means service acceptance; no delivery/read or attendance claim.
- UNKNOWN means inconclusive delivery; do not treat it as FAILED or ACCEPTED.

Durable requests survive restart. A worker appends a claim and commits before
external sending; no email occurs inside a SQL transaction. Interrupted claims
become UNKNOWN after two minutes. Manual resend creates a new attempt with the
current code. Resend's attempt idempotency key lasts
[24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys).
No automatic retry of uncertain attempts and no webhook/open tracking.

Conflict codes: STALE_VERSION, IDEMPOTENCY_CONFLICT, INVITATIONS_DISABLED,
INVITATION_UNAVAILABLE, INVITATION_EXPIRED, EMAIL_COOLDOWN. Disabled support is
explicitly shown; ordinary review continues to work without Resend credentials.

Student link /tour/{tourId} contains no code/PII. POST
/api/student/tours/{tourId}/join with {accessCode} creates a browser cookie;
POST /session restores/heartbeats, POST /leave closes it. Join is rate limited.
Same browser/tabs reuse one session, another live browser is rejected. Idle
replacement closes old rows before INSERT under the Tour lock. Only hashes are
stored for cookies, which are HttpOnly/Secure/SameSite=None. Browser origin must
match configured CORS or API origin before cookie mutations.

SQL rooms show committed Tour state. Livestream/robot content/AI need their own
integrations; no fixture data is displayed as a real invited Tour.

## Verification limits

Run scripts/verify backend and scripts/verify web. SQL tests require
SMARTCAMPUS_SCHEMA_TEST_CONNECTION and create disposable databases, never modify
the product database. Provider tests use fake HTTP handlers and send no mail.
Invitations:EmailWorkerEnabled=false supports controlled staging that persists
requests without transmitting; tests explicitly set it.

Actual Resend sending needs the configured key/verified sender and an authorized
test recipient. Before real invitations establish the retention/support policy
required by ADR-0011; this implementation does not invent production retention.
