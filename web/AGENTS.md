# AGENTS.md — `web/`

Public site, legacy visitor app, student remote-Tour page, school Representative
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
- Codebase shape: **one app, one deploy, several route areas**. Public, legacy
  visitor, Student remote Tour, Representative, operations and administration
  live in the same React app and Vercel project. They are split by route and
  role, not by separate apps:
  - `/` and public routes: visitor-facing, no login required.
  - `/tour` and `/tour/:tourId`: Student remote-Tour page, no account UI.
    Current code uses a group code and roster-name matching mock; the Review 1
    target is an emailed Tour page link plus personal access code, exchanged
    for a browser session (ADR-0010), with one shared-viewing row for a
    projector room. See `docs/requirements/campus-tour-scope.md` and the UI flow.
  - `/dai-dien/*`: school Representative registration and invitation support.
    Registration submission/pre-approval management is API-backed; see
    `web/docs/representative-registration.md`. APPROVED is read-only in this
    slice; personal-email invitation support remains future implementation.
  - `/staff/*`: tour operations, for `Staff` and `Admin` (Admin read-only: every
    run action needs the `Staff` role, scope §2.1). What an operator does
    around a remote tour: today's sessions and their groups, the pre-start
    check and Start, live operations on the operational twin (Hold / Next /
    End Early / recovery), the robot, the session log. Scope: the remote-tour
    Review 1 target in `docs/requirements/campus-tour-scope.md`; current screen
    map in `web/docs/staff-operations.md`.
    `CampusStaff` and `TourOperator` were merged into the one
    `Staff` role - they never diverged in permissions or in UI. Both spellings,
    and `operator`/`ops`, still normalise to `Staff` in `auth/roles.ts`, so a
    token minted before the merge is not locked out.
  - `/admin/*`: Tour administration, `Admin` only: create/edit a Tour while
    Scheduled, pick a prepared route, review groups (approve / reject with a
     reason), send participation e-mails, Chốt (→ Ready) / Mở lại / Hủy before
     Start, and read finished Tours. Admin never starts, holds, advances or ends
    a run and never controls a robot. Review 1 target adds a limited P1
    completion/email/invitation-entry summary and POI-content form. The Admin
    POI catalog at `/admin/pois` is API-backed: it edits content and only edits
    map/pose before route/history use (ADR-0014). P1 audio upload/dwell warning
    remains separate. Screen map: `web/docs/admin-tours.md`.
  - Signed-in areas are **lazy-loaded** (`React.lazy` + route-based code
    splitting), shell included, so a visitor loading `/` downloads neither and
    an operator never downloads administration.
  - **Renamed on 2026-09-17.** Operations used to live at `/admin/*` back when
    there was only one signed-in area. The old operations URLs
    (`/admin/schedule`, `/admin/amr`, `/admin/alerts`, `/admin/digital-twin`,
    `/admin/reports`) now redirect to their `/staff/*` equivalent;
    `/admin/tours/:id` is an admin page again (2026-09-21). `/admin` itself is NOT redirected: it is the administration
    overview. Those redirects are migration scaffolding — delete them once the
    old links are gone.
  - The **frontend route namespace and the backend API namespace are
    independent**. Operations screens at `/staff/*` call `/api/staff/*`, and
    that is fine. Do not rename an API because a route moved.
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
    (`Admin`, `Staff`, or `Representative`) as a claim. Student invitation
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
    │   ├── visitor/      legacy visitor pages ("/visit/*"), lazy-loaded
    │   ├── student/      StudentTourPage.tsx ("/tour", "/tour/:tourId")
    │   ├── representative/  Representative pages ("/dai-dien/*")
    │   ├── staff/        thin ops pages ("/staff/*"), all lazy-loaded
    │   └── admin/        admin pages ("/admin/*"), all lazy-loaded
    ├── features/
    │   ├── administration/ AdminShell, AdminUi, admin-nav/status/hooks,
    │   │                   accounts/ and POI administration subfeatures,
    │   │                   registration/Tour components
    │   ├── digital-twin/  DigitalTwinCanvas, CampusModel, RobotModel,
    │   │                  TwinScene, SimulatorPreview, demo motion/map config
    │   ├── landing/       landing.css/content/motion and sections/
    │   ├── quest-stream/  browser livestream capability (WebRTC/WHEP)
    │   ├── representative/ registration/invitation UI, hooks, nav and format
    │   ├── staff/         StaffShell/nav, status/type vocabulary, formatters,
    │   │                  reason, attention, query/realtime hooks and
    │   │                  operation, route, robot and twin components
    │   ├── student/       remote-Tour flow and student status vocabulary
    │   └── visitor/       legacy visitor flow, content, format and map UI
    ├── components/ui/    multi-feature neutral primitives and shared console
    │                     chrome; tests remain next to their owner
    ├── api/              client.ts, signalr.ts, shared transport envelopes;
    │                     existing contracts/{admin,staff,representative,
    │                     visitor,...}.ts remain during migration
    ├── auth/             AuthBootstrap, AuthLayout + LoginPage/AuthFields,
    │                     access.ts (the areas), roles.ts, use-logout.ts
    ├── mocks/            labelled mock backend — see below
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
- `api/` owns shared HTTP/SignalR transport and cross-feature wire primitives.
  New feature-specific endpoint calls and contracts live under their owning
  feature's `api/`. Existing `api/contracts/{admin,staff,representative,
  visitor,...}.ts` files are a transition-era layout with current consumers;
  keep them intact unless a later change can move all consumers mechanically.
- `auth/` owns app-wide login, session, roles, and access. `stores/` owns only
  app-global client/UI state; TanStack Query remains the owner of server data.
- `mocks/` contains labelled fixtures/simulations, never an automatic fallback
  after a production API failure. Bind a mock beside the consuming feature.
- `test/` contains the global Vitest bootstrap; feature and shared-component
  tests stay beside the code they cover.

Current route entry points include `/` (public), `/tour` and `/tour/:tourId`
(Student), `/dai-dien/*` (Representative), `/visit/*` (legacy visitor),
`/staff/*` (operations), and `/admin/*` (administration). Only the signed-in
areas use role guards; the Student route has no account guard. The `/visit/*`
booking flow is legacy implementation, not the current Student product target.

**Who may enter what is written in exactly one place: `src/auth/access.ts`.**
The router's `RequireArea` guard asks `AREAS[...].allows(role)`, and the
"Vai trò & quyền" screen renders its matrix by calling the same function, so the
screen cannot drift from the guard. Change a rule there, not at a call site.
`src/auth/roles.ts` holds role normalisation, the Vietnamese role names and
`homePathForRole()`, which is what decides where a fresh sign-in lands.

The current frontend contains a legacy visitor registration/tour flow at
`/visit/*`, plus a mock Student page at `/tour` and live Representative submission pages at
`/dai-dien/*`. The Student page currently matches a group code and name/class
against mock roster data; the Representative submission area uses SQL registrations and Review 1 invitation rows; it issues no access code.
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
supported role: `Admin`, `Staff` or `Representative`; the legacy Visitor area
remains in the frontend route model, but real Auth does not issue a Visitor
account. Student invitation access is a separate browser-session target.

Business features without a live backend binding continue to use labelled
fixtures in `src/mocks/`. There is no toggle: `VITE_USE_MOCK_API` and every
`USE_MOCK_API ? mock : http` ternary were removed on 2026-09-18; do not restore
a dead switch.

- `mocks/staff-mock.ts` implements the `StaffApi` contract, the same
  type `api/contracts/staff.ts` implements over HTTP, so feature code does
  not know which one it has. The binding is named once, in
  `features/staff/staff-hooks.ts`;
- mock business data is disclosed with a one-line badge in the shells, rendered
  only when `import.meta.env.DEV` is true, plus a `console.warn` from
  `mocks/mock-mode.ts` that fires in every build. Do not put build state back
  into the middle of a screen someone works in all day.

This is a **data source, not a fallback**. Mock data must never be served in
response to a failed request, and no screen may branch on where its rows came
from.

`src/api/` contains the HTTP client (`client.ts`), Auth calls/session refresh,
`ApiError`, `apiUrl`, SignalR factory (`signalr.ts`), and shared transport
envelopes in `contracts/shared.ts`. Auth is wired; `staffApi` remains
deliberately unwired until the corresponding backend features are ready.
Feature-specific account and POI API bindings already live under
`features/administration/{accounts,pois}/api/`. New feature endpoint calls and
contracts follow that placement. Existing top-level `contracts/admin.ts`,
`staff.ts`, `representative.ts`, `visitor.ts` and related files are retained
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
  (`features/administration/admin-nav.ts`); do not add robot, fleet, free-route
  editor or scenario controls there. The Review 1 target includes a bounded P1
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
  - `features/visitor/visitor.css` is the same system at application density: the
    app shell, and the handful of patterns the landing page has no equivalent for
    (badge, filter pill, tab row, stepper, chat column, map plane). Its root
    carries `.lp` as well as `.vs`, and **every colour, radius and shadow in it
    resolves to a `--lp-*` token** — it picks no palette of its own.
  - The rule this exception exists under: a *visitor-facing* surface may extend
    this layer; anything else may not. **Admin and staff screens stay on Tailwind
    utilities — do not grow a CSS file for them.**
  - When adding to the visitor area, reuse before you extend and extend before
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
- **The visitor area is an English surface.** The public, staff and admin areas
  are Vietnamese. Its strings live in `features/visitor/visitor-content.ts` and
  its status vocabulary in `features/visitor/visitor-status.ts`, which is the
  same tone scale as `features/staff/status.ts` with English labels and
  tone *tokens* rather than Tailwind classes, so the badge can follow the
  light/dark switch. The `Intl` locale is `en-GB` in
  `features/visitor/visitor-format.ts`. Same hard rule as everywhere else: no
  backend enum reaches a screen.

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
  boundaries. TypeScript `strict` is **not** enabled in `web/tsconfig.app.json`,
  so this is enforced by review, not by `npm run typecheck`.
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

The staff dashboard currently uses a labelled mock API and mock push channel.
Its robot pose, source, connection and health values are fixtures; the browser
does not connect to robots or a backend fleet-pose Hub. The former
`VITE_FLEET_HUB` pose stream and its client have been removed.

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

No hub is consumed yet. `/hubs/operations` and its projection events are
selected in `docs/architecture.md`; frontend payload mapping and reconnect /
refetch behavior remain unimplemented.

<!-- TODO(WP4): wire the selected /hubs/operations projection contract. -->

---

## 5. Verification

```bash
web/scripts/verify
```

Runs, in order: `npm ci` -> `npm run typecheck` -> `npm run lint` ->
`npm run test` -> `npm run build`. Build is part of verify — a clean typecheck
can still fail at build time. `npm test` is `vitest run` (single run, no watch)
so it exits and is CI-safe.

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
