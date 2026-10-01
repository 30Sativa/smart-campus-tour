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

    Task<bool> NormalizedUsernameExistsAsync(
        string normalizedUsername,
        CancellationToken cancellationToken = default);

    Task<User?> FindForManagementAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    void AddAccount(User user);

    void AddAuditLog(AuditLog auditLog);
}
