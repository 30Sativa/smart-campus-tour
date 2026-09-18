# web/ — CampusTour DT-AMR

Public site (`/`), tour operations (`/staff/*`) and administration (`/admin/*`), one Vite +
React + TypeScript app, one deploy. See `AGENTS.md` for the decisions and
rules that apply here.

## Run locally

```bash
npm install
cp .env.example .env      # then edit VITE_API_BASE_URL if the backend is elsewhere
npm run dev               # http://localhost:5173
```

### Environment

| Variable | Meaning | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API base URL, used by `src/api/client.ts` and the SignalR hub factory | `http://localhost:5000` |

The auth and operations endpoints do not exist yet, so **every screen runs on the
labelled fixtures in `src/mocks/`**. There is no flag: the switch was removed on
2026-09-18 because it only ever had one working position. `VITE_API_BASE_URL` is
still read by `src/api/client.ts` and the SignalR hub factory, so set it once the
backend exists. Turning the real path back on is one binding in
`src/features/staff/staff-hooks.ts` plus the auth calls - see
`src/mocks/mock-mode.ts`.

Fixtures are a data source, not a fallback: nothing here is served in response to
a failed request.

Sample accounts, mock mode only: `admin/admin` lands on `/admin`, `staff/staff`
lands on `/staff`. Sign-up mints a Visitor and lands on `/`.

`VITE_*` values ship to the browser, so never put a secret in one.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` then production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript only, no emit |
| `npm test` | Vitest, single run (CI mode) |
| `npm run preview` | Serve the production build |

## Verify

```bash
web/scripts/verify        # npm ci -> typecheck -> lint -> test -> build
```
