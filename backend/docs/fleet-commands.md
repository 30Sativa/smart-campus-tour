# Fleet Commands v1 (backend)

The wire format is [`docs/contracts/fleet-commands/v1/`](../../docs/contracts/fleet-commands/v1/README.md).
This page records backend behavior. Decisions: ADR-0042, ADR-0043.

| Endpoint | Purpose |
|---|---|
| `POST /api/fleet/commands/v1/poll` | Returns the robot's current command, or `null`. |
| `POST /api/fleet/commands/v1/{commandId}/results` | Records one phase of one command. |

Both use the Fleet Sync robot scheme (`Authorization: Bearer`, `X-Robot-Code`). User JWTs get 401.
`FleetCommands:Enabled` is false by default, and both endpoints then answer 503
`COMMAND_TRANSPORT_DISABLED`. Fleet Sync v1 stays telemetry-only: `commands` is always `[]`.

## Poll

`streamId` must be the stream of the robot's latest report, received within
`FleetCommands:MaxTelemetryAgeSeconds`; otherwise 409 `STREAM_NOT_CURRENT` and nothing is delivered.

- PENDING becomes DELIVERED with `DeliveredStreamId`, in one transaction under the Tour and command locks.
- Polling again on the same stream returns the same command.
- A command delivered to another stream becomes UNKNOWN (`STREAM_CHANGED`) and is not redelivered, using the sweeper's rule.
- A Cancel goes before its GoTo and is always delivered, so a robot that lost dispatch can still be told to stop.
- A new GoTo needs a RUNNING NORMAL Tour and a robot with `IsDispatchEnabled = 1` and `NeedsInspection = 0`.

## Results

The acknowledgement is sent after the transaction commits. `data` is `{accepted, duplicate, commandState}`.

| Status | Code | Meaning |
|---|---|---|
| 200 | | Recorded; `duplicate: true` for an exact repeat, with no effect. |
| 400 | | Invalid shape, or `commandId` differs from the path. |
| 401 | | Credential problem. |
| 404 | `COMMAND_NOT_FOUND` | Unknown command, or another robot's. |
| 409 | `RESULT_CONFLICT` | Different content for a recorded phase, or a `legId` that is not the command's. |
| 409 | `RESULT_STREAM_MISMATCH` | Not the stream that received the command. |
| 409 | `RESULT_PHASE_NOT_ALLOWED` | Transition not allowed. |
| 503 | `COMMAND_TRANSPORT_DISABLED` | Commands are off; keep terminal results and retry. |

## Rate limit

Poll and results share the `FleetSync` policy and its budget with sync: `FleetSync:RateLimit:PermitLimit`
(600) per `WindowSeconds` (60), partitioned by client IP. One robot syncing and polling once per second uses
about 120 requests a minute plus a few results, so a single robot has about five times the room it needs.
Robots behind one address share the budget. Telemetry must arrive faster than `MaxTelemetryAgeSeconds`, or
polls are refused; the real bridge cadence is an M2.3 measurement.

## Operator console

`operatorConsoleConnected` passes while the Operator holds an open `/hubs/operations` connection. The count
is in memory per API instance, so it needs the single-instance deployment of ADR-0019 and starts empty after a
restart.
