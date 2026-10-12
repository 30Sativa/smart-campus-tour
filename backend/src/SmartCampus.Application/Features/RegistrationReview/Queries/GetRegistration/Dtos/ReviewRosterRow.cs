namespace SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration.Dtos;

public sealed record ReviewRosterRow(Guid Id, int RowNumber, string RowType, string DisplayName, string Email,
    string? ClassName, string RowVersion, string? InvitationRowVersion);
