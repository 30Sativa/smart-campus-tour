namespace SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;

public sealed record CreateAccountResponse(
    Guid Id,
    string Username,
    string FullName,
    string Role,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);
