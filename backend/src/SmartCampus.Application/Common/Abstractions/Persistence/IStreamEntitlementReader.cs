namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>Unlocked reads for ADR-0055: may this Student session watch this robot's camera now.</summary>
public interface IStreamEntitlementReader
{
    /// <summary>
    /// True when the session is open, unexpired, on an unrevoked, unexpired invitation of an active ACCEPTED row, and its
    /// Tour is RUNNING with <c>AssignedRobotId</c> = that robot, or SCHEDULED/READY (the waiting room) with an
    /// unreleased reservation on it. Robot codes compare as the database collation does.
    /// </summary>
    Task<bool> StudentSessionMayWatchAsync(Guid sessionId, string robotCode, DateTimeOffset now, CancellationToken ct);
}
