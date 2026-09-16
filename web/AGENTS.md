# AGENTS.md — `web/`

Visitor booking app and operations dashboard for CampusTour DT-AMR (Work
Package 5). Read the repo-root `AGENTS.md` first for the shared rules; this
file only covers what is specific to `web/`.

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
- Codebase shape: **one app, one deploy**. Visitor booking (public) and ops
  dashboard (staff-only) live in the same React app, same Vercel project,
  same domain. They are split by route + role, not by separate apps:
  - `/` and public routes: visitor booking flow, no login required.
  - `/admin/*`: ops dashboard, behind auth. A route guard checks the logged-in
    user's role and redirects to login (or a 403 page) if they lack the
    `staff`/`ops` role. Never hide `/admin/*` by UI alone (e.g. just not
    showing a nav link) — the guard must actually block navigation.
  - `/admin/*` is **lazy-loaded** (`React.lazy` + route-based code splitting)
    so a visitor loading `/` never downloads dashboard code, and vice versa
    for a staff member going straight to `/admin`.
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
    on every API request. Carries the user's role (`staff`/`ops`/etc.) as a
    claim — the `/admin/*` route guard reads the role from the decoded token,
    not from a separate call.
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
├── .env.example          VITE_API_BASE_URL
├── scripts/verify
└── src/
    ├── main.tsx          StrictMode -> QueryProvider -> RouterProvider
    ├── index.css         @import "tailwindcss"
    ├── vite-env.d.ts     typing for VITE_* env vars
    ├── app/
    │   ├── providers/    query-provider.tsx (TanStack Query)
    │   └── router/       index.tsx — route config
    ├── routes/
    │   ├── public/       PublicHomePage.tsx  ("/")
    │   └── admin/        AdminDashboardPage.tsx, DigitalTwinPage.tsx
    │                     ("/admin", "/admin/digital-twin"), lazy-loaded
    ├── features/         feature-based modules (empty until the first feature)
    ├── components/ui/    shared UI (MotionTest.tsx — motion smoke test)
    ├── api/              client.ts (the one API client), signalr.ts (hub factory)
    ├── auth/             route guard + login flow (empty — not implemented yet)
    ├── stores/           ui-store.ts (Zustand, client/UI state only)
    ├── three/            DigitalTwinCanvas.tsx (R3F smoke test)
    └── test/             setup.ts (Vitest + jest-dom)
```

`src/features/` and `src/auth/` are empty on purpose: they get their first file
when the first real feature / the auth flow lands. Tests live next to the code
they cover (`*.test.ts(x)`).

---

## 3. Development Rules

- No business rule is reimplemented in the frontend. If the dashboard needs a
  computed value (robot utilisation, ETA, wait time), the backend returns it.
- The ops dashboard is used by campus staff with no robotics background: a
  robot state shown to them must be a plain-language label, not a raw ROS enum.
- Any route under `/admin/*` must be wrapped by the role-checking route
  guard. A new admin page is not done until it is behind the guard — do not
  rely on "nobody will guess the URL".
- Styling is Tailwind utility classes in JSX. Avoid a separate CSS file per
  component unless Tailwind genuinely cannot express it (e.g. a keyframe
  animation).

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
setup is checked by rendering `/admin/digital-twin` in a browser.

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
