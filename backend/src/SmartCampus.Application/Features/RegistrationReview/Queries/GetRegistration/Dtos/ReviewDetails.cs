using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations.Dtos;

namespace SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration.Dtos;

public sealed record ReviewDetails(ReviewListItem Summary, string ContactName, string ContactEmail,
    string RowVersion, string TourRowVersion, string? RejectionReason, DateTimeOffset? ReviewedAt,
    Guid? ReviewedByUserId, IReadOnlyList<ReviewRosterRow> Roster, ActionGate Review, ActionGate CorrectEmail);
