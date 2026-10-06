namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IRegistrationTransaction
{
    Task<IRegistrationTransactionScope> BeginAsync(CancellationToken ct);
}
public interface IRegistrationTransactionScope : IAsyncDisposable
{
    Task CommitAsync(CancellationToken ct);
}

