# SignalR compatibility Phase S1

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
Fleet Bridge. Reconnect, backend restart, duplicate handler prevention,
acknowledgement/retry, bounded buffering, silent connection loss, and soak are
Phase S2.
