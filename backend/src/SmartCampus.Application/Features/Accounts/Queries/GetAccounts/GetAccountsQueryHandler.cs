using MediatR;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;

namespace SmartCampus.Application.Features.Accounts.Queries.GetAccounts;

public sealed class GetAccountsQueryHandler(IAccountRepository accountRepository)
    : IRequestHandler<GetAccountsQuery, PagedResult<AccountListItemResponse>>
{
    public async Task<PagedResult<AccountListItemResponse>> Handle(
        GetAccountsQuery query,
        CancellationToken cancellationToken)
    {
        var request = query.Request;
        if (!AccountSortParser.TryParse(request.Sort, out var sort))
            throw new InvalidOperationException(
                "Validated GetAccountsQuery contained invalid sort input.");

        var page = await accountRepository.ListAccountsAsync(
            string.IsNullOrWhiteSpace(request.Search) ? null : request.Search.Trim(),
            sort,
            request.Page,
            request.Size,
            cancellationToken);

        var items = page.Items.Select(account =>
        {
            return new AccountListItemResponse(
                account.Id,
                account.Username,
                account.FullName,
                ResolveListRole(account.RoleCode, account.RoleCount),
                account.IsActive,
                account.CreatedAt,
                account.UpdatedAt);
        }).ToArray();

        return new PagedResult<AccountListItemResponse>(items, page.Page, page.PageSize, page.TotalItems);
    }

    private static string? ResolveListRole(string? roleCode, int roleCount)
    {
        if (roleCount != 1 || roleCode is null)
            return null;

        return ApplicationRoles.TryResolve([roleCode], out var role) ? role : null;
    }
}
