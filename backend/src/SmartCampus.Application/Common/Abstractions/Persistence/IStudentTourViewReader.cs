using SmartCampus.Application.Common.Abstractions.Assistant;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>
/// Read-only Tour data for an invited Student (docs/architecture.md §3.2.3): the active route and its progress
/// columns. Never roster, account or invitation data.
/// </summary>
public interface IStudentTourViewReader
{
    /// <summary>The Tour's state, progress columns and active route stops in stop order. Null when the Tour does not exist.</summary>
    Task<StudentTourViewData?> LoadAsync(Guid tourId, CancellationToken ct);

    /// <summary>
    /// The POI of the current stop while a RUNNING Tour is at it (CurrentStep PREPARING_VIEW or OBSERVING), for the
    /// Q&amp;A snapshot (§7.1). Null in every other step, including while navigating towards the stop.
    /// </summary>
    Task<AssistantPoi?> FindCurrentPoiAsync(Guid tourId, CancellationToken ct);
}

public sealed record StudentTourStopData(int Order, Guid PoiId, string Name, string? Description, string? NarrationText,
    string? AudioUrl, int? NarrationSeconds, int DwellSeconds);

public sealed record StudentTourViewData(string State, string? CurrentStep, string? OperationalStatus, bool IsHeld,
    Guid? CurrentPoiId, Guid? LastArrivedPoiId, IReadOnlyList<StudentTourStopData> Stops);
