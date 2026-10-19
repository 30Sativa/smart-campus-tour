using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Infrastructure.Persistence;

public sealed class EfRouteManagementTransaction(ApplicationDbContext db) : IRouteManagementTransaction
{
    public async Task<T> ExecuteAsync<T>(Func<Task<T>> operation, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            // operation includes the normal UnitOfWork save and its atomic audit write.
            var result = await operation();
            await transaction.CommitAsync(ct);
            return result;
        }
        catch (Exception error) when (ConcurrentSqlChange(error))
        {
            // Disposal rolls back the entire operation, including any explicit stop deletion.
            throw new ConflictException("Related Route data changed concurrently. Reload and retry.", "ROUTE_CONCURRENT_CHANGE");
        }
    }

    private static bool ConcurrentSqlChange(Exception error) =>
        error is SqlException { Number: 1205 or 1222 or 3960 or 547 } ||
        error.InnerException is not null && ConcurrentSqlChange(error.InnerException);
}
