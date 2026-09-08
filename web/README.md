# web/ — CampusTour DT-AMR

Visitor booking app (`/`) and operations dashboard (`/admin/*`), one Vite +
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

`VITE_*` values ship to the browser — never put a secret in one.

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
