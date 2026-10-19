namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface ITourManagementTransaction
{
    Task<T> ExecuteAsync<T>(Func<Task<T>> operation, CancellationToken ct);
}
