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

- All backend access goes through one API client module. No `fetch` scattered
  through components.
- No business rule is reimplemented in the frontend. If the dashboard needs a
  computed value (robot utilisation, ETA, wait time), the backend returns it.
- The ops dashboard is used by campus staff with no robotics background: a
  robot state shown to them must be a plain-language label, not a raw ROS enum.
- Server data goes through TanStack Query hooks (`useQuery`/`useMutation`),
  never a raw `useEffect` + `fetch`/`useState` combo.
- Any route under `/admin/*` must be wrapped by the role-checking route
  guard. A new admin page is not done until it is behind the guard — do not
  rely on "nobody will guess the URL".
- Zustand stores are for client-only state. If you find yourself caching
  server data in a Zustand store, it belongs in TanStack Query instead.
- Styling is Tailwind utility classes in JSX. Avoid a separate CSS file per
  component unless Tailwind genuinely cannot express it (e.g. a keyframe
  animation).

- Component structure is **folder-by-feature**: a feature owns its components,
  hooks and query hooks under `src/features/<feature>/`. Promote something to
  `src/components/ui/` only when a second feature actually needs it.

---

## 4. Live robot data

The dashboard shows live fleet state. That data crosses a contract boundary
owned jointly with `robot/` and `backend/` — see `docs/architecture.md`.

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
- No control action (dispatch a robot, override an assignment, e-stop) without
  an explicit confirmation step.
- Do not commit `node_modules/` or build output.

<!-- TODO(WP5): thêm constraint khác khi có. -->
