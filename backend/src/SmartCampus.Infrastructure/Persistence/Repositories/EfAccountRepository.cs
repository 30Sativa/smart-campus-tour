using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfAccountRepository(ApplicationDbContext dbContext) : IAccountRepository
{
    public async Task<PagedResult<AccountListEntry>> ListAccountsAsync(
        string? search,
        AccountSort sort,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        IQueryable<User> users = dbContext.Users.AsNoTracking();
        if (search is not null)
        {
            users = users.Where(user =>
                user.Username.Contains(search) || user.FullName.Contains(search));
        }

        var orderedUsers = ApplySort(users, sort);
        var totalItems = await orderedUsers.LongCountAsync(cancellationToken);
        var offset = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);
        var items = await orderedUsers
            .Skip(offset)
            .Take(pageSize)
            .Select(user => new AccountListEntry(
                user.Id,
                user.Username,
                user.FullName,
                user.UserRoles
                    .OrderBy(userRole => userRole.Role)
                    .Select(userRole => userRole.Role)
                    .FirstOrDefault(),
                user.UserRoles.Count(),
                user.IsActive,
                user.CreatedAt,
                user.UpdatedAt))
            .ToArrayAsync(cancellationToken);

        return new PagedResult<AccountListEntry>(items, page, pageSize, totalItems);
    }

    public Task<bool> NormalizedUsernameExistsAsync(
        string normalizedUsername,
        CancellationToken cancellationToken = default) =>
        // The unique-index range lock also serializes two creates when no User exists yet.
        dbContext.Users.FromSqlInterpolated($"SELECT * FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE NormalizedUsername = {normalizedUsername}")
            .AnyAsync(cancellationToken);

    public Task<User?> FindForManagementAsync(
        Guid userId,
        CancellationToken cancellationToken = default) =>
        dbContext.Users
            .FromSqlInterpolated($"SELECT * FROM dbo.Users WITH (UPDLOCK, ROWLOCK) WHERE Id = {userId}")
            .Include(user => user.UserRoles)
            .Include(user => user.RefreshTokens.Where(token => token.RevokedAt == null))
            .SingleOrDefaultAsync(user => user.Id == userId, cancellationToken);

    public async Task<IReadOnlyList<AccountUsage>> ListAccountUsageAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var operated = await dbContext.Tours.AsNoTracking()
            .Where(tour => tour.OperatorUserId == userId && (tour.State == "SCHEDULED" || tour.State == "READY" || tour.State == "RUNNING"))
            .Select(tour => new AccountUsage(true, tour.Name, tour.ScheduledStartAt, null, tour.State == "RUNNING")).ToArrayAsync(cancellationToken);
        var represented = await dbContext.GroupRegistrations.AsNoTracking()
            .Where(registration => registration.RepresentativeUserId == userId &&
                (registration.State == RegistrationStates.Submitted || registration.State == RegistrationStates.Approved) &&
                (registration.Tour.State == "SCHEDULED" || registration.Tour.State == "READY" || registration.Tour.State == "RUNNING"))
            .Select(registration => new AccountUsage(false, registration.Tour.Name, registration.Tour.ScheduledStartAt, registration.GroupName))
            .ToArrayAsync(cancellationToken);
        return operated.Concat(represented).OrderBy(usage => usage.ScheduledStartAt).ToArray();
    }

    public void AddAccount(User user) => dbContext.Users.Add(user);

    public void AddAuditLog(AuditLog auditLog) => dbContext.AuditLogs.Add(auditLog);

    private static IOrderedQueryable<User> ApplySort(IQueryable<User> users, AccountSort sort)
    {
        var orderedUsers = (sort.Field, sort.Descending) switch
        {
            (AccountSortField.Username, false) => users.OrderBy(user => user.Username),
            (AccountSortField.Username, true) => users.OrderByDescending(user => user.Username),
            (AccountSortField.FullName, false) => users.OrderBy(user => user.FullName),
            (AccountSortField.FullName, true) => users.OrderByDescending(user => user.FullName),
            (AccountSortField.Role, false) => users.OrderBy(user =>
                user.UserRoles.OrderBy(userRole => userRole.Role).Select(userRole => userRole.Role).FirstOrDefault()),
            (AccountSortField.Role, true) => users.OrderByDescending(user =>
                user.UserRoles.OrderBy(userRole => userRole.Role).Select(userRole => userRole.Role).FirstOrDefault()),
            (AccountSortField.IsActive, false) => users.OrderBy(user => user.IsActive),
            (AccountSortField.IsActive, true) => users.OrderByDescending(user => user.IsActive),
            (AccountSortField.CreatedAt, false) => users.OrderBy(user => user.CreatedAt),
            (AccountSortField.CreatedAt, true) => users.OrderByDescending(user => user.CreatedAt),
            (AccountSortField.UpdatedAt, false) => users.OrderBy(user => user.UpdatedAt),
            (AccountSortField.UpdatedAt, true) => users.OrderByDescending(user => user.UpdatedAt),
            _ => throw new ArgumentOutOfRangeException(nameof(sort), sort.Field, "Unsupported account sort field.")
        };

        return orderedUsers.ThenBy(user => user.Id);
    }
}
