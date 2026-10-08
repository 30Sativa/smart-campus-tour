namespace SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;

public sealed record ReviewListRequest(string? Search = null, string? Sort = null, int Page = 1,
    int Size = 20, string? Expand = null, Guid? TourId = null, string? State = null,
    DateTimeOffset? From = null, DateTimeOffset? To = null);
