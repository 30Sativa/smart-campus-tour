using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Infrastructure.Persistence;

public sealed class EfTourManagementTransaction(ApplicationDbContext db) : ITourManagementTransaction
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
        catch (Exception error) when (IsConcurrentChange(error))
        {
            throw new ConflictException("Dữ liệu Tour hoặc danh mục liên quan đang thay đổi. Tải lại và thử lại.", "TOUR_CONCURRENT_CHANGE");
        }
    }

    private static bool IsConcurrentChange(Exception error) =>
        error is SqlException { Number: 1205 or 1222 or 3960 or 2601 or 2627 or 51021 } ||
        error.InnerException is not null && IsConcurrentChange(error.InnerException);
}
