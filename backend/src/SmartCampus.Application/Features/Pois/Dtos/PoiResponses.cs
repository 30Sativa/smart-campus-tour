namespace SmartCampus.Application.Features.Pois.Dtos;

public sealed record PoiListEntry(
    Guid Id,
    string Name,
    string MapKey,
    string MapFrame,
    decimal X,
    decimal Y,
    decimal Yaw,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt,
    byte[] RowVersion);

public sealed record PoiListItemResponse(
    Guid Id,
    string Name,
    string MapKey,
    string MapFrame,
    decimal X,
    decimal Y,
    decimal Yaw,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt,
    string RowVersion);

public sealed record PoiUsageResponse(
    bool HasRouteStopReferences,
    bool HasHistoricalTourReferences,
    bool HasReadyOrRunningTours,
    bool CanEditPose,
    bool CanEditContentAndAvailability);

public sealed record PoiDetailsResponse(
    Guid Id,
    string Name,
    string? Description,
    string MapKey,
    string MapFrame,
    decimal X,
    decimal Y,
    decimal Yaw,
    string? NarrationText,
    string? AudioUrl,
    int? NarrationSeconds,
    string? FallbackVideoUrl,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt,
    string RowVersion,
    PoiUsageResponse Usage);

public sealed record CreatePoiResponse(Guid Id);

public sealed record PoiManagementState(
    bool HasRouteStopReferences,
    bool HasHistoricalTourReferences,
    bool HasReadyOrRunningTours)
{
    public bool CanEditPose => !HasRouteStopReferences && !HasHistoricalTourReferences && !HasReadyOrRunningTours;
    public bool CanEditContentAndAvailability => !HasReadyOrRunningTours;
}
