namespace SmartCampus.Application.Features.Pois.Dtos;

public sealed record CreatePoiRequest(
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
    string? FallbackVideoUrl);

public sealed record UpdatePoiRequest(
    string ExpectedRowVersion,
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
    string? FallbackVideoUrl);

public sealed record ChangePoiAvailabilityRequest(string ExpectedRowVersion);

public sealed record GetPoisRequest(string? Search, string? Sort, int Page, int Size, bool? IsActive);

