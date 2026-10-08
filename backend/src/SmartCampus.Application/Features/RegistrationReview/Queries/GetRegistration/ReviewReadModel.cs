using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;

namespace SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration;

public sealed record ReviewReadModel(ReviewListItem Summary, string ContactName, string ContactEmail,
    byte[] RowVersion, byte[] TourRowVersion, string? RejectionReason, DateTimeOffset? ReviewedAt,
    Guid? ReviewedByUserId, IReadOnlyList<RosterInput> Roster, bool HasInvitations);
