# API documentation (OpenAPI + Swagger UI)

The API can serve its generated OpenAPI 3.1 document at `/openapi/v1.json` and
Swagger UI at `/swagger`. Code: `backend/src/SmartCampus.Api/ApiDocumentation/`.
Tests: `backend/tests/SmartCampus.IntegrationTests/ApiDocumentationEndpointTests.cs`.

## Configuration

| Setting (env form) | Default | Meaning |
|---|---|---|
| `ApiDocumentation__Enabled` | `true` in Development, `false` elsewhere | Maps the document and the UI. When off, both paths return 404. |
| `ApiDocumentation__Username` | unset | Shared Basic credential for the two documentation paths. Non-blank, no `:`. |
| `ApiDocumentation__Password` | unset | At least 16 characters. Required with the username. |

Rules:

- Outside Development, `Enabled=true` **requires** username and password. A
  missing, short or malformed credential stops startup with a message naming the
  setting; the value itself is never printed.
- In Development the pages stay open by default, as before. Setting a
  credential there gates them the same way; `Enabled=false` turns them off.
- `ASPNETCORE_ENVIRONMENT` is not involved: Production stays Production.

The credential protects only `/swagger/*` and `/openapi/*`. It is compared in
constant time against SHA-256 digests and is not an account: it grants no API
access, and business endpoints still require the same JWT, roles, robot scheme,
CORS policy and rate limits as before. Nothing else in the pipeline changed.

## What the document contains

- Every controller endpoint plus `/health/live` and `/health/ready`. The
  development-only `/api/simulation/pose` is omitted unless SimulationPreview runs.
- A `Bearer` (JWT) security scheme. Only operations whose endpoint actually
  requires a user JWT carry the requirement, so Swagger UI sends the token
  there and nowhere else. Anonymous Auth/Student endpoints and the robot-only
  `POST /api/fleet/v1/sync` (FleetRobot scheme) are not marked.
- Request/response schemas, including field names such as `password`. It holds no
  configuration, connection strings, keys or data.

Testing endpoints from Swagger UI: call `POST /api/auth/login`, copy
`accessToken` from the response, click **Authorize** and paste it. Cookie endpoints
(`/api/auth/refresh`, `/api/auth/logout`) accept only the configured web origin,
so calling them from the API's own Swagger page is rejected by design. The token
is kept only in the page; reloading clears it.

## Exposure assessment

| Option | Verdict |
|---|---|
| Switch the host to `Development` | Rejected. It also loads `appsettings.Development.json` and User Secrets, and unlocks the SimulationPreview and local fixture/seed gates. |
| Public Swagger without a credential | Rejected for an internet-facing host: it publishes the whole route map, Admin and robot paths and DTO shapes to scanners, and gives anyone a ready-made client. |
| Admin JWT on the docs | Rejected: a browser navigation to `/swagger` cannot carry a bearer token without extra UI or cookie work. |
| IP allowlist / reverse proxy | Not needed now: no proxy exists, and team and reviewer IPs change. Security groups remain an option. |
| **Config flag + shared Basic credential** | Chosen: one setting to open or close, no new service or dependency, works in any browser. |

Remaining risks while enabled:

- Anyone holding the shared credential sees the full API surface. Security
  still rests on JWT/role authorization; the document only removes guesswork.
  Share the credential only with the team and reviewers, and rotate it when
  someone leaves.
- Basic credentials have no lockout or rate limit; the 16-character minimum
  assumes a random value (`openssl rand -hex 24`), not a memorable phrase.
- "Try it out" calls the live API with real data: an Admin token in Swagger can
  create, deactivate or cancel real records exactly as the web app can.
- The browser caches the Basic credential until it is closed.

For a real production launch set `ApiDocumentation__Enabled=false` (or delete the
three lines) and recreate the API. No code change is needed.

## Enabling on the EC2 host

The API container reads `/etc/campustour/api.env` (root-owned, mode 0600) only
when the container is **created**. Editing the file has no effect on a running
container.

1. As root, generate a password and add these lines to `/etc/campustour/api.env`:

   ```bash
   openssl rand -hex 24
   sudoedit /etc/campustour/api.env
   ```

   ```text
   ApiDocumentation__Enabled=true
   ApiDocumentation__Username=campustour-docs
   ApiDocumentation__Password=<value from openssl>
   ```

   Keep the file at mode 0600 (`sudo stat -c '%a' /etc/campustour/api.env`).
   Store the credential in the team password manager, not in Git or GitHub.

2. Apply it in one of these two ways:

   - **With a release (no extra step).** If the lines are in place before a
     release containing this feature deploys, the automatic deploy creates the
     new API container with them. Older images ignore these settings. A bad value
     fails the candidate's readiness check before promotion, so the running API
     stays in place and the deploy reports failure.
   - **Without a release.** Recreate only the API, under the same lock the deploy
     and TLS renewal use. Check first that no deployment is pending:

     ```bash
     test ! -e /var/lib/campustour/deployment.pending && echo OK
     ```

     ```bash
     sudo flock -w 900 /run/lock/campustour-operation.lock docker compose --project-name campustour --env-file /etc/campustour/backend.env --env-file /opt/campustour/current/release.env -f /opt/campustour/current/docker-compose.yml up -d --no-deps --force-recreate --wait --wait-timeout 240 api
     ```

     This replaces the running container directly: expect a few seconds to a
     minute of API downtime, and avoid it during a live tour. If it fails (for
     example a short password), the API is down until you fix or remove the
     lines and run the same command again; `sudo docker logs campustour-api-1`
     shows the setting name.

3. Check:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://api.fptcampustour.cloud/swagger/index.html
   curl -s -o /dev/null -w '%{http_code}\n' -u campustour-docs https://api.fptcampustour.cloud/openapi/v1.json
   curl -s -o /dev/null -w '%{http_code}\n' https://api.fptcampustour.cloud/health/ready
   ```

   Expect `401`, then `200` after typing the password, then `200`. Then open
   `https://api.fptcampustour.cloud/swagger` in a browser and sign in with the
   credential.

To disable, set `ApiDocumentation__Enabled=false` (or remove the three lines)
and recreate the API the same way; both paths return 404 afterwards.
