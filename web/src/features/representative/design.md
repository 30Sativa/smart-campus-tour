# Representative workspace design

User approved the complete standalone reference on 2026-11-05. Implement the real React pages, not the sample data or the prototype gallery. Keep routes, ownership, form intent/version handling and server permissions. This document applies only to `web/src/features/representative` and `web/src/routes/representative`.

## Locked visual system

Be Vietnam Pro; forest ink #102d31, paper #f7faf6, sage #eaf2ed, lime primary #d6f18d. Use `--rep-*` tokens from representative stylesheet, dark overrides from theme store. Body16px, labels14px, title32px, section23px. Use existing rep classes; root supplies all shared styles. Centered max1320px, top nav three destinations, one bell, account menu. No marketing heroes or closing photo CTA, no giant zero stats or icon coins, no uppercase eyebrows, no dot-separated metadata, no arrow appended to every link. One primary action per region. Flat tables, horizontal rules, tinted internal record list left, selected registration details right. At mobile the list becomes an explicit chooser/back flow, and tables restack using `data-label` cells; active tab is visible. Profiles read-only, selected light/dark state visible.

## Shared JSX/CSS contract

Keep `repButton`, `RepPage`, `RepPageHeader`, `RepSection`, `Panel`, `InfoList`, `Callout`, status/action/empty/error/skeleton/dialog exports. Root updates shared UI so `kicker` remains accepted for compatibility but is no longer rendered as an eyebrow. `Panel` is a flat semantic section, not a rounded enclosing card. Use rep classes rather than literal colors or inline spacing.

Existing classes supported: rep-header, rep-title, rep-lead, rep-stack, rep-section, rep-section-head, rep-detail (main/aside split), rep-aside, rep-info, rep-table-wrap, rep-table, rep-toolbar, rep-search, rep-chips, rep-hint, rep-muted, rep-badges, rep-badge, rep-fields, rep-field, rep-input, rep-form-foot, rep-consent, rep-file-*, rep-error-*. Add meaningful classes as needed and tell root so CSS follows.

New layout classes root will support: rep-workspace (280px/internal list + fluid detail), rep-workspace-list, rep-workspace-main, rep-record, rep-record--selected, rep-record-title, rep-record-meta, rep-workspace-toolbar, rep-detail-tabs (horizontal nav, selected aria-current), rep-mobile-chooser, rep-table-cell (wrap cell contents), rep-compact-summary (text figures separated by rules), rep-overview-grid (2/1 split), rep-list-row, rep-inline-actions, rep-split, rep-summary-aside, rep-diff, rep-diff-item, rep-upload-zone. Use display classes not style attrs. Mobile td data-label must match headers. All icons lucide-react, small outline, aria-hidden.

## Current contract and ownership

One registration per Representative/Tour. Maximum10 viewing points, not students. 48h cutoff for create/additional rows; do not blanket-block update/remove/email-change. Preserve submitted/approved row identities. Backend is authoritative for allowedActions/canRequestEmailChange/canRemove/invitation capabilities. No hypothetical features or new endpoints.

Types planned in api/types.ts (detail agent owns):
- `RepresentativeRosterRow = RosterRow & { id?: string; rowVersion?: string; participationState?: 'PENDING'|'ACCEPTED'|'REJECTED'|'REMOVED'; reviewReason?: string|null; reviewedAt?: string|null; canRequestEmailChange?: boolean; canRemove?: boolean; invitationRowVersion?: string|null }`. Fields optional only for compatibility with old contracts/tests. Missing state is not automatically accepted.
- `RegistrationRosterInput = RosterRow & { rowId?: string|null }`; `RegistrationInput.roster` uses these. Output-only fields MUST NOT be spread into input JSON: backend disallows unmapped members. Existing returned `id` maps to input `rowId`.
- `RepresentativeRegistration.roster` uses detailed rows.
- `RosterEmailChange` uses current backend view fields; exact POST: requestId, proposedEmail, expectedTourRowVersion, expectedRegistrationRowVersion, expectedRowVersion. No reason field in request contract.
- detail agent adds `representativeApi.emailChanges`, `.requestEmailChange` and hooks `useRepEmailChanges`, `useRequestRepEmailChange`. Query keys owner-scoped. Never alter another agent's files.

Existing invitations API remains generic owner-scoped real API. `APPROVED` aggregate can contain PENDING/REJECTED rows: show row decisions and permit valid invitation support from accepted rows, not solely aggregate state. Provider ACCEPTED is not delivered. No shared group codes or invented participants/capacity. No real credential or sample identity in production UI.

Create/update/resubmit hold a stable attempt/requestId and snapshot versions across polling/uncertain errors. On 409 require explicit refresh; don't silently combine draft with a new server version. Keep accepted roster after invalid import. Changed accepted email requires separate Staff-reviewed request. Do not reset unchanged row IDs/status/access on import. Compare removed/added/unchanged rows before committing replacements, and show effects on removed access.

## File ownership for this implementation

- Root: representative.css, token/base CSS, RepresentativeShell, RepUi, rep-classes, RegistrationCard, RegistrationTrack, RepBell/CSS, RepProfilePage, scoped RosterPreview styling, implementation docs, cross-screen validation.
- Catalog agent: RepDashboardPage, RepToursPage, RepTourDetailPage, TourCard, RouteMap, DashboardParts, own catalog/dashboard tests, separate upcoming query helper if needed (do not edit shared representative-hooks).
- Form agent: RepRegisterPage, ExcelUploader, optional HoopDrop replacement in its existing file, registration form/identity utility, registration-deadline, own form/deadline tests. No api/types/hooks edits, coordinate planned types above.
- Detail agent: RepRegistrationsPage, RepRegistrationDetailPage, new workspace/row/email components, api/types/api-client/hooks extensions, own row/email/workspace tests. No shared UI/CSS edits.

Do not delete routes or components. Update their internals and preserve external props; no module tree replacement. Business assertions that encode the old multiple-registration or all-approved behavior must be replaced with current-contract tests, not suppressed. Root runs `bash scripts/verify web` and Hallmark render checks after integration.
