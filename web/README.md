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
| `VITE_QUEST_WHEP_URL` | **Dev server only**: the NUC's own MediaMTX in the LAN. A production build ignores it; deployed pages get the relay URL and a token from the API (ADR-0055) | `http://10.80.192.207:8889/quest/whep` |
| `VITE_QUEST_ICE_SERVERS` | Optional comma-separated STUN URLs | `stun:stun.l.google.com:19302` |
| `VITE_CLOUDINARY_CLOUD_NAME` | **Build only**: serve `public/images/` from Cloudinary (see below). Unset keeps the local files | `xryd77ty` |

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

### Pictures on Cloudinary

A build with `VITE_CLOUDINARY_CLOUD_NAME` set loads every picture of `public/images/` from Cloudinary
(`f_auto,q_auto`: AVIF/WebP at automatic quality, so the 2–3 MB PNGs arrive far smaller) instead of from this site.
`vite.config.ts` (`cloudinaryImages`) rewrites the `/images/…` paths at build time, so components keep plain
`/images/…` paths and the dev server and tests use the local files. Videos stay in `public/videos/`.

1. Upload the pictures, with the credentials only in your shell (Cloudinary Console → Settings → API Keys → API
   environment variable). PowerShell:
   ```powershell
   $env:CLOUDINARY_URL = "cloudinary://<api_key>:<api_secret>@xryd77ty"
   npm run images:upload
   ```
   It uploads new or changed files as `smartcampus/images/<path without extension>` and skips the rest. Run it
   again whenever a file in `public/images/` is added or changed, before deploying.
2. Set `VITE_CLOUDINARY_CLOUD_NAME=xryd77ty` in the Vercel project's environment variables and redeploy.

Unset the variable and redeploy to go back to the local files. A new picture must not have a space in its
file name, and two pictures in one folder must not differ only by extension (they would share a public ID).

**Tour cover images.** Staff pick an image in "Tạo Tour" / "Sửa Tour"; after the save the page uploads it straight
to Cloudinary under `smartcampus/tours/cover/<tour id>` with a signature from
`POST /api/staff/manage/tours/{id}/cover-image-upload` (the backend's `Cloudinary` settings, the same account as
the fallback videos). Representative pages show it from `https://res.cloudinary.com/<VITE_CLOUDINARY_CLOUD_NAME>/…`
and fall back to the sample picture when the Tour has none or the variable is unset, so set
`VITE_CLOUDINARY_CLOUD_NAME` in `.env.local` too if you want to see uploaded covers on the dev server.

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

### Vercel routing

Set the Vercel project's Root Directory to `web` and use the Vite preset.
`web/vercel.json` serves the React app's HTML entry point for browser routes,
so opening or refreshing `/login`, `/admin/*`, `/staff/*` and `/dai-dien/*`
reaches React Router instead of Vercel's `404 NOT_FOUND` page. Redeploy after
changing this configuration.

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
