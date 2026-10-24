namespace SmartCampus.Application.Common.Abstractions.Authentication;

/// <summary>Retains User root locks through the normal command save, or a read-only session check.</summary>
public interface IAccountTransaction
{
    Task<T> ExecuteAsync<T>(Func<Task<T>> operation, CancellationToken ct);
}
