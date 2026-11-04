namespace SmartCampus.Domain.Entities;

public partial class Tour
{
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
