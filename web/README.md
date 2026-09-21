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

## Robot simulator preview

Open `/staff/digital-twin` after signing in with the local demo account
`staff/staff`. The preview shows the supplied campus map and `robot_01` following
a synthetic circular route. Playback starts paused; play/pause, reset,
0.5×/1×/2× playback and an overhead camera are available. These controls only
affect the browser preview and send no robot commands. A WebGL-capable browser
is needed for the 3D scene.

`web/src/features/digital-twin/demo-motion.ts` owns the local pose fixture and
the explicit map-to-scene conversion: metres, map `(x, y)` to scene `(x, 0, -y)`,
with yaw about the scene's vertical axis. The canvas consumes a pose rather
than opening a connection. The robot shape and route are illustrative;
there is no physics, LiDAR stream or real robot connection in this preview.
Connecting telemetry later requires the agreed backend contract and map alignment.
The existing fleet list below the preview remains a separate data source.

The map is a deployment copy of `robot/Map3d/map.obj` and
`robot/Map3d/map.mtl` in `web/public/models/simulator-map/`. Keep both files
together when updating the asset. The source files stay in the robot folder;
the web build needs no access to that folder. OBJ materials are loaded from the
MTL file. The display keeps Y up, centers the X/Z bounds, scales the largest
horizontal dimension to 20 scene units, and places model Y=10 at scene ground.
This is presentation calibration, not a measured map-to-ROS alignment. The
existing circular demo route has no collision or terrain following behavior.

## Verify

```bash
web/scripts/verify        # npm ci -> typecheck -> lint -> test -> build
```
