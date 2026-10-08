using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;

namespace SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration;

public sealed record ReviewDetails(ReviewListItem Summary, string ContactName, string ContactEmail,
    string RowVersion, string TourRowVersion, string? RejectionReason, DateTimeOffset? ReviewedAt,
    Guid? ReviewedByUserId, IReadOnlyList<RosterInput> Roster, ActionGate Review);
