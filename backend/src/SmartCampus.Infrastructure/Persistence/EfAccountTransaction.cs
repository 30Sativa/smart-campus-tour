using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Infrastructure.Persistence;

public sealed class EfAccountTransaction(ApplicationDbContext db) : IAccountTransaction
{
    public async Task<T> ExecuteAsync<T>(Func<Task<T>> operation, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        try
        {
            var result = await operation();
            await transaction.CommitAsync(ct);
            return result;
        }
        catch (Exception error) when (ConcurrentChange(error))
        {
            throw new ConflictException("Account data changed concurrently. Retry the request.", "ACCOUNT_CONCURRENT_CHANGE");
        }
    }

    private static bool ConcurrentChange(Exception error) =>
        error is SqlException { Number: 1205 or 1222 } ||
        error.InnerException is not null && ConcurrentChange(error.InnerException);
}
