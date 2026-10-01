# web/ — CampusTour DT-AMR

Public site (`/`), tour operations (`/staff/*`) and administration (`/admin/*`), one Vite +
React + TypeScript app, one deploy. See `AGENTS.md` for the decisions and
rules that apply here.

## Run locally

```bash
npm install
cp .env .env.local        # set VITE_API_BASE_URL=https://localhost:7092 locally
npm run dev               # http://localhost:5173
```

### Environment

| Variable | Meaning | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API base URL, used by `src/api/client.ts` and the SignalR hub factory | `https://localhost:7092` |
| `VITE_QUEST_WHEP_URL` | Optional Quest WebRTC endpoint; empty keeps the current video source | `http://10.80.192.207:8889/quest/whep` |
| `VITE_QUEST_ICE_SERVERS` | Optional comma-separated STUN URLs | `stun:stun.l.google.com:19302` |

`web/.env` is tracked with empty values as the shared list of variables.
`web/.env.local` holds machine-specific values and is ignored by Git. Local
values override the shared declarations. An empty `VITE_API_BASE_URL` sends
requests to the frontend origin, which requires a same-origin API or proxy;
local Vite does not provide one. Use the backend's HTTPS URL directly because
its HTTP URL redirects to HTTPS, including CORS preflight requests.

For deployment, set the variables in that environment's build settings (for
example, Vercel environment variables). Variables already present in the build
environment take priority over the files. Vite embeds `VITE_*` values at build
time, so rebuild/redeploy after changing them. Keep secrets in the backend or
service environment, never in frontend variables or the tracked file.

Login, refresh and logout use the backend through `/api/auth/*`; configure
`VITE_API_BASE_URL` for the API host. Access tokens stay in memory and the
backend refresh cookie restores a session after reload. Business features that
do not yet have live API bindings continue to use labelled fixtures in
`src/mocks/`.

Fixtures are a data source, not a fallback: nothing here is served in response to
a failed request.

Sign-in requires an account provisioned by the system. There is no public
self-registration route. The business fixtures do not provide login accounts.

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

Open `/staff/digital-twin` after signing in with a provisioned Staff account.
The preview shows the supplied campus map and `robot_01` following
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
