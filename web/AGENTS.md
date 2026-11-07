# AGENTS.md — `web/`

Public site, student remote-Tour page, school Representative
area, tour operations console and administration for CampusTour DT-AMR (Work
Package 4). Read the repo-root `AGENTS.md` first for the
shared rules; this file only covers what is specific to `web/`.

---

## 1. Stack

- Language: **TypeScript**. No plain `.jsx`/`.js` for app source.
- Framework: **React + Vite**.
- Styling: **Tailwind CSS**.
- Server state (data fetched from the backend API): **TanStack Query**.
- Client/UI state (filters, selected robot, modal open/closed, etc.):
  **Zustand**. Do not put server data (bookings, robot status, ...) in
  Zustand — that belongs to TanStack Query's cache.
- Package manager: **npm** (no workspaces needed — see below).
- Codebase shape: **one app, one deploy, several route areas**. Public,
  Student remote Tour, Representative, operations and administration
  live in the same React app and Vercel project. They are split by route and
  role, not by separate apps:
  - `/` and public routes: visitor-facing, no login required.
  - `/tour` and `/tour/:tourId`: Student remote-Tour page, no account UI.
    SQL GUID Tour links use a personal access code exchanged for a browser
    session (ADR-0010/0015); any other `/tour` address asks for the email link. There is one shared-viewing row for a
    projector room. See `docs/requirements/campus-tour-scope.md` and the UI flow.
  - `/dai-dien/*`: school Representative registration and invitation support.
    Registration submission/pre-approval management is API-backed; see
    `web/docs/representative-registration.md`. APPROVED is read-only in this
    roster; invitation support uses the real owner-scoped API (ADR-0015).
  - `/staff/*`: tour operations, for `Staff` only. What an operator does
    around a remote tour: today's Tours, the pre-start check and Start, live
    operations (Tour state, the current robot command, Next, Retry leg, End
    Early, Reconcile), robot telemetry. All of it reads the real Tour API
    (ADR-0042/0043) and `/hubs/operations`; the Tour event log waits for a
    backend read endpoint.
    Scope: `docs/requirements/campus-tour-scope.md`; current screen map and
    blockers in `web/docs/staff-operations.md`.
    `CampusStaff` and `TourOperator` were merged into the one
    `Staff` role - they never diverged in permissions or in UI. Both spellings,
    and `operator`/`ops`, still normalise to `Staff` in `auth/roles.ts`, so a
    token minted before the merge is not locked out.
  - `/staff/manage/*`: Tour preparation, owned by Staff (ADR-0020, routes ADR-0025): legacy pre-execution Tour management, per-row registration review, versioned POI proposals and Route revisions. POI screens use `/api/staff/poi-proposals`; Route authoring uses `/api/staff/routes` and `/api/routes`, selecting only PASS POI revisions for the exact map version. New Tours are created from a tested Route revision with a robot and Operator on a free fixed shift judged by `/api/staff/manage/tours/slots` (ADR-0034, ADR-0035, `docs/lich-tour-theo-ca.md`); legacy Tours keep their projection. READY/Reopen use `/ready` and `/reopen` and follow `permissions.canMarkReady/canReopen/readyBlockers` (ADR-0042). Replaced `/api/admin/*` aliases and old POI/Route authoring operations are retired (ADR-0027). Page components live in `routes/staff/manage/StaffManage*Page.tsx`; legacy feature folders remain pending a focused module move. Screen map: `web/docs/admin-tours.md`.
  - `/technical/*`: Technical Staff (`TechnicalStaff` role) only. Map version
    listing/upload, deployment evidence and submitted POI verification use the
    existing `/api/technical/*` and `/api/maps/*` contracts. Whole-route manual test records use
    `/api/technical/route-verifications/*` and the test-run endpoint; they are
    human-entered evidence, not proof of a physical run or READY. Robot pose files import
    through `/api/technical/poi-imports` (ADR-0038); project YAML templates remain pending.
  - `/admin/*`: administration, `Admin` only: Accounts, Roles, robot key history and the read-only system audit log. `/admin`
    opens Accounts. Admin never prepares, starts, holds, advances or ends a
    Tour and never controls a robot.
  - Signed-in areas are **lazy-loaded** (`React.lazy` + route-based code
    splitting), shell included, so a visitor loading `/` downloads neither and
    an operator never downloads administration.
  - **Renamed on 2026-09-17.** Operations used to live at `/admin/*` back when
    there was only one signed-in area. The old operations URLs
    (`/admin/schedule`, `/admin/amr`, `/admin/alerts`, `/admin/digital-twin`,
    `/admin/reports`) now redirect to their `/staff/*` equivalent;
    the Tour preparation URLs (`/admin/{tours,registrations,routes,pois}/...`)
    redirect to `/staff/manage/...` and `/admin/history` to `/staff/history`
    (2026-10-27, ADR-0025). `/admin` itself is NOT redirected to `/staff`. Those redirects are migration scaffolding — delete them once the
    old links are gone.
  - **Merged on 2026-11-05.** "Buổi hôm nay" (`/staff/tours`) is part of the
    operations overview `/staff`, and "Danh sách Tour" (`/staff/manage/tours`)
    is the list view of Lịch Tour (`/staff/schedule?view=list`). Both old
    addresses redirect with their query. On 2026-11-07 the preparation
    overview (`/staff/manage`) merged into the one Staff home `/staff`, which
    also carries the preparation queue. A single Tour's pages share
    `TourStepper` and go back to the list they were opened from
    (`web/docs/staff-operations.md`).
  - The frontend route namespace and backend API namespace remain separate;
    endpoints still follow the owning role and capability.
- Local run: `cd web && npm install && npm run dev` (Vite, port 5173).
- Backend base URL: **`VITE_API_BASE_URL`** (declared empty in `web/.env`; set in
  ignored `web/.env.local` or the deployment build environment, e.g.
  `https://localhost:7092`). Read it only through `src/api/client.ts` — never
  hard-code a backend URL in a component.
- Realtime transport: **SignalR** (`@microsoft/signalr`) — see Section 4.
- Structure: **feature-based**. Code is grouped by what it does
  (`src/features/<feature>/`), not by file kind. Only genuinely shared UI goes
  in `src/components/`.
- Backend Auth V1 is connected through **JWT access token + refresh token in an
  HttpOnly cookie**. Login, refresh-cookie session restore and logout use the
  real `/api/auth/*` endpoints. Business features without a backend binding
  continue to use labelled fixtures (see “Business fixtures” below).
  - Access token: short-lived JWT, sent in the `Authorization: Bearer` header
    on authenticated API requests. Carries one supported account role
    (`Admin`, `Staff`, `Representative`, or `TechnicalStaff`) as a claim. Student invitation
    access is a separate browser-session target, not another account role.
  - Refresh token: long-lived, stored in an **HttpOnly, Secure** cookie (not
    readable by JS, mitigates XSS token theft). Used to silently obtain a new
    access token when the old one expires, without forcing re-login.
  - Never store the access token in `localStorage`/`sessionStorage` if it can
    be avoided — prefer an in-memory store (e.g. the TanStack Query/Zustand
    auth store) so a page reload re-derives it via the refresh cookie.
  - Token lifetimes: access token **15 minutes**, refresh token **7 days**
    (cookie, set by the backend — the frontend never reads or sets it
    directly).
  - The access token has `sub` and `role` identity claims plus registered JWT
    issuer, audience, and time claims. It contains no personal data. No
    `GET /api/auth/me` endpoint currently exists.
  - Endpoints: `POST /api/auth/login`, `POST /api/auth/refresh`,
    `POST /api/auth/logout`.
  - Logout: call `POST /api/auth/logout` (revokes the refresh token
    server-side — see [backend/AGENTS.md Section 6](../backend/AGENTS.md#6-authentication-and-realtime-placement),
    then clear local
    in-memory auth state and redirect to the public app. Do not treat
    "clear local state" alone as logout — always call the endpoint first, or
    a stolen refresh token from that session stays valid.

---

## 2. Layout

Actual structure — a single Vite + React app, split internally by route:

```
web/
├── index.html
├── package.json          dev / build / lint / typecheck / test
├── vite.config.ts        Vite + Tailwind + Vitest config
├── .env                  empty shared declarations, no secrets or host values
├── .env.local            ignored machine-specific values
├── scripts/verify
└── src/
    ├── main.tsx          StrictMode -> QueryProvider -> ThemeProvider -> RouterProvider
    ├── index.css         @import "tailwindcss" + design tokens + body base
    ├── vite-env.d.ts     typing for VITE_* env vars
    ├── app/
    │   ├── providers/    query-provider.tsx, theme-provider.tsx
    │   └── router/       index.tsx: `routes` + `router`, the
    │                     RequireArea guard, lazy boundaries. router.test.tsx
    │                     asserts guards, legacy redirects and /admin precedence
    ├── routes/
    │   ├── public/       PublicHomePage.tsx  ("/")
    │   ├── student/      StudentTourPage.tsx ("/tour", "/tour/:tourId")
    │   ├── representative/  Representative pages ("/dai-dien/*")
    │   ├── staff/        thin ops pages ("/staff/*"), all lazy-loaded
    │   │   └── manage/   Tour preparation pages ("/staff/manage/*")
    │   ├── technical/    Technical Staff pages ("/technical/*")
    │   └── admin/        Accounts and Roles ("/admin/*"), all lazy-loaded
    ├── features/
    │   ├── administration/ AdminShell, AdminUi, admin-nav/status/hooks,
    │   │                   accounts/ and POI administration subfeatures,
    │   │                   registration/Tour components
    │   ├── digital-twin/  DigitalTwinCanvas, CampusModel, RobotModel,
    │   │                  TwinScene, SimulatorPreview, demo motion/map config
    │   ├── landing/       landing.css/content/motion and sections/
    │   ├── quest-stream/  browser livestream capability (WebRTC/WHEP)
    │   ├── representative/ registration/invitation UI, hooks, nav and format
    │   ├── registrations/ shared live roster/state vocabulary and owner/Admin
    │   │                  invitation support with its API binding
    │   ├── staff/         StaffShell/nav, status/type vocabulary, formatters,
    │   │                  reason, attention, query/realtime hooks and
    │   │                  operation, route, robot and twin components
    │   └── student/       status plus invitation/ SQL Tour
    │                      cookie entry, session recovery and leave
    ├── components/ui/    multi-feature neutral primitives and shared console
    │                     chrome; tests remain next to their owner
    ├── api/              client.ts, signalr.ts, shared transport envelopes;
    │                     existing contracts/{admin,staff,representative,
    │                     ...}.ts remain during migration
    ├── auth/             AuthBootstrap, AuthLayout + LoginPage/AuthFields,
    │                     access.ts (the areas), roles.ts, use-logout.ts
    ├── stores/           auth-store.ts (memory only), theme-store.ts
    └── test/             setup.ts (Vitest + jest-dom)
```

### Ownership rules

- `app/` owns providers and router composition only. `routes/` owns URL entry
  points, route params/search params, and page composition; it is not a home for
  API clients or reusable feature libraries.
- `features/<capability>/` owns that capability's UI, hooks, state mapping,
  feature API bindings, and local types. Keep page wrappers such as `StaffPage`,
  `AdminPage`, and Representative wrappers with their feature.
- A helper reused by multiple subfeatures of the same feature should live at
  that feature root before being promoted to app-wide shared code. For example,
  use `features/administration/use-debounced-value.ts`.
- `components/` is for neutral UI with real consumers in multiple features.
  Put it in `components/ui/` only when it has no feature-specific business
  vocabulary; do not create a generic bucket or move wrappers by default.
- Remaining Admin-to-Staff imports are semantic data/components: `STAFF_NAV`
  feeds the role matrix, while `eventTypeLabel` and `HEAD_LABEL` provide
  operations vocabulary. Account/POI labels stay in `administration/admin-status.ts`;
  operational status labels stay in `staff/status.ts`. Representative has no
  remaining Staff UI dependency.
- `features/registrations/` owns `RosterPreview`, roster row types and live
  SQL registration-state vocabulary shared by Administration and Representative.
  Its `invitations/` owns `InvitationPanel` and the owner/Admin support API.
  It does not import either consumer feature. Student cookie access belongs in
  `features/student/invitation/`, separate from account auth and support writes.
  The current small entry page owns its query/mutations and calls `apiClient`
  with `auth: false` and `credentials: 'include'`; it never stores session
  credentials in JavaScript or uses account refresh on a Student 401.
- `api/` owns shared HTTP/SignalR transport and cross-feature wire primitives.
  New feature-specific endpoint calls and contracts live under their owning
  feature's `api/`. Existing `api/contracts/{admin,staff,representative,
  ...}.ts` files are a transition-era layout with current consumers;
  keep them intact unless a later change can move all consumers mechanically.
- `auth/` owns app-wide login, session, roles, and access. `stores/` owns only
  app-global client/UI state; TanStack Query remains the owner of server data.
- There is no `mocks/` folder any more. A labelled fixture, if one is ever
  needed again, is never an automatic fallback after a production API failure
  and is bound beside the consuming feature.
- `test/` contains the global Vitest bootstrap; feature and shared-component
  tests stay beside the code they cover.

Current route entry points include `/` (public), `/tour` and `/tour/:tourId`
(Student), `/dai-dien/*` (Representative), `/staff/*` (operations), and
`/admin/*` (administration). Only the signed-in areas use role guards; the
Student route has no account guard. The legacy `/visit/*` visitor app was
removed: SRS v1.9 excludes viewer accounts and self-registration (LI-09–14).

**Who may enter what is written in exactly one place: `src/auth/access.ts`.**
The router's `RequireArea` guard asks `AREAS[...].allows(role)`, and the
"Vai trò & quyền" screen renders its matrix by calling the same function, so the
screen cannot drift from the guard. Change a rule there, not at a call site.
`src/auth/roles.ts` holds role normalisation, the Vietnamese role names and
`homePathForRole()`, which is what decides where a fresh sign-in lands.

The current frontend contains a mock Student page at `/tour` and live Representative submission pages at
`/dai-dien/*`. SQL GUID Tour links use real code/cookie entry. Representative registration and
invitation support use SQL and the contract in docs/architecture.md Section 3.2.3.
The Review 1 target (ADR-0010) instead emails a Tour page link and personal
access code; entering the code creates a session, and a valid existing session
avoids repeat entry. The URL itself grants no access. The target
uses one “Điểm xem chung” row/email for a projector room, without collecting a
roster of students who only watch together. Students who need their own device
and private Q&A need individual invitation rows. Treat the code and mock flows
as implementation evidence, not as the target requirement; keep this scope
distinction explicit when changing either flow.

Shared-viewing rows only provide the responsible person's contact details. If
the group needs data for every student, add their individual rows even when they
watch the projector; do not infer a full roster from one viewing point. Resend
keeps the current valid code/session; revoke/reissue invalidates both and emails
a new code to the approved address. Representative support is own-group only;
Admin supports all groups; Staff-only does not gain recovery permission.

The `_to_delete/` holding area was deleted for good on 2026-09-18. Git history is
the only copy of anything that was in it.

The shared presentation layer currently lives in `src/components/ui/`. It owns
neutral primitives used across the operations, administration, Representative,
and Digital Twin surfaces, including console chrome. It is not the destination
for every component: keep business labels, status mapping, feature page frames,
and one-feature controls with their owning feature.

Tests live next to the code they cover (`*.test.ts(x)`).

### Business fixtures

Authentication uses the real `/api/auth/*` endpoints. Login, refresh-cookie
session restore and logout are wired to the backend. Auth responses accept one
supported role: `Admin`, `Staff`, `Representative` or `TechnicalStaff`; there is no Visitor
role (an unknown role normalises to `null` and lands on `/`). Student invitation access is a separate browser-session target.

The operations console has no business fixtures: the Staff simulation and its
mock push channel were removed on 2026-11-04 when the console moved to the real
Tour API and `/hubs/operations` (`web/docs/staff-operations.md`). There is no
toggle: `VITE_USE_MOCK_API` and every `USE_MOCK_API ? mock : http` ternary were
removed on 2026-09-18; do not restore a dead switch. The local Digital Twin
workbench (`/staff/digital-twin`) keeps its own labelled demo motion.

This is a **data source, not a fallback**. Mock data must never be served in
response to a failed request, and no screen may branch on where its rows came
from.

`src/api/` contains the HTTP client (`client.ts`), Auth calls/session refresh,
`ApiError`, `apiUrl`, SignalR factory (`signalr.ts`), and shared transport
envelopes in `contracts/shared.ts`. Auth is wired. The former unwired
`staffApi` proposal was removed; Tour operations call
`features/administration/tours/api/tours.ts`.
Feature-specific account and POI API bindings already live under
`features/administration/{accounts,pois}/api/`. New feature endpoint calls and
contracts follow that placement. Existing top-level `contracts/admin.ts`,
`staff.ts`, `representative.ts` and related files are retained
while current mock/API consumers share them; do not duplicate their types or
move them piecemeal. Keep business fixtures until each feature has a real
backend binding; never use them as fallback after a failed HTTP request.

## 3. Development Rules

- No business rule is reimplemented in the frontend. If the dashboard needs a
  computed value (robot utilisation, ETA, wait time), the backend returns it.
- The ops dashboard is used by campus staff with no robotics background: a
  robot state shown to them must be a plain-language label, not a raw ROS enum.
- Any route under `/staff/*` or `/admin/*` must be wrapped by `RequireArea`.
  A new page is not done until it is behind the guard — do not rely on "nobody
  will guess the URL", and never rely on simply not rendering a nav link.
- **No dead navigation.** A nav item must open a page that does something with
  real data. Administration's entries are exactly the scope's Admin work
  (`features/administration/admin-nav.ts`: accounts, roles, later audit); do
  not add Tour preparation, robot, fleet, free-route editor or scenario
  controls there. The Review 1 target includes a bounded P1
  summary (Tour completion/cancellation, email send results, invitation entry);
  current mock dashboard values do not satisfy it.
- **No backend enum reaches a screen.** The API speaks `InProgress`, `Live`,
  `Critical`; people read Vietnamese. Everything a person sees goes through
  `features/staff/status.ts`, which also assigns the tone (ok / info /
  warn / danger / muted) that is the whole status colour system. Filter values
  sent to the API stay the English enum; only the label is translated. Colour is
  never the only carrier — `StatusBadge` always prints the label.
- Styling is Tailwind utility classes in JSX. Avoid a separate CSS file per
  component unless Tailwind genuinely cannot express it (e.g. a keyframe
  animation).
- One documented exception, in three files that are **one design layer**, not
  three:
  - `features/landing/landing.css` owns it. The public landing page is a
    marketing surface with its own token set (`--lp-*`), its own type and spacing
    scale, and scroll/hover choreography. Scoped under the `.lp` root class so
    nothing leaks into the ops dashboard. It also declares the form-control
    tokens (`--auth-*`) and the danger tokens (`--lp-danger-*`), because more
    than one surface reuses `.auth-input` and `.auth-submit` and those values
    must be declared once.
  - `auth/auth.css` styles the form controls. Its root carries `.lp`.
  - The rule this exception exists under: a *visitor-facing* surface may extend
    this layer; anything else may not. **Admin and staff screens stay on Tailwind
    utilities — do not grow a CSS file for them.**
  - When adding to a public-facing surface, reuse before you extend and extend before
    you create: `.lp-btn`, `.lp-navlink`, `.lp-brand`, `.lp-h3`, `.lp-meta`,
    `.auth-input`, `.auth-submit` and `AuthField` are all already there.
- **Operations and administration share one palette and one component set.**
  Both signed-in Vietnamese consoles are Tailwind utilities on the same values
  (the slate set the Staff console moved to on 2026-09-21, adopted by
  administration on 2026-09-22): ground `#f8fafc`, panel `bg-white` with border
  `#e2e8f0` and `shadow-xs` (no large soft shadows), dividers `#f1f5f9`, ink
  `#0f172a` / `#1e293b` / `#334155` / `#475569` / `#64748b` / `#94a3b8`,
  primary `#2563eb` (hover `#1d4ed8`; white on it is ~5.2:1), soft fill
  `#eff6ff`, active chip `#0f172a` on white. Type: page title 24-26px bold,
  section/panel title 15px semibold, body 14px, labels 12-13px medium,
  sentence case (the page eyebrow is the one uppercase label). Buttons are
  14px (`md`) / 13px (`sm`) semibold; no `font-black`.
  Shape: panels 16px (`rounded-2xl`), buttons/inputs 12px (`rounded-xl`),
  nav and list items 8px (`rounded-lg`), chips and badges full pill. Motion is
  short (150-300ms), on opacity/transform/colour only, and every overlay
  carries `motion-reduce:transition-none`. Visible copy uses no em/en dash:
  empty values print `-`, sentences use a comma, colon or full stop.
  Both shells render `components/ui/ConsoleSidebar.tsx`.
  The two still differ in *priority* — administration has no alert bell and no
  live badge — which is the right axis to diverge on.
  - Neutral shared UI lives in `components/ui/`: `ConsolePrimitives.tsx`
    (`panelClass`, `PageHeader`, `PanelHead`, `SectionHeading`, `StatStrip`/
    `StatTile`, `SearchField`, `Pagination`, `SummaryTile`, `CellIcon`,
    `LoadingPanel`, `PageSkeleton`, `Field`, `FilterChips`), `ui-classes.ts`,
    `use-pagination.ts`, `ConsoleSidebar.tsx`, `use-mobile-nav.ts`, and
    `ConfirmationDialog.tsx`. `AdminPage`, `StaffPage`, Representative wrappers,
    `ErrorPanel`, `EmptyPanel`, operational `StatusBadge`, and business status
    mappings stay feature-owned. `components/ui/status-tone.ts` owns only the
    neutral tone type and presentation classes; `features/staff/status.ts`
    continues to own operational status/event translation. Build from shared
    primitives before adding a second copy, but move only real multi-feature UI.
  - **One accent.** `SummaryTile` never tints itself by meaning, because colour
    on these screens already means severity on a `StatusBadge`. The exceptions
    are deliberate and few: `StatusBadge` tones (`features/staff/status.ts`),
    the access matrix's yes/no, the READY checklist ✓/✕, the pending-review
    figure and the overview charts, whose series use the same status tones and
    always print their counts. Current dashboard figures are mock-backed, not
    live system-wide statistics. The Review 1 P1 target is limited to Tour
    completed/cancelled, email service accepted/failed per send attempt, and
    invitations that entered the room (once per invitation). Do not imply
    attendance, email-open tracking, trend analytics or ratings are included.
  - A screen's summary row counts rows the API already returned, for the labels
    on that same screen. That is presentation. Anything genuinely derived still
    comes from the backend
    ([backend/AGENTS.md Section 3](../backend/AGENTS.md#3-current-model-and-fleet-boundary)).

- **One notification pattern.** A successful action closes its dialog and says so
  once through `notify()` (`components/ui/toast-store.ts`); the Toaster is mounted
  in `RouteView`, so no screen renders its own success banner. A refusal stays
  inside the form, beside the field when it has one, so nothing typed is lost. A
  failed load uses the page's error panel with a retry. Confirm risky actions with
  `ConfirmationDialog`, never `window.confirm`. Dialogs whose row can move between
  lists while saving hold the row itself in state, not a lookup by id, or the save
  unmounts them.
- **One select.** Use `<select>` with `inputClass`; the open list is styled once in
  `index.css` and falls back to the native list where unsupported. A required
  select sets `title=""`, otherwise Chrome hovers its English validation tooltip.
- Component structure is **folder-by-feature**: a feature owns its components,
  hooks and query hooks under `src/features/<feature>/`. The general rules for
  API access, state ownership, component responsibility, effects, error
  handling, reuse, and testing are in the section below.

### Coding and maintainability

These rules describe how to use the stack above. They do not change the
architecture decisions in the Stack section.

#### Simplicity / readability

- Prefer the simplest implementation that satisfies the current requirement.
- Prefer readable and explicit code over clever or overly generic code.
- Comments should explain **why** a decision exists, not restate what obvious
  code does.
- Delete dead code instead of commenting it out; Git already keeps history.
- Do not introduce abstractions for hypothetical future requirements.

#### TypeScript

- Use TypeScript for all application source.
- Avoid `any`. Use explicit types or `unknown` plus narrowing at uncertain
  boundaries. TypeScript `strict` is explicitly enabled in `web/tsconfig.app.json`
  and checked by `npm run typecheck`; ESLint also rejects explicit `any`.
- Use explicit types at important module boundaries: component props, API
  request/response models, shared hooks, and public utilities.
- Do not duplicate the same DTO/type in multiple feature folders when one
  existing boundary type already represents the same contract.
- Do not create generic type abstractions unless they remove real duplication
  or protect a real boundary.

#### Naming

- React components use PascalCase.
- Hooks use `useXxx`.
- Functions and variables use camelCase.
- Names should describe intent, not implementation details.
- Avoid vague names such as `data`, `temp`, `handler`, `manager`, and `helper`
  when a more meaningful name is available.

#### Responsibility / SOLID

Apply SOLID pragmatically where it improves readability, testability, or
separation of responsibilities.

- Prefer single-purpose components, hooks, and modules.
- Separate presentation, server-state access, UI state, transport, and
  reusable behavior when there is a real responsibility boundary.
- Frontend validation is for UX only — the business rule itself stays in the
  backend, per the first rule in this section.
- Keep props, interfaces, and types as small as the consumer actually needs.
- Depend on stable feature/API boundaries rather than spreading transport
  details throughout components.

Do not create interfaces, factories, services, adapters, wrappers, hooks,
contexts, stores, or generic utilities solely to "follow SOLID". If there is
one simple concrete implementation and no meaningful boundary, keep it
concrete.

#### React components

- A component should have one clear UI responsibility.
- Do not split trivial markup into many tiny components only to reduce line
  count.
- Extract a child component when it removes real complexity, has an
  independent responsibility, or has a second real consumer.
- Do not create arbitrary file-size or function-size limits.
- Keep business workflow decisions out of JSX/components.

#### State ownership

Keep one source of truth for each piece of state:

- Server state goes through TanStack Query hooks (`useQuery`/`useMutation`).
- Cross-component client/UI state goes through Zustand when genuinely needed.
- Component-local UI state stays in local React state.
- Editable temporary form/draft state may remain local to the owning feature.

Do not mirror the same server data into TanStack Query, Zustand, and local
state. Prefer derived values over duplicated synchronized state. Do not use
`useEffect` just to copy one piece of React state into another when the value
can be derived during render.

#### API / transport boundary

- No direct `fetch` from React components.
- Backend URLs must not be hard-coded in features or components.
- HTTP access stays behind `src/api/client.ts` and feature-level
  query/mutation hooks. `src/api/` does not own feature query hooks or endpoint
  orchestration.
- Shared wire envelopes stay in `src/api/contracts/shared.ts`; new
  feature-specific calls/contracts belong in `features/<owner>/api/`. Keep the
  existing top-level endpoint contract files during the current migration
  rather than duplicating or relocating types without all consumers.
- SignalR transport details should not be scattered across UI components.
- Raw transport DTOs should not leak through the whole component tree when a
  feature-specific view model is genuinely needed.
- Do not add mapping layers when the transport shape is already simple and
  appropriate for the feature.

#### Effects / realtime

- Effects are for real external side effects: network subscriptions, timers,
  browser APIs, SignalR handlers, and similar integrations.
- Every subscription, timer, listener, or SignalR handler must have a clear
  owner.
- Clean up subscriptions, listeners, and timers when the owner unmounts.
- Reconnect logic must not register duplicate SignalR handlers.
- Do not suppress React Hooks dependency warnings merely to make lint pass;
  fix the lifecycle/dependency design instead.
- Do not block rendering or create high-frequency React state updates when a
  lower-frequency or derived representation is sufficient.

#### Error / async states

When relevant to the user, explicitly handle loading, empty, error, success,
disconnected, and stale/reconnecting realtime states.

- Do not swallow errors silently.
- Do not show raw stack traces, exception objects, HTTP payloads, or internal
  ROS/backend enums directly to users.
- Convert technical failures to understandable UI states and messages.
- Do not fabricate fallback data such as fake battery percentages or fake
  poses.

#### Reuse / shared code

- Keep code inside the owning feature by default.
- Promote something to shared UI/utilities only after a second real consumer
  exists or it represents a clear cross-feature responsibility.
- Do not create a global utility/module merely because code "might be reused
  later".
- Avoid giant shared `helpers.ts`, `utils.ts`, or global Zustand stores.

#### Testing

- Tests should protect user-visible behavior, feature logic, and important
  state transitions.
- Do not test private implementation details or exact internal hook structure.
- Refactoring internal code without changing behavior should not require
  rewriting unrelated tests.
- New behavior should have tests at the smallest useful level.
- Do not create meaningless tests only to increase test count.

#### Anti-over-engineering rule

Prefer the simplest design that keeps responsibilities and boundaries clear.
Do not introduce a new abstraction, interface, shared utility, store, hook,
context, wrapper, service, factory, or framework until there is a concrete
responsibility or real reuse case that existing code cannot express cleanly.

The frontend does not require any of the following by default:

- an interface for every module;
- a service or factory pattern for every feature;
- a custom hook for all logic;
- an atomic design system;
- arbitrary maximum file or function line counts;
- mandatory `useMemo` or `useCallback`;
- mandatory barrel exports;
- a strict inheritance hierarchy;
- a plugin architecture; or
- a generic frontend repository pattern.

---

## 4. Fleet state and realtime

The operations console reads robot telemetry from the Staff-only
`/hubs/operations` hub (`FleetUpdated`), owned once by the Staff shell in
`features/staff/operations/fleet-telemetry.ts`. It shows only what the robot
reported, keeps ages counting between broadcasts and says when the hub is
disconnected. Telemetry is not a Tour state and not proof that a command ran.

The Web-based 3D Operational Digital Twin is core UI scope and lives in this
app. It loads the campus model, renders physical/Gazebo/synthetic robot models,
and visualizes the staff contract's identity, pose/heading,
connection/operational state, active tour/leg, fault/health, and optional
battery fields from fixtures. Pose conversion uses one explicit ROS-map ->
Twin-world transform (origin offset, axis conversion, rotation, and scale),
rather than hardcoded coordinate formulas scattered across components. The 3D
view is not a physics engine, web Nav2, collision simulator, sensor-stream
viewer, scenario editor, or predictive engine.

The production robot-to-backend and backend-to-browser fleet path remains
planned in `docs/architecture.md` §3 and ADR-0008. The interim one-way robot
pose endpoint and browser stream were removed; they are not the production
contract.

Decision (backend -> browser): **SignalR** (`@microsoft/signalr`), matching the
ASP.NET backend. `src/api/signalr.ts` exposes a `createHubConnection(hubPath)`
factory only:

- the hub URL is resolved against `VITE_API_BASE_URL` — never hard-coded;
- nothing connects on import. The component/hook that needs live data owns
  `start()` / `stop()`;
- `withAutomaticReconnect()` is on by default.

`/hubs/operations` is consumed for `FleetUpdated` and `TourUpdated`, with the
in-memory JWT as `accessTokenFactory` and a restart 5 s after a close.
`TourUpdated` carries nothing: it means a Tour command committed, so the shell
invalidates the Tour queries (and once more after a reconnect). It may be
coalesced or lost, so Tour screens keep polling as the fallback.
`AssistanceRequired` remains a planned backend event.

---

## 5. Verification

```bash
web/scripts/verify
```

Runs, in order: `npm ci` -> `npm run maps:check` -> `npm run typecheck` -> `npm run lint` ->
`npm run test` -> `npm run build`. Build is part of verify — a clean typecheck
can still fail at build time. `npm test` is `vitest run` (single run, no watch)
so it exits and is CI-safe.

`.github/workflows/web-verify.yml` runs this same script on relevant pull
requests and main/develop pushes. Static map parity reads the checked-in
`robot/robot_maps/` source; it does not launch ROS, a robot or Fleet Emulator.
No SQL connection or production credentials are needed. Cookie acceptance
across deployed FE/BE sites still requires real HTTPS/browser verification.

Tests run in jsdom. Do not try to assert on WebGL/Canvas output there — the R3F
setup is checked by rendering `/staff/digital-twin` in a browser.

---

## 6. Definition of Done

Standard **DONE (verified)** from the root `AGENTS.md`, plus: a UI change is
not done until it has been rendered and looked at. An agent that cannot render
the page reports what it changed and asks for a visual check — it does not
claim the UI is correct.

---

## 7. Hard Constraints

- No API token, DockerHub credential, or backend secret in frontend source or
  in a `VITE_*`/`NEXT_PUBLIC_*` style env var. Anything shipped to the browser
  is public.
- No operational control action (assign, reassign, or cancel a mission/leg)
  without an explicit confirmation step.
- A cloud/web cancel action is **not** an Emergency Stop. Do not label it as
  one or treat the browser/backend path as safety-critical E-stop. Physical and
  local fail-safe behaviour remains robot-side.
- Do not commit `node_modules/` or build output.

<!-- TODO(WP4): thêm constraint khác khi có. -->
