namespace SmartCampus.Domain.Entities;

/// <summary>Stored Tour runtime values used by M2.2 (ADR-0043). PREPARING_VIEW and RETURNING_FRONT wait for M2.5.</summary>
public static class TourRuntime
{
    public const string Running = "RUNNING";
    public const string Completed = "COMPLETED";
    public const string Cancelled = "CANCELLED";
    public const string Normal = "NORMAL";
    public const string NeedsAssistance = "NEEDS_ASSISTANCE";
    /// <summary>The Operator paused a leg and the robot reported it ended: stopped on purpose, not an incident.</summary>
    public const string Paused = "PAUSED";
    /// <summary>Opened and waiting at the start for the Operator to depart; no command yet.</summary>
    public const string Initializing = "INITIALIZING";
    public const string Navigating = "NAVIGATING";
    public const string Observing = "OBSERVING";
    public const string ReturningToEnd = "RETURNING_TO_END";
    public const string NavigationFailed = "NavigationFailed";
    public const string CommandRejected = "CommandRejected";
    public const string CommandUnknown = "CommandUnknown";
    /// <summary>A GoTo expired undelivered while telemetry was fresh: the robot provably never received it.</summary>
    public const string CommandExpired = "CommandExpired";
    public const string RobotDisconnected = "RobotDisconnected";
    public const string BackendRestarted = "BackendRestarted";
}

public partial class Tour
{
    public bool CanAdvance => State == TourRuntime.Running && OperationalStatus == TourRuntime.Normal &&
        CurrentStep is TourRuntime.Observing or TourRuntime.Initializing;

    /// <summary>The robot is driving a leg the Operator may pause.</summary>
    public bool IsOnALeg => State == TourRuntime.Running && OperationalStatus == TourRuntime.Normal &&
        CurrentStep is TourRuntime.Navigating or TourRuntime.ReturningToEnd;

    public void Start(Guid robotId, DateTimeOffset now)
    {
        State = TourRuntime.Running;
        AssignedRobotId = robotId;
        OperationalStatus = TourRuntime.Normal;
        StartedAt = now;
        UpdatedAt = now;
    }

    /// <summary>Opened without a leg: viewers, camera and head are live, the robot waits for the Operator to depart.</summary>
    public void WaitAtStart(DateTimeOffset now)
    {
        CurrentStep = TourRuntime.Initializing;
        UpdatedAt = now;
    }

    /// <summary>The paused leg has ended; the Tour keeps its target so Retry resumes it with a new leg.</summary>
    public void Pause(DateTimeOffset now)
    {
        OperationalStatus = TourRuntime.Paused;
        AssistanceReason = null;
        UpdatedAt = now;
    }

    /// <summary>The Tour's current leg; a null <paramref name="stopId"/> is the leg to the end pose.</summary>
    public void BeginLeg(Guid legId, string legKind, Guid? stopId, DateTimeOffset now)
    {
        CurrentLegId = legId;
        CurrentLegKind = legKind;
        CurrentRevisionStopId = stopId;
        CurrentStep = legKind == RobotLegKinds.ToEnd ? TourRuntime.ReturningToEnd : TourRuntime.Navigating;
        UpdatedAt = now;
    }

    /// <summary>D12: <paramref name="dwellDeadline"/> is shown to Staff only; nothing leaves the POI when it passes.</summary>
    public void ArriveAtStop(Guid stopId, DateTimeOffset dwellDeadline, DateTimeOffset now)
    {
        LastArrivedRevisionStopId = stopId;
        CurrentStopVisitId = Guid.NewGuid();
        StopVisitClosedAt = null;
        DwellDeadlineAt = dwellDeadline;
        CurrentStep = TourRuntime.Observing;
        UpdatedAt = now;
    }

    public void CloseVisit(DateTimeOffset now)
    {
        StopVisitClosedAt = now;
        DwellDeadlineAt = null;
        UpdatedAt = now;
    }

    public void RequireAssistance(string reason, DateTimeOffset now)
    {
        OperationalStatus = TourRuntime.NeedsAssistance;
        AssistanceReason = reason;
        UpdatedAt = now;
    }

    public void ClearAssistance(DateTimeOffset now)
    {
        OperationalStatus = TourRuntime.Normal;
        AssistanceReason = null;
        UpdatedAt = now;
    }

    /// <summary>Nothing here proves the robot stopped; it stays held until inspection (ADR-0043 D13).</summary>
    public void EndEarly(string reason, DateTimeOffset now)
    {
        State = TourRuntime.Cancelled;
        EndedAt = now;
        EndReason = reason;
        DwellDeadlineAt = null;
        UpdatedAt = now;
    }

    /// <summary>After a restart nothing continues by itself and no dwell timer comes back.</summary>
    public void InterruptByRestart(DateTimeOffset now)
    {
        DwellDeadlineAt = null;
        // A paused Tour is already stopped and waiting for its Operator, which says more than the restart does.
        if (OperationalStatus is not (TourRuntime.NeedsAssistance or TourRuntime.Paused))
            RequireAssistance(TourRuntime.BackendRestarted, now);
        UpdatedAt = now;
    }

    public void Complete(DateTimeOffset now)
    {
        State = TourRuntime.Completed;
        EndedAt = now;
        UpdatedAt = now;
    }

    public bool HasExecutionState => StartedAt.HasValue || EndedAt.HasValue || AssignedRobotId.HasValue ||
        ActiveRouteId != RouteId || OperationalStatus is not null || AssistanceReason is not null ||
        CurrentStep is not null || CurrentLegId.HasValue || CurrentLegKind is not null ||
        CurrentRouteStopId.HasValue || LastArrivedRouteStopId.HasValue ||
        CurrentRevisionStopId.HasValue || LastArrivedRevisionStopId.HasValue || CurrentStopVisitId.HasValue ||
        StopVisitClosedAt.HasValue || CurrentHeadCommandId.HasValue || IsHeld || DwellDeadlineAt.HasValue;

    public bool CanEditPreparation => State == "SCHEDULED" && !HasExecutionState;
    public bool CanCancelBeforeStart => State is "SCHEDULED" or "READY" && !HasExecutionState;
    public bool CanReopenBeforeStart => State == "READY" && !HasExecutionState;
}
