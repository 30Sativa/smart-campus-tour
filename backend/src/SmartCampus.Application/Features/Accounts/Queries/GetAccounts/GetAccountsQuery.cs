using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;

namespace SmartCampus.Application.Features.Accounts.Queries.GetAccounts;

public sealed record GetAccountsQuery(
    string? Search = null,
    string? Sort = null,
    int Page = 1,
    int PageSize = 20,
    string? Expand = null)
    : IQuery<PagedResult<AccountListItem>>;
