namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations;

public sealed record RegistrationListItem(Guid Id, Guid TourId, string TourName, DateTimeOffset TourScheduledStartAt,
    string TourState, string SchoolName, string GroupName, string State, int RowCount,
    DateTimeOffset SubmittedAt, DateTimeOffset UpdatedAt);
