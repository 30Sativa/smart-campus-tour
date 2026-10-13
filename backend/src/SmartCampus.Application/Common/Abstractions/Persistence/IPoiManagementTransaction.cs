namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IPoiManagementTransaction
{
    Task<IPoiManagementTransactionScope> BeginAsync(CancellationToken cancellationToken = default);
}

public interface IPoiManagementTransactionScope : IAsyncDisposable
{
    Task CommitAsync(CancellationToken cancellationToken = default);
}
