# Fleet Commands v1

**Status: Accepted in [ADR-0042](../../../decisions/0042-m2-command-transport-and-start-readiness.md) (03/11/2026); not implemented until M2.2.**
No backend endpoint, DTO, table or bridge code exists for this contract yet.
Fleet Sync v1 stays telemetry-only and always returns `commands: []`. Dispatch
stays off until the M2.3 safety evidence.

The robot pulls its one current movement command over HTTPS and reports results
per command. Fleet Sync v1 ([`../../fleet-sync/v1/`](../../fleet-sync/v1/)) is
unchanged and is still the only telemetry path.

## Authentication and enable flag

Same robot scheme as Fleet Sync v1: `Authorization: Bearer <credential>` and
`X-Robot-Code: <RobotCode>` over HTTPS. User JWTs are refused. While
`FleetCommands:Enabled = false` (the default), both endpoints return
`503 COMMAND_TRANSPORT_DISABLED`.

## Poll — `POST /api/fleet/commands/v1/poll`

Request: [`poll-request.json`](poll-request.json).

| Field | Rule |
|---|---|
| `streamId` | UUID of the bridge's current Fleet Sync stream. Must equal the stream of the robot's latest accepted telemetry report, received by the server no more than `FleetCommands:MaxTelemetryAgeSeconds` ago (default 2, SRS §7; Fleet Sync `SyncFreshness` is not used), otherwise `409 STREAM_NOT_CURRENT` and nothing is delivered. |

Response `data.command` is `null` ([`poll-response-empty.json`](poll-response-empty.json)),
a GoTo ([`poll-response-goto.json`](poll-response-goto.json)) or a Cancel
([`poll-response-cancel.json`](poll-response-cancel.json)).

| Field | Rule |
|---|---|
| `commandId` | UUID. Idempotency key: the same `commandId` must never create a second Nav2 goal. |
| `kind` | `GoTo` or `Cancel`. |
| `legId` | UUID of the leg attempt. A retry is a new leg. |
| `mapKey`, `frameId` | GoTo only. Must equal the map the robot actually loaded; otherwise reject with `MAP_MISMATCH`. Never copy them into robot configuration. |
| `x`, `y`, `yaw` | GoTo only. Metres / radians in that map frame; maps to Nav2 `NavigateToPose`. |
| `stopId` | GoTo only, nullable metadata (`RouteRevisionStops.Id`). Not a robot-local lookup key; `null` for the end leg. |
| `issuedAt` | UTC time the backend committed the command. |
| `acceptBy` | GoTo only. If the robot receives the GoTo after this time by its own clock, it rejects it with `EXPIRED`. |

Poll behavior:

- The same stream gets the same command again until it is resolved; deduplicate by `commandId`.
- When the open GoTo has a Cancel, poll returns the Cancel.
- A new stream never receives a command that an earlier stream already received; that command becomes `UNKNOWN` on the backend.
- The example `mapKey` `tang-6-v1` is illustrative and approves no map.

## Result — `POST /api/fleet/commands/v1/{commandId}/results`

Requests: [`result-accepted.json`](result-accepted.json),
[`result-rejected.json`](result-rejected.json),
[`result-terminal-arrived.json`](result-terminal-arrived.json).

| Field | Rule |
|---|---|
| `commandId` | Must equal the path value. |
| `legId` | Must equal the command's leg. |
| `streamId` | Must equal the stream that received the command. |
| `reportedAt` | UTC time the robot created this result. |
| `phase` | `ACCEPTED`, `REJECTED` or `TERMINAL`. A Cancel reports only `ACCEPTED`/`REJECTED`; the leg's terminal outcome is reported on its GoTo command. |
| `outcome` | `ARRIVED`, `CANCELLED` or `FAILED` when `phase = TERMINAL`; otherwise `null`. If arrival beat the cancel, report `ARRIVED`. A local stop on connectivity loss is `FAILED` with its own reason, never `CANCELLED`. |
| `reason` | Nullable UPPER_SNAKE code, e.g. `MAP_MISMATCH`, `BUSY`, `EXPIRED`, `UNKNOWN_LEG`. |

The backend answers `200` only after the resulting state change and its
`TourEvents` row are committed:

```json
{"accepted":true,"duplicate":false,"commandState":"ACCEPTED"}
```

| Response | Meaning and bridge action |
|---|---|
| `200 duplicate:true` | Exact repeat of a recorded result. Stop retrying it. |
| `400` | Invalid shape. Fix; do not retry unchanged. |
| `401` | Credential problem. Stop until corrected. |
| `404 COMMAND_NOT_FOUND` | Unknown command or another robot's. Drop it. |
| `409 RESULT_CONFLICT` | Different content for a phase already recorded. Producer bug; drop it. |
| `409 RESULT_STREAM_MISMATCH` | `streamId` is not the stream that received the command. Drop it. |
| `409 RESULT_PHASE_NOT_ALLOWED` | Transition not allowed (e.g. TERMINAL on a Cancel, any result for an expired command). Drop it. |
| `503 COMMAND_TRANSPORT_DISABLED` | Commands are disabled. Keep terminal results and retry later. |
| network error / `5xx` | Outcome unknown. Retry the exact body with bounded backoff. |

Terminal results are kept by the bridge and retried until a `200` or a
definitive `4xx`. An `ACCEPTED` or later `IDLE` report never replaces a
terminal result.

## Not covered

Head/camera commands, Hold/Next (backend-only Tour operations, not robot
commands), E-stop and `/cmd_vel`. The robot-local safety prerequisites in
`docs/architecture.md` §6 remain required before any physical GoTo.
