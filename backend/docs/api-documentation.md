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
- Operations carry a concise summary, a role/function tag, and an expanded
  description of the current authorization, important request fields, state
  effects, and applicable errors. Product label **Tour Staff** maps to the
  existing `Staff` role; `Tour Operator` is an assigned duty, not a role.
- Versioned map/POI operations are grouped under `Technical Staff — Maps`,
  `Tour Staff — POI Proposals`, and `Technical Staff — POI Verification`.
  Upload stores a validated package version but does not deploy it. Deployment
  checks are manually entered evidence; a new PASS requires the robot's durable
  first accepted Fleet Sync confirmation for its current credential, while
  FAIL remains available without confirmation. POI submission is not PASS; a technical
  result is scoped to the recorded revision/fingerprint and evidence.
- `GET /api/technical/physical-robots` returns safe confirmation context and
  connection status; `POST` registration remains `{robotCode, displayName}`
  without requestId. Duplicate codes return 409 through the database unique
  constraint. Registration creates an unassigned PHYSICAL identity without an
  active credential. Technical Staff can issue, rotate and revoke through the
  `/api/technical/robots/{robotCode}/credential*` endpoints; Admin can only
  revoke as an emergency action and view safe status/audit. Issue/rotate secrets
  are returned once with `Cache-Control: no-store`; status and audit reads never
  return the secret or hash. Credential operations use requestId and rowVersion
  guards, and write their append-only audit entry with the credential/confirmation
  change in one transaction. Staff receives connection status only. Provisioning
  CLI calls the same lifecycle service with a distinct least-privilege SQL role.
- Remaining legacy reads and the partial Staff pre-execution Tour API are
  identified as legacy/pending in Swagger. The replaced Admin aliases, legacy
  POI catalog and mutable Route authoring operations are absent from routing
  and OpenAPI under ADR-0027. Admin account management remains Admin-only.

### Endpoint migration/status snapshot

| Endpoint group | Current permission | Target ownership | Status |
|---|---|---|---|
| `/api/admin/accounts` | Admin | Admin | Implemented account management, including TechnicalStaff accounts |
| `/api/technical/map-versions/*`, `/api/maps/versions/*` | Upload/check: TechnicalStaff; version reads: Staff or TechnicalStaff | Technical Staff for map setup; Staff may read versions | Implemented backend API; deployment check is manual evidence; physical commissioning pending |
| `/api/technical/physical-robots` | TechnicalStaff | Technical robot registration and first-sync confirmation | Registration is identity-only; connection status is safe confirmation plus current RAM sync freshness; new map-check PASS requires persisted confirmation |
| `/api/staff/poi-proposals/*` | Mutations: Staff; reads: Staff or TechnicalStaff | POI proposal: Tour Staff; verification: Technical Staff | Implemented versioned proposal and per-revision result API; route certification and frontend integration pending |
| `/api/staff/poi-proposals/*`, `/api/technical/poi-*/*` | Staff proposal operations; Technical verification | Tour Staff proposals; Technical Staff verification | Versioned workflow implemented; project YAML import pending |
| `GET /api/staff/manage/routes*` | Staff | Legacy Route projection for existing Tour readers | Retained legacy reads only; authoring uses versioned Route APIs |
| `/api/staff/routes*`, `/api/routes*`, `/api/technical/route-verifications*` | Staff authoring/read; Technical manual test evidence | Tour Staff authoring; Technical Staff check | Versioned Route preparation implemented; physical tests/scheduling pending |
| `/api/staff/manage/tours/*` | Staff | Assigned Tour Staff | Partial legacy pre-execution slice; schedule/reservation/READY migration pending |
| `/api/staff/manage/registrations/*` | Staff reads and per-row review; Representative email request / Staff review | Tour Staff registration workflow | Current row-specific workflow; no aggregate review or direct Admin email replacement |
| Former `/api/admin/pois/*`, `/api/admin/routes/*`, `/api/admin/tours/*`, `/api/admin/registrations/*` | No route | Business ownership as above | Retired under ADR-0027; legacy data retained |

Authentication, invitation/session, Representative, Viewer, robot Fleet Sync,
and platform endpoints are separately tagged with their actual current access
mechanism. Swagger is a description of current API behavior plus clearly
identified target ownership; tags do not grant permissions.

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
