namespace SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;

public sealed record AccountListItemResponse(
    Guid Id,
    string Username,
    string FullName,
    string? Role,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);
