namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>Serializes retries for a map/POI mutation within its SQL transaction.</summary>
public interface IMapPoiRequestLock
{
    Task LockRequestAsync(Guid actorUserId, Guid requestId, string operation, CancellationToken cancellationToken);
}
