# ADR-0046: Admin resets a managed account's password

- **Status:** Proposed 06/11/2026. **Superseded by ADR-0058** (13/11/2026), which implements the reset with a
  different route, audit code and an account version check. This proposal was never implemented as written.
- **Related:** `docs/architecture.md` §3.0.1 (account create, deactivate, reactivate) and §3.0.1a (account update,
  self-service password change, `AccountPasswordPolicy`); ADR-0020 (roles).

## Context

An Admin creates every Staff, Technical Staff and Representative account with an initial password. After that, only
the account holder can change the password (`POST /api/account/me/password`), and that needs the current password.
There is no email or other recovery channel.

So when someone forgets their password, the only way out today is to deactivate the account and create a new one.
For a Representative that is harmful: registrations and invitation rows are owned by the old account, so the new
account cannot see or support them. For Staff it detaches them from the Tours they were assigned.

Username and role stay immutable (§3.0.1a). This ADR does not change that.

## Decision (proposed)

1. **Endpoint.** `POST /api/admin/accounts/{id}/password` (Admin only), body `{ "newPassword": "..." }`. Unknown
   body fields return 400, as on the other account endpoints.
2. **Scope.** Managed (non-Admin) accounts only. An Admin target returns 403, like the other account endpoints, so
   an Admin cannot reset another Admin's or their own password through this path.
3. **Policy.** The new password goes through the existing `AccountPasswordPolicy` (12-128 characters, not blank).
   No separate rule.
4. **Sessions.** A successful reset revokes every active refresh token of the account, the same as a self-service
   password change. An already-issued access JWT stays valid until it expires (about 15 minutes), the accepted V1
   limitation in §3.0.1.
5. **Audit.** One `ACCOUNT_PASSWORD_RESET` audit row with the actor and target account ids. The password and its
   hash never go into the audit row, logs or the response.
6. **Inactive accounts.** Allowed, so an Admin can reset then reactivate. Reset alone does not reactivate.
7. **Web.** A "Đặt lại mật khẩu" action on the Admin account row, opening a `ConfirmationDialog` with the new
   password field. The Admin passes the new password to the person outside the system, as with the initial password.

## Not decided here

- Forcing a password change at the next sign-in. It needs a new account column and a sign-in flow change, so it is a
  separate decision if the group wants it.
- Self-service recovery by email.

## Consequences

- A public API route is added and must be recorded in `docs/architecture.md` §3.0.1a when implemented.
- Tests: backend unit/integration tests for 200, 400 (policy and unknown field), 401, 403 (non-Admin caller and
  Admin target), 404, token revocation and the audit row; a web test for the dialog.
