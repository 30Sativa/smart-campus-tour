namespace SmartCampus.Api.Features.Accounts.Responses;

public sealed record AccountListItemResponse(
    Guid Id,
    string Username,
    string FullName,
    string? Role,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);
