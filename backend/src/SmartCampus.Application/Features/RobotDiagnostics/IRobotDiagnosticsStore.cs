namespace SmartCampus.Application.Features.RobotDiagnostics;

public interface IRobotDiagnosticsStore
{
    Task<bool> ApplyAsync(
        RobotDiagnosticsSnapshot snapshot,
        CancellationToken cancellationToken);

    RobotDiagnosticsSnapshot? GetLatest(string robotCode);

    IReadOnlyList<RobotDiagnosticsSnapshot> GetAll();
}
