using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface ITourManagementRepository
{
    Task<IAsyncDisposable> BeginReadAsync(Guid id, CancellationToken ct);
    /// <summary>Serializes an actor/request pair using a transaction-owned application lock; call before the Tour root lock.</summary>
    Task LockRequestAsync(Guid actor, Guid requestId, CancellationToken ct);
    Task<AuditLog?> FindRequestAsync(Guid actor, Guid requestId, CancellationToken ct);
    Task<PagedResult<TourSummary>> ListAsync(TourListRequest request, CancellationToken ct);
    Task<Tour?> FindAsync(Guid id, CancellationToken ct);
    Task<TourSummary?> GetSummaryAsync(Guid id, CancellationToken ct);
    Task<TourUsage> GetUsageAsync(Guid id, CancellationToken ct);
    /// <summary>Tracked registrations without roster history; caller must hold the shared Tour root lock.</summary>
    Task<IReadOnlyList<GroupRegistration>> LoadCancellationRegistrationsAsync(Guid id, CancellationToken ct);
    /// <summary>Serializes reservation changes for one robot; call after the Tour root lock.</summary>
    Task LockRobotReservationsAsync(Guid robotId, CancellationToken ct);
    Task<IReadOnlyList<TourReservationHold>> GetActiveReservationsAsync(Guid robotId, DateTimeOffset startsAt, DateTimeOffset endsAt, CancellationToken ct);
    /// <summary>Tracked; caller must hold the Tour root lock.</summary>
    Task<TourRobotReservation?> FindActiveReservationAsync(Guid id, CancellationToken ct);
    /// <summary>
    /// True when a Tour holding the robot is in NEEDS_ASSISTANCE: the Tour named by <c>Robots.CurrentTourId</c>, or a RUNNING
    /// Tour assigned to it (the open-incident stand-in of ADR-0042 open decision 3).
    /// </summary>
    Task<bool> HasRobotTourNeedingAssistanceAsync(Guid robotId, Guid? exceptTourId, CancellationToken ct);
    /// <summary>True while the robot has any open command; an UNKNOWN GoTo counts (ADR-0042 §4).</summary>
    Task<bool> HasOpenCommandAsync(Guid robotId, CancellationToken ct);
    /// <summary>
    /// Sets Robots.CurrentTourId only if the robot is free and still dispatchable, in one UPDATE; false when it is not.
    /// UX_Robots_CurrentTour is the final guard. Caller holds the Tour root and robot reservation locks.
    /// </summary>
    Task<bool> TryClaimRobotAsync(Guid robotId, Guid tourId, DateTimeOffset now, CancellationToken ct);
    /// <summary>Clears Robots.CurrentTourId for this Tour unless the robot needs inspection (ADR-0043 D13); false when it stays held.</summary>
    Task<bool> ReleaseRobotAsync(Guid robotId, Guid tourId, CancellationToken ct);
    Task<RobotCommand?> FindCommandAsync(Guid id, CancellationToken ct);
    /// <summary>Tracked under an update lock; caller must hold the Tour root lock of the command's Tour.</summary>
    Task<RobotCommand?> LockCommandAsync(Guid id, CancellationToken ct);
    /// <summary>The GoTo of a leg, for the Tour detail.</summary>
    Task<RobotCommand?> FindLegCommandAsync(Guid legId, CancellationToken ct);
    /// <summary>The recorded result of one phase of a command, used to tell an exact repeat from a conflict.</summary>
    Task<TourEvent?> FindCommandEventAsync(Guid commandId, string eventType, CancellationToken ct);
    Task<TourTargetView> GetTargetAsync(Guid id, CancellationToken ct);
    void Add(Tour tour);
    void Add(TourRobotReservation reservation);
    void Add(RobotCommand command);
    /// <summary>Tracked under an update lock; caller holds the Tour root lock.</summary>
    Task<RobotCommand?> LockOpenGoToAsync(Guid tourId, CancellationToken ct);
    /// <summary>The live Cancel of a GoTo, tracked under an update lock; caller holds the Tour root lock.</summary>
    Task<RobotCommand?> LockOpenCancelAsync(Guid goToId, CancellationToken ct);
    /// <summary>Candidates only, unlocked: each transition rechecks under its own locks.</summary>
    Task<IReadOnlyList<RobotCommand>> ListOpenCommandsAsync(CancellationToken ct);
    /// <summary>The Tour of the robot's open command, unlocked, so a poll knows which root lock to take first.</summary>
    Task<Guid?> FindOpenCommandTourAsync(Guid robotId, CancellationToken ct);
    Task<IReadOnlyList<Guid>> ListRunningTourIdsAsync(CancellationToken ct);
    /// <summary>
    /// SCHEDULED/READY Tours whose robot hold ended by now (ADR-0047), unlocked candidates oldest first: the active
    /// reservation's EndsAt, never before ScheduledStartAt + startLateLimit, which alone applies without a reservation.
    /// </summary>
    Task<IReadOnlyList<Guid>> ListOverdueUnstartedTourIdsAsync(DateTimeOffset now, TimeSpan startLateLimit, CancellationToken ct);
    Task MarkRobotNeedsInspectionAsync(Guid robotId, CancellationToken ct);
    /// <summary>Clears the hold only if the robot still has this version; false when it changed.</summary>
    Task<bool> ReleaseInspectionAsync(Guid robotId, byte[] expectedRowVersion, CancellationToken ct);
    Task<AuditLog?> FindRobotRequestAsync(Guid actor, Guid requestId, CancellationToken ct);
    void AddAudit(AuditLog audit);
    void AddEvent(TourEvent tourEvent);
    void AddRouteChangeEvent(Tour tour, Guid previousRouteId, Guid actor, DateTimeOffset now);
}
