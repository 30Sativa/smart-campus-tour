using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;

public sealed record RegistrationDetails(RegistrationListItem Summary, string ContactName, string ContactEmail,
    string RowVersion, string TourRowVersion, string? RejectionReason, DateTimeOffset? ReviewedAt,
    IReadOnlyList<RosterInput> Roster, RegistrationActions AllowedActions);
