namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IRouteManagementTransaction
{
    Task<T> ExecuteAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken = default);
}
