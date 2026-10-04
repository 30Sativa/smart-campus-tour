using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Infrastructure.Persistence;

public sealed class EfPoiManagementTransaction(ApplicationDbContext dbContext) : IPoiManagementTransaction
{
    public async Task<IPoiManagementTransactionScope> BeginAsync(CancellationToken cancellationToken = default)
    {
        var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        return new Scope(transaction);
    }

    private sealed class Scope(IDbContextTransaction transaction) : IPoiManagementTransactionScope
    {
        private bool _committed;

        public async Task CommitAsync(CancellationToken cancellationToken = default)
        {
            await transaction.CommitAsync(cancellationToken);
            _committed = true;
        }

        public async ValueTask DisposeAsync()
        {
            try
            {
                if (!_committed)
                    await transaction.RollbackAsync(CancellationToken.None);
            }
            finally
            {
                await transaction.DisposeAsync();
            }
        }
    }
}
