using System.Collections.Concurrent;
using SmartCampus.Application.Features.RobotDiagnostics;

namespace SmartCampus.Infrastructure.Integrations.RobotDiagnostics;

public sealed class InMemoryRobotDiagnosticsStore : IRobotDiagnosticsStore
{
    private readonly ConcurrentDictionary<string, RobotDiagnosticsSnapshot> store = new(StringComparer.OrdinalIgnoreCase);

    public Task<bool> ApplyAsync(
        RobotDiagnosticsSnapshot snapshot,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        store[snapshot.RobotCode] = snapshot;
        return Task.FromResult(true);
    }

    public RobotDiagnosticsSnapshot? GetLatest(string robotCode) =>
        store.TryGetValue(robotCode, out var snapshot) ? snapshot : null;

    public IReadOnlyList<RobotDiagnosticsSnapshot> GetAll() =>
        store.Values.OrderBy(s => s.RobotCode, StringComparer.OrdinalIgnoreCase).ToArray();
}
