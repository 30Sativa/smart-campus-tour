namespace SmartCampus.Application.Features.Representative.Queries.Lists;

/// <summary>Collection parameters shared by the Representative Tour and registration lists.</summary>
public sealed record RepresentativeListRequest(string? Search = null, string? Sort = null, int Page = 1,
    int Size = 20, string? Expand = null, Guid? TourId = null, string? State = null);
