# AGENTS.md — `web/`

Public site, visitor app, tour operations console and administration for
CampusTour DT-AMR (Work Package 5). Read the repo-root `AGENTS.md` first for the
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
- Codebase shape: **one app, one deploy, four areas**. Public, the visitor app,
  operations and administration live in the same React app, same Vercel project,
  same domain. They are split by route + role, not by separate apps:
  - `/` and public routes: visitor-facing, no login required.
  - `/staff/*`: tour operations, for `Staff` and `Admin`. What an operator does
    during a shift: today's tours, the AMR fleet, alerts, the digital twin,
    feedback reports. `CampusStaff` and `TourOperator` were merged into the one
    `Staff` role - they never diverged in permissions or in UI. Both spellings,
    and `operator`/`ops`, still normalise to `Staff` in `auth/roles.ts`, so a
    token minted before the merge is not locked out.
  - `/admin/*`: administration, `Admin` only. System-level: what the product
    consists of and who may enter which area. It is NOT the operations
    dashboard with a different title, and it must not grow one.
  - Both signed-in areas are **lazy-loaded** (`React.lazy` + route-based code
    splitting), shell included, so a visitor loading `/` downloads neither and
    an operator never downloads administration.
  - **Renamed on 2026-09-17.** Operations used to live at `/admin/*` back when
    there was only one signed-in area. The old operations URLs
    (`/admin/schedule`, `/admin/amr`, `/admin/alerts`, `/admin/digital-twin`,
    `/admin/reports`, `/admin/tours/:id`) now redirect to their `/staff/*`
    equivalent. `/admin` itself is NOT redirected: it is the administration
    overview. Those redirects are migration scaffolding — delete them once the
    old links are gone.
  - The **frontend route namespace and the backend API namespace are
    independent**. Operations screens at `/staff/*` call `/api/staff/*`, and
    that is fine. Do not rename an API because a route moved.
- Local run: `cd web && npm install && npm run dev` (Vite, port 5173).
- Backend base URL: **`VITE_API_BASE_URL`** (see `.env.example`, e.g.
  `http://localhost:5000`). Read it only through `src/api/client.ts` — never
  hard-code a backend URL in a component.
- Realtime transport: **SignalR** (`@microsoft/signalr`) — see Section 4.
- Structure: **feature-based**. Code is grouped by what it does
  (`src/features/<feature>/`), not by file kind. Only genuinely shared UI goes
  in `src/components/`.
- Auth mechanism: **JWT access token + refresh token in an HttpOnly cookie**.
  - Access token: short-lived JWT, sent in the `Authorization: Bearer` header
    on every API request. Carries the user's role (`Visitor`, `Staff`,
    `Admin`) as a claim; the area route guard reads the role from the decoded
    token, not from a separate call. `auth/roles.ts` normalises whatever
    spelling arrives onto those three.
  - Refresh token: long-lived, stored in an **HttpOnly, Secure** cookie (not
    readable by JS, mitigates XSS token theft). Used to silently obtain a new
    access token when the old one expires, without forcing re-login.
  - Never store the access token in `localStorage`/`sessionStorage` if it can
    be avoided — prefer an in-memory store (e.g. the TanStack Query/Zustand
    auth store) so a page reload re-derives it via the refresh cookie.
  - Token lifetimes: access token **15 minutes**, refresh token **7 days**
    (cookie, set by the backend — the frontend never reads or sets it
    directly).
  - Claims on the access token: **`sub` (user id) and `role` only**. If a
    display name or email is needed in the UI, fetch it separately (e.g.
    `GET /api/auth/me`) — do not decode the JWT for anything beyond `role`
    (and `sub` if needed for cache keys).
  - Endpoints: `POST /api/auth/login`, `POST /api/auth/refresh`,
    `POST /api/auth/logout`.
  - Logout: call `POST /api/auth/logout` (revokes the refresh token
    server-side — see `backend/AGENTS.md` Section 5), then clear local
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
├── .env.example          VITE_API_BASE_URL, VITE_USE_MOCK_API
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
    │   ├── visitor/      visitor pages ("/visit/*"), all lazy-loaded
    │   ├── staff/        thin ops pages ("/staff/*"), all lazy-loaded
    │   └── admin/        admin pages ("/admin/*"), all lazy-loaded
    ├── features/
    │   ├── landing/      landing.css, landing-content.ts, landing-motion.ts,
    │   │                 sections/ (one component per landing section)
    │   ├── staff/        StaffShell, staff-nav, use-mobile-nav, StaffUi
    │   │                 (shared chrome), status/type vocabulary, formatters,
    │   │                 attention (the "needs me now" queue + fleet bands),
    │   │                 staff-hooks (query layer)
    │   └── administration/ AdminShell, admin-nav, admin-analytics (pure DTO to
    │                     chart rows), charts/ (Recharts, admin only)
    ├── api/              client.ts (the one HTTP client), signalr.ts (hub
    │                     factory), contracts/ (endpoint DTOs + calls)
    ├── auth/             AuthLayout + LoginPage/RegisterPage/AuthFields,
    │                     access.ts (the areas), roles.ts, use-logout.ts
    ├── mocks/            labelled mock backend — see below
    ├── stores/           auth-store.ts (memory only), theme-store.ts
    ├── three/            DigitalTwinCanvas.tsx (R3F canvas)
    └── test/             setup.ts (Vitest + jest-dom)
```

There are four entry points: `/` (public landing page), `/visit/*` (the visitor
app, behind the visitor guard), `/staff/*` (operations, behind the staff guard)
and `/admin/*` (administration, behind the admin guard).

**Who may enter what is written in exactly one place: `src/auth/access.ts`.**
The router's `RequireArea` guard asks `AREAS[...].allows(role)`, and the
"Vai trò & quyền" screen renders its matrix by calling the same function, so the
screen cannot drift from the guard. Change a rule there, not at a call site.
`src/auth/roles.ts` holds role normalisation, the Vietnamese role names and
`homePathForRole()`, which is what decides where a fresh sign-in lands.

The visitor booking/tour flow was removed on 2026-09-16 and came back on
2026-09-18 as its own area at `/visit/*`, with its own shell, routes, contract
and English surface. A visitor account is therefore a real account with a real
app, not a public-site-only account. The 2026-09-18 note that said otherwise was
written while the flow was gone; do not restore it.

The `_to_delete/` holding area was deleted for good on 2026-09-18. Git history is
the only copy of anything that was in it.

`src/components/` currently holds nothing: the landing page redesign on
2026-09-17 gave the theme control its own landing-token styling inside
`features/landing/sections/SiteNav.tsx`, which left `components/ui/ThemeToggle.tsx`
with no consumer, and it was deleted with the rest of `_to_delete/` on
2026-09-18. Re-create `src/components/` only when a component genuinely has more
than one consumer.

Tests live next to the code they cover (`*.test.ts(x)`).

### Mock backend mode

The auth/booking/ops backend was removed (`7d0a17e`), so `/api/auth/*` and
`/api/staff/*` do not exist. The app runs on the labelled fixtures in
`src/mocks/`. There is no toggle: `VITE_USE_MOCK_API` and every
`USE_MOCK_API ? mock : http` ternary were removed on 2026-09-18, because with no
backend to point it at the switch only ever had one position and the other
branch was never exercised.

- `mocks/staff-mock.ts` implements the `StaffApi` contract, the same
  type `api/contracts/staff.ts` implements over HTTP, so feature code does
  not know which one it has. The binding is named once, in
  `features/staff/staff-hooks.ts`;
- `mocks/auth-mock.ts` issues a fake token so the area guards can be exercised.
  There are exactly two accounts, one per signed-in role: `admin/admin` is an
  `Admin`, `staff/staff` is a `Staff`. Sign-up mints a `Visitor`. It is not
  authentication and grants nothing server-side;
- mock data is disclosed, but out of the way: a one-line badge in each shell and
  on the auth screens, rendered only when `import.meta.env.DEV` is true, plus a
  `console.warn` from `mocks/mock-mode.ts` that fires in every build. Do not put
  build state back into the middle of a screen someone works in all day.

This is a **data source, not a fallback**. Mock data must never be served in
response to a failed request, and no screen may branch on where its rows came
from.

`src/api/` stays: `client.ts` (HTTP client, token refresh, `ApiError`, `apiUrl`),
`signalr.ts` (hub factory) and the `staffApi` implementation in
`contracts/staff.ts` are the written record of the endpoints this frontend
expects. They are **deliberately unwired**, not dead code, and an import sweep
will say otherwise - do not delete them. When the backend lands: bind
`staffApi` in `staff-hooks.ts`, restore the `/api/auth/*` calls in
`LoginPage`/`RegisterPage`/`use-logout` (the logout call is a security
requirement, not a nicety - see §1), then delete `src/mocks/`.

## 3. Development Rules

- No business rule is reimplemented in the frontend. If the dashboard needs a
  computed value (robot utilisation, ETA, wait time), the backend returns it.
- The ops dashboard is used by campus staff with no robotics background: a
  robot state shown to them must be a plain-language label, not a raw ROS enum.
- Any route under `/staff/*` or `/admin/*` must be wrapped by `RequireArea`.
  A new page is not done until it is behind the guard — do not rely on "nobody
  will guess the URL", and never rely on simply not rendering a nav link.
- **No dead navigation.** A nav item must open a page that does something with
  real data. Administration ships two entries today because two are all the
  current contracts support; the rest are listed once, as prose, in the
  "Chưa khả dụng" panel on the admin overview. When an endpoint lands, move its
  item out of that list and into `features/administration/admin-nav.ts`.
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
  Both signed-in Vietnamese consoles are Tailwind utilities on the same values:
  ground `#f1f6fe`, panel border `#dce9fb`, ink `#1f314d` / `#40546f` / `#647793`
  / `#71819a` / `#8a98ac`, primary `#2f62b8`, accent `#5b91ed`, soft fills
  `#eaf4ff` / `#edf2fa` / `#f8fbff`, focus ring `#4f8df7`. Administration ran a
  separate slate palette until 2026-09-18; it was dropped because the only
  account that can open both areas is an Admin, so the only person who ever saw
  the difference was the one guaranteed to cross it. The two still differ in
  *priority* — administration has no alert bell and no live badge — which is the
  right axis to diverge on.
  - Shared chrome lives in `features/staff/StaffUi.tsx` and is used by
    both areas: `panelClass`, `PageHeader`, `PanelHead`, `SummaryTile`,
    `CellIcon`, `StatusBadge`, `LoadingPanel`, `ErrorPanel`, `PageSkeleton`.
    Build a page out of those before writing new markup.
  - **One accent.** `SummaryTile` never tints itself by meaning, because colour
    on these screens already means severity on a `StatusBadge`. The exceptions
    are deliberate and few: `StatusBadge` tones (`features/staff/status.ts`),
    the fleet-health counts, the access matrix's yes/no, and the chart *series*
    colours in `features/administration/charts/chart-utils.ts` — where a bar IS a
    status. Everything else is blue.
  - A screen's summary row counts rows the API already returned, for the labels
    on that same screen. That is presentation. Anything genuinely derived still
    comes from the backend (Section 3).
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
- HTTP access stays behind `src/api/` and feature-level query/mutation hooks.
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

## 4. Live robot data

The dashboard shows live fleet state. That data crosses a contract boundary
owned jointly with `robot/` and `backend/` — see `docs/architecture.md`.

The Web-based 3D Operational Digital Twin is core UI scope and lives in this
app. It loads the campus model, renders physical/Gazebo/synthetic robot models,
and visualizes backend identity, pose/heading, connection/operational state,
active tour/leg, fault/health, and optional battery telemetry. Pose conversion
uses one explicit ROS-map -> Twin-world transform (origin offset, axis
conversion, rotation, and scale), rather than hardcoded coordinate formulas
scattered across components. The 3D view is not a physics engine, web Nav2,
collision simulator, sensor-stream viewer, scenario editor, or predictive
engine.

How the backend itself gets that state from the robots is settled (a bridge
node in `robot/`, `docs/architecture.md` §3). What is still open is only the
last hop, backend -> browser.

Decision (backend -> browser): **SignalR** (`@microsoft/signalr`), matching the
ASP.NET backend. `src/api/signalr.ts` exposes a `createHubConnection(hubPath)`
factory only:

- the hub URL is resolved against `VITE_API_BASE_URL` — never hard-coded;
- nothing connects on import. The component/hook that needs live data owns
  `start()` / `stop()`;
- `withAutomaticReconnect()` is on by default.

No hub is consumed yet — the backend hub contract is not defined.

<!-- TODO(WP5): ghi quyết định SignalR + tên hub/method vào
docs/architecture.md khi backend chốt contract. -->

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

<!-- TODO(WP5): thêm constraint khác khi có. -->
