using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IAccountRepository
{
    Task<PagedResult<AccountListEntry>> ListAccountsAsync(
        string? search,
        AccountSort sort,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    /// <summary>Reserves the normalized username range until the account transaction commits.</summary>
    Task<bool> NormalizedUsernameExistsAsync(
        string normalizedUsername,
        CancellationToken cancellationToken = default);

    /// <summary>Locks the User root before reading roles and unrevoked refresh tokens; requires an account transaction.</summary>
    Task<User?> FindForManagementAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    void AddAccount(User user);

    void AddAuditLog(AuditLog auditLog);
}
