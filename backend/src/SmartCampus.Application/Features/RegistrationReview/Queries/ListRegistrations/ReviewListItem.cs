namespace SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;

public sealed record ReviewListItem(Guid Id, Guid TourId, string TourName, DateTimeOffset TourScheduledStartAt,
    string TourState, string SchoolName, string GroupName, string State, int RowCount,
    string RepresentativeName, DateTimeOffset SubmittedAt, DateTimeOffset UpdatedAt);
