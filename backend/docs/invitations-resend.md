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
| Resend__From | CampusTour <noreply@your-verified-domain> |

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

## Invitation email appearance

The branded HTML email uses a table layout, inline styles and a narrow-screen
adjustment. It includes the Tour name, Vietnam-time schedule, selectable access
code, expiry, a prominent Tour button, a visible fallback URL and a support
mailto link. The plain-text alternative contains the same access instructions.
Neither link includes the access code. No external images or fonts are required.
The footer identifies an automated email and directs help to SupportEmail;
setting a noreply sender does not create a receiving mailbox or route replies.
Browser previews do not replace checks in the intended email clients.

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

Admin can correct only one active roster row's email from the live registration
drawer while the Tour is SCHEDULED (docs/architecture.md Section 3.2.4).
APPROVED corrections keep approval and row identity, replace only that row's
code and close its old sessions, then queue email to the new normalized address.
Existing invitation ID/expiry remain unchanged. If no invitation exists, only
the corrected row is issued. Support must be enabled for an approved correction;
unapproved corrections never issue or send. READY requires reopening first;
Tour lifecycle/reopen is still outside the live registration API.

Correction writes use a request UUID and Tour/registration/roster/invitation
snapshot versions. A committed uncertain retry cannot rotate or queue twice;
if another correction has updated the same row afterward, the old request
conflicts and requires reload instead of reinstating the old address. Email
delivery failure does not undo the correction/revocation: use the existing
resend action after cooldown to send the current code. A previously claimed
email may still arrive at the old address, but its code is invalid.

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

## Browser/deployment checks

Student requests use `auth: false` and `credentials: 'include'`, separate from
account JWT/refresh. The Web route normalizes GUID case to the backend's canonical
cookie path and remounts entry state when the Tour changes. Join/leave cancel
pending heartbeats; confirmed 401/403/409 hides cached room access. Network
failures show stale information and permit explicit session recovery. The UI
does not promise a fixed idle timeout because SessionIdleMinutes is configurable.

SameSite=None/Secure and exact credentialed CORS are necessary transport
settings, but do not override browser third-party-cookie restrictions.
Cross-origin and cross-site are different: HTTPS FE and API subdomains of the
same site can still require CORS. Prefer a supported same-site deployment or
same-origin API proxy when unrelated sites would require third-party cookies;
preserve the host-only HttpOnly cookie, Secure flag and allowed-origin checks.
See [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
and [third-party cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies).

Before deployment, test with the actual HTTPS FE/API domains in normal and
private browser profiles, including profiles that block third-party cookies:

1. Join with an authorized disposable invitation; inspect that Set-Cookie is
   accepted, then /session sends the cookie and returns 200 without an account JWT.
2. Reload and open another tab: the same cookie retains one SQL session. A
   separate browser with the same code gets 409 without displacing the first.
3. Leave: cookie is deleted, old /session returns 401, and a fresh join succeeds.
   Revoke/reissue from the owner/Admin: old code and cookies stop working after
   the next heartbeat; resend keeps them working.
4. Expire the test invitation or idle session; verify generic 401 and no access
   extension. Disconnect/reconnect and verify the stale warning clears only on
   successful recovery. Verify forbidden origins cannot mutate cookies/sessions.
5. Check the TLS proxy's public scheme/host and client-IP forwarding against
   its trusted-proxy configuration; the join limiter partitions on RemoteIpAddress.
   Do not trust arbitrary forwarded headers or bypass local-network/certificate
   restrictions. Use the deployed API URL in the FE build.

Automated .NET HTTP assertions verify headers/origin/admission against disposable
SQL, not browser cookie storage. jsdom tests verify UI/cache behavior, not HTTPS
or cookie acceptance. Real provider delivery needs a separately authorized test
recipient; no email is transmitted by verification.

## Verification limits

Run scripts/verify backend and scripts/verify web. SQL tests require
SMARTCAMPUS_SCHEMA_TEST_CONNECTION and create disposable databases, never modify
the product database. Provider tests use fake HTTP handlers and send no mail.
Invitations:EmailWorkerEnabled=false supports controlled staging that persists
requests without transmitting; tests explicitly set it.

Actual Resend sending needs the configured key/verified sender and an authorized
test recipient. Before real invitations establish the retention/support policy
required by ADR-0011; this implementation does not invent production retention.
