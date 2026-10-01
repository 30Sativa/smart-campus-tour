namespace SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;

public sealed record CreateAccountResult(
    Guid Id,
    string Username,
    string FullName,
    string Role,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);
