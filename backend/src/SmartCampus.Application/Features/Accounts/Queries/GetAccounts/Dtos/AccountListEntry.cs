namespace SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;

/// <summary>Database projection used to build the account list response.</summary>
public sealed record AccountListEntry(
    Guid Id,
    string Username,
    string FullName,
    string? RoleCode,
    int RoleCount,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);
