using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Routes;

public sealed record RouteStopInput(Guid PoiId, int DwellSeconds, IReadOnlyList<RouteHeadStep> HeadSteps);

public sealed record RouteInput(
    string Name, string? Description, string MapKey, string MapFrame,
    decimal StartX, decimal StartY, decimal StartYaw, string EndMode,
    decimal? EndX, decimal? EndY, decimal? EndYaw, IReadOnlyList<RouteStopInput> Stops);

public sealed record RouteUsage(bool HasReferences, bool HasReadyOrRunningTours)
{
    public bool CanEditConfiguration => !HasReferences;
    public bool CanEditMetadataAndAvailability => !HasReadyOrRunningTours;
    public bool CanDelete => !HasReferences;
}

public sealed record RouteListItem(Guid Id, string Name, string? Description, string MapKey,
    string MapFrame, bool IsActive, int StopCount, DateTimeOffset CreatedAt, DateTimeOffset? UpdatedAt);

public sealed record RouteStopDetails(Guid Id, Guid PoiId, string PoiName, int StopOrder,
    int DwellSeconds, IReadOnlyList<RouteHeadStep> HeadSteps);

public sealed record RouteDetails(Guid Id, string Name, string? Description, string MapKey,
    string MapFrame, bool IsActive, int StopCount, DateTimeOffset CreatedAt, DateTimeOffset? UpdatedAt,
    decimal StartX, decimal StartY, decimal StartYaw, string EndMode, decimal? EndX, decimal? EndY,
    decimal? EndYaw, IReadOnlyList<RouteStopDetails> Stops, string Version, RouteUsage Usage,
    IReadOnlyList<string> ConfigurationIssues, IReadOnlyList<string> AvailabilityIssues);
