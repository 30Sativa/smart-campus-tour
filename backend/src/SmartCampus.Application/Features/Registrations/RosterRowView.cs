namespace SmartCampus.Application.Features.Registrations;

public sealed record RosterRowView(Guid Id, int RowNumber, string RowType, string DisplayName, string Email,
    string? ClassName, string ParticipationState, string RowVersion, DateTimeOffset? ReviewedAt,
    Guid? ReviewedByUserId, string? ReviewReason, string? InvitationRowVersion,
    bool CanRequestEmailChange, bool CanRemove, bool CanApprove, bool CanReject);
