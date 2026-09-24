# SignalR compatibility Phase S1 / S2

This isolated harness checks basic Python SignalR JSON Hub Protocol compatibility
with ASP.NET Core/.NET 10. It is placed under backend integration tests because
the server side is the system under test; the client and pinned Python package
live under `robot/tools/signalr-compat/` and run in the exact ROS Humble base
image used by `robot/Dockerfile`. This integration spike touches `backend/` and
`robot/`; it does not add a robot runtime dependency or change the production
Dockerfile.

The test server is a separate minimal ASP.NET app with a temporary local bearer
credential and a self-signed TLS certificate. The client first uses the system
trust store and must reject that certificate, then explicitly trusts the
ephemeral certificate and must connect. The server accepts only the harness
credential. The dummy `GoTo` is recorded by the Python callback and is never
sent to ROS or Nav2. No production Hub, Fleet Bridge, database, or schema is
used.

## Reproduce

From the repository root in PowerShell, with .NET 10 and Docker Desktop running:

```powershell
pwsh -File backend/tests/SignalRCompatibilityHarness/run.ps1
```

The runner starts the isolated .NET 10 test Hub on an available host port,
creates an ephemeral certificate, runs the client in the digest-pinned
`ros:humble-ros-base` image, and removes the server, certificate, and temporary
files when finished. `robot/tools/signalr-compat/requirements.txt` pins the
candidate library for this spike only.

## Observed S1 evidence

- Humble base: `ros:humble-ros-base`, resolved digest
  `ros@sha256:1813d3c85d7f96ff7d3012d865204583255740182db5d0065f8f8cd029a83138`.
- OS/Python in that image: Ubuntu 22.04.5 LTS (Jammy), Python 3.10.12.
- Test Hub runtime: Microsoft.AspNetCore.App 10.0.12 on the Windows test host
  (SDK 10.0.401).
- Candidate: `signalrcore==1.0.2`. Its client exposes SignalR JSON/WebSocket
  invocations, custom SSL contexts, and request headers for local auth; those
  are the exact S1 capabilities exercised here. This is a test-only choice, not
  production dependency approval.
- Observed: valid TLS/auth connected; untrusted certificate and invalid
  credentials were rejected; typed `ReportState`, nullable pose, enum/UUID/UTC
  and numeric sequence binding passed; dummy `GoTo` reached Python; both
  `ReportCommandResult` phases passed; invalid and malformed sequence values
  were rejected by the Hub.
- Invalid values use an explicit `accepted=false` Hub result. This run did not
  establish how `signalrcore` exposes server-thrown Hub exceptions to its
  invocation callback; the production error mapping remains to be tested if it
  relies on Hub exceptions.

The observed run used:

```powershell
pwsh -File backend/tests/SignalRCompatibilityHarness/run.ps1
```

## S1 boundary

PASS proves only basic connection, TLS verification, local machine-style auth,
JSON binding, and bidirectional invocations. It does not approve a production
Fleet Bridge.

## Phase S2 attempt — BLOCKED

The S2 runner reuses this test Hub and pinned Humble client. It builds and runs
the Hub in the official Linux ASP.NET 10 runtime image, then starts the Python
client before creating the Hub container. The runner can stop/restart/kill or
pause the server container without adding any production service or changing
the production transport.

Reproduce from the repository root in PowerShell:

```powershell
pwsh -File backend/tests/SignalRCompatibilityHarness/run-s2.ps1
```

Observed environment:

- Python client: `ros:humble-ros-base`, digest
  `sha256:1813d3c85d7f96ff7d3012d865204583255740182db5d0065f8f8cd029a83138`,
  Ubuntu 22.04.5 LTS, Python 3.10.12, `signalrcore==1.0.2`.
- Linux Hub: `mcr.microsoft.com/dotnet/aspnet:10.0`, digest
  `sha256:55e37c7795bfaf6b9cc5d77c155811d9569f529d86e20647704bc1d7dd9741d4`,
  Ubuntu 24.04.4 LTS, `Microsoft.AspNetCore.App 10.0.7` and
  `Microsoft.NETCore.App 10.0.7`.
- Build stage: `mcr.microsoft.com/dotnet/sdk:10.0`, resolved digest
  `sha256:35d40304542c8689331f8cab17c65926cdf48fe711e289321d71924b230a7d29`.

Evidence before the blocking failure:

- The client started while the Hub was absent for 8 seconds, retried without a
  tight loop, then connected using the trusted ephemeral certificate and valid
  machine-style bearer credential. The initial retry took 9.462 seconds and
  used 3 `start()` attempts (including the 8-second backend absence).
- Linux parity exchanged `ReportState`, received one `DummyGoTo` callback, and
  sent a terminal `ReportCommandResult` before the disconnect test.
- When the Hub container was stopped, `send("ReportState", ...)` returned
  without raising, so the caller could not infer that the state was delivered.
  The connection did not invoke its close callback. After restarting the Hub,
  four `ReportState` completion waits timed out and the bounded 120-second
  recovery probe expired. The client log reported
  `'WebsocketTransport' object has no attribute 'connection_alive'`. One
  reconnect callback was observed 9.65 seconds after client startup, aligned
  with initial Hub appearance; no post-restart `ReportState` completion was
  confirmed.
- This is an S2 core reconnect failure. The checkpoint is **BLOCKED**. No
  protocol internals were patched and no alternate transport was introduced.

Not run after the blocking reconnect failure: five-cycle duplicate-handler
test, invalid-auth reconnect, silent-loss detection, result-ACK/replay, offline
buffer measurements, slow-receiver test, process-restart stream probe, and the
30-minute soak. These are unverified, not passes. The initial open and the one
reconnect callback observed before the failure ran on `Signalrcore websocket
client`; error/close callback threading remains unverified.

The current blocked result is compatibility evidence only. It does not revise
ADR-0008 or authorize implementation of the production Fleet Bridge.
