using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;

namespace SmartCampus.Application.Features.Accounts.Queries.GetAccounts;

public sealed record GetAccountsQuery(GetAccountsRequest Request)
    : IQuery<PagedResult<AccountListItemResponse>>;
