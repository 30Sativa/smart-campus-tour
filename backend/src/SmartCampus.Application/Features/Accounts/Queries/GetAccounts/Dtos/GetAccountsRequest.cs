namespace SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;

public sealed record GetAccountsRequest(
    string? Search,
    string? Sort,
    int Page = 1,
    int Size = 20);
