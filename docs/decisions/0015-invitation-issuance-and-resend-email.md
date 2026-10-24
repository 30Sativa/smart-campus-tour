# ADR-0015: Invitation issuance and Resend delivery

- Date: 2026-10-08.
- Status: implementation decision for the user-requested invitation/email slice.
- Business baseline: ADR-0010/0011/0012; advisor approval is not implied.
- Scope: backend, web and their API contract. No schema change.

## Decision

Use existing Invitations.AccessCodeHash/AccessCodeProtected/AccessVersion.
Generate 20 Crockford Base32 characters (100 bits), normalize case and separators,
HMAC-SHA256 with a separate secret, and encrypt using AES-256-GCM with a second
secret. Bind ciphertext to invitation ID/version. Never return codes in support
APIs or write codes, ciphertext, recipient addresses or names to audit.

The configured expiry is scheduled start plus 24 hours by default, chosen for
this implementation at the user's request for a recommendation. It is adjustable
before issuance; resending/reissuing never extends an existing expiry.

When enabled, approval issues one invitation per active roster row and appends
EMAIL_SEND_REQUESTED/PENDING atomically in the existing Tour-first transaction.
Previously approved groups have a separate owner/Admin issue action. Disabled
configuration leaves review available and explicitly reports support unavailable.

AuditLogs acts as a small durable delivery queue, without an EmailAttempts table.
A worker claims a request under the Tour lock by appending EMAIL_SEND_STARTED;
external HTTP happens after commit. Other workers cannot claim it again.
Each attempt has a unique correlation/idempotency key. Append one
EMAIL_SEND_RESULT with ACCEPTED, FAILED or UNKNOWN. Interrupted claims become
UNKNOWN after two minutes, never automatically retransmitted. Manual resend is
a new attempt with the same current code. The Resend idempotency key additionally
protects duplicate submission of that attempt within its 24-hour window.
No webhook, inbox-delivery or email-open claim is made.

Sending failure never reverses approval. Revocation closes all open sessions;
reissue retains invitation ID and expiry, increments version and replaces both
hash/ciphertext before queuing new mail. An in-flight message cannot be recalled;
its old code is already invalid. Support HTTP writes require a request UUID and
row version; retries of that UUID cannot rotate or enqueue twice. Sending has a
60-second per-invitation cooldown.

Keys/API token stay in backend secrets, outside Git and frontend environments.
Configuration is opt-in and validated before the HTTP host starts. Key rotation
requires an explicit migration/reissue process; swapping keys would invalidate
existing ciphertext and admission hashes.

## Limits

Include the minimal Student entry needed to use emailed codes: SQL Tour links
exchange a code for an HttpOnly browser cookie, reload/heartbeat retain the
session, and competing browsers are rejected. Heartbeats hold a session for ten
minutes, bounded by invitation expiry. Join attempts are rate limited per IP.
Legacy fixture Tour IDs retain their labelled demo flow. Real invited rooms show
committed Tour state; livestream/AI/robot presentation remain separate work.
Admin email correction, roster replacement after issuance, retention cleanup,
Tour scheduling/readiness and webhook delivery tracking remain separate work.
