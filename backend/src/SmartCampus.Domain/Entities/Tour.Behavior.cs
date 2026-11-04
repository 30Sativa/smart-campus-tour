namespace SmartCampus.Domain.Entities;

/// <summary>Stored Tour runtime values used by M2.2 (ADR-0043). PREPARING_VIEW and RETURNING_FRONT wait for M2.5.</summary>
public static class TourRuntime
{
    public const string Running = "RUNNING";
    public const string Completed = "COMPLETED";
    public const string Normal = "NORMAL";
    public const string NeedsAssistance = "NEEDS_ASSISTANCE";
    public const string Navigating = "NAVIGATING";
    public const string Observing = "OBSERVING";
    public const string ReturningToEnd = "RETURNING_TO_END";
    public const string NavigationFailed = "NavigationFailed";
    public const string CommandRejected = "CommandRejected";
}

public partial class Tour
{
    public bool CanAdvance => State == TourRuntime.Running && OperationalStatus == TourRuntime.Normal && CurrentStep == TourRuntime.Observing;

    public void Start(Guid robotId, DateTimeOffset now)
    {
        State = TourRuntime.Running;
        AssignedRobotId = robotId;
        OperationalStatus = TourRuntime.Normal;
        StartedAt = now;
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
