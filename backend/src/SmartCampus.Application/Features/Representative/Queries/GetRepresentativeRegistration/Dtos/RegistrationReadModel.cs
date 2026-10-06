using SmartCampus.Application.Features.Representative.Dtos;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;

public sealed record RegistrationReadModel(RegistrationListItem Summary, string ContactName, string ContactEmail,
    byte[] RowVersion, byte[] TourRowVersion, string? RejectionReason, DateTimeOffset? ReviewedAt,
    IReadOnlyList<RosterInput> Roster, bool HasInvitations);
