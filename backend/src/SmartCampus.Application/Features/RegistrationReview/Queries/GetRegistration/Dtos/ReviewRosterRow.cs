namespace SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration.Dtos;

public sealed record ReviewRosterRow(Guid Id, int RowNumber, string RowType, string DisplayName, string Email,
    string? ClassName, string ParticipationState, string RowVersion, DateTimeOffset? ReviewedAt,
    Guid? ReviewedByUserId, string? ReviewReason, string? InvitationRowVersion, bool CanApprove, bool CanReject);
