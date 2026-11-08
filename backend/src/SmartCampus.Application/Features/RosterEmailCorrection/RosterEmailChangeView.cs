namespace SmartCampus.Application.Features.RosterEmailCorrection;

public sealed record RosterEmailChangeView(Guid Id, Guid RegistrationId, Guid RowId, int RowNumber,
    string CurrentEmail, string ProposedEmail, string State, Guid RequestedByUserId, DateTimeOffset CreatedAt,
    DateTimeOffset? ReviewedAt, Guid? ReviewedByUserId, string? ReviewReason, string RowVersion,
    string TourRowVersion, string RegistrationRowVersion, string RosterRowVersion,
    bool CanReview, DateTimeOffset ExpiresAt);
