# ADR-0058: Admin resets a managed account's password, guarded by an account version

- **Status:** Accepted by the repository owner in the UX/UI batch brief of 13/11/2026 (workstream WS-H), implemented.
  No advisor approval is recorded.
- **Supersedes:** ADR-0046 (proposed 06/11/2026, never implemented). The route name, the audit code and the version
  check below replace ADR-0046 decisions 1 and 5; its decisions 2, 3, 4 and 6 are kept.
- **Related:** `docs/architecture.md` §3.0.1 and §3.0.1a; ADR-0020 (roles).

## Context

ADR-0046 explains the need: there is no recovery channel, and replacing an account whose holder forgot the password
detaches that person from their registrations, invitation rows and assigned Tours. The owner brief of 13/11/2026 asks
for the reset with a fixed contract: `POST /api/admin/accounts/{id}/reset-password`, body
`{ newPassword, expectedRowVersion }`, audit `PASSWORD_RESET_BY_ADMIN`, no schema change.

`dbo.Users` has no SQL `rowversion` column, and the brief forbids adding one. Every writer of a User row
(create, update, deactivate, reactivate, profile update, password change) already sets `UpdatedAt`.

## Decision

1. **Endpoint.** `POST /api/admin/accounts/{id}/reset-password` (Admin only), body
   `{ "newPassword": "...", "expectedRowVersion": "..." }`. Unknown body fields return 400. Success is HTTP 200 with the
   usual `BaseResponse` and `data: null`; the password is never echoed.
2. **Scope.** Managed (non-Admin) accounts only; an Admin target (including the caller) returns 403. Inactive accounts
   may be reset; a reset does not reactivate them.
3. **Policy.** `newPassword` goes through the existing `AccountPasswordPolicy` (12-128 characters, not blank).
4. **Account version.** `expectedRowVersion` is an opaque token: base64 of the 8-byte big-endian UTC ticks of
   `UpdatedAt ?? CreatedAt` as stored (millisecond precision). `GET /api/admin/accounts` returns it per row as
   `rowVersion`. The handler locks the User row (`UPDLOCK`, the existing `FindForManagementAsync`) and compares the token;
   a mismatch returns 409 `STALE_VERSION`, the same code and message as the SQL rowversion writers. A malformed token
   returns 400. The reset stores `UpdatedAt` truncated to the millisecond and at least 1 ms after the previous value, so
   the token always changes after a reset.
5. **Sessions.** A successful reset revokes every refresh token of the account that is not yet revoked. An already-issued
   access JWT stays valid until it expires (about 15 minutes), the accepted V1 limitation in §3.0.1.
6. **Audit.** One `PASSWORD_RESET_BY_ADMIN` row: actor = Admin, entity = `User` / target id. No password, hash or other
   data is written to the audit row, logs or the response.
7. **Transaction.** The command is an `IAccountTransactionRequest`, so `AccountTransactionBehavior` runs the lock, the
   password hash, the token revocation and the audit row in the existing account transaction.
8. **Web.** "Đặt lại mật khẩu" in the Admin edit-account dialog opens a `ConfirmationDialog` with a generated,
   editable password (`crypto.getRandomValues`). After success the password is shown once with a copy button; errors
   stay inside the dialog. The Admin hands the password over outside the system.

## Not decided here

- Forcing a password change at the next sign-in. It needs a new `dbo.Users` column (for example `MustChangePassword`)
  and a sign-in flow change, so it is a schema decision for the owner. Not implemented.
- Self-service recovery by email.

## Consequences

- The account version detects any change made through the application since the Admin loaded the list. Two User writes
  inside the same millisecond by different writers would share a token; only the reset itself guarantees a new value.
  A real `rowversion` column would remove that limit but needs a schema change.
- `GET /api/admin/accounts` gains the additive `rowVersion` field; no field is removed or renamed.
- Reverting is a code change: remove the command, the route and the list field. No schema is involved.
