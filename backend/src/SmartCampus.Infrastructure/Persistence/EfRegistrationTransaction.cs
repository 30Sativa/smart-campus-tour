using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Infrastructure.Persistence;

public sealed class EfRegistrationTransaction(ApplicationDbContext context) : IRegistrationTransaction
{
    public async Task<IRegistrationTransactionScope> BeginAsync(CancellationToken ct) =>
        new Scope(await context.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct));
    private sealed class Scope(IDbContextTransaction transaction) : IRegistrationTransactionScope
    {
        public Task CommitAsync(CancellationToken ct) => transaction.CommitAsync(ct);
        public ValueTask DisposeAsync() => transaction.DisposeAsync();
    }
}

