namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>
/// Opens a read-committed transaction on the repositories' scoped context. Writers still need
/// Tour-first update locks; isolation alone does not serialize email reservations or admission.
/// </summary>
public interface IRegistrationTransaction
{
    Task<IRegistrationTransactionScope> BeginAsync(CancellationToken ct);
}
/// <summary>Commit follows UnitOfWork save; disposal releases locks and rolls back uncommitted writes.</summary>
public interface IRegistrationTransactionScope : IAsyncDisposable
{
    Task CommitAsync(CancellationToken ct);
}

