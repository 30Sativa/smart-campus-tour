using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours;

public sealed record TourInput(string Name, string? Description, Guid RouteId,
    DateTimeOffset ScheduledStartAt, string? FallbackVideoUrl);
public sealed record CreateTourInput(string Name, string? Description, Guid RouteRevisionId, string RobotCode,
    Guid OperatorUserId, DateTimeOffset ScheduledStartAt, string? FallbackVideoUrl, int Capacity);
/// <summary>
/// <see cref="OperatorUserId"/> keeps the Tours that account operates; <see cref="NeedsReconcile"/> keeps the Tours with an
/// UNKNOWN GoTo, in any state. <see cref="IncludeReadyBlockers"/> evaluates READY for each SCHEDULED row of the page, the
/// same advisory read as the Tour detail, so the page size is capped (see the validator).
/// </summary>
public sealed record TourListRequest(string? Search, string Sort, int Page, int Size,
    string? State, DateTimeOffset? From, DateTimeOffset? To, string? Phase = null, DateTimeOffset Now = default,
    Guid? OperatorUserId = null, bool NeedsReconcile = false, bool IncludeReadyBlockers = false);
/// <summary>The Staff list's groupings of Tour state; a single <see cref="TourListRequest.State"/> cannot express them.</summary>
public static class TourPhases
{
    public const string Upcoming = "UPCOMING";
    public const string Running = "RUNNING";
    public const string Finished = "FINISHED";
}
public sealed record TourSummary(Guid Id, string Name, string? Description, Guid RouteId, string RouteName,
    Guid ActiveRouteId, DateTimeOffset ScheduledStartAt, string State, Guid CreatedByUserId,
    DateTimeOffset CreatedAt, DateTimeOffset? UpdatedAt, string RowVersion,
    int RegistrationCount, int InvitationCount, Guid? RouteRevisionId, TourReservationView? Reservation = null,
    TourExecutionSummary? Execution = null, RouteTestParticipantView? Operator = null,
    IReadOnlyList<ConflictBlocker>? ReadyBlockers = null, int Capacity = 0, int HeldSeats = 0,
    DateTimeOffset? RegistrationClosesAt = null);
/// <summary>
/// Read-only situation of a Tour for list rows. <see cref="CommandState"/> is the current leg's GoTo, the command
/// <c>GetTour</c> shows. <see cref="NeedsReconcile"/> is true while any GoTo of the Tour is UNKNOWN, in any Tour state.
/// </summary>
public sealed record TourExecutionSummary(string? OperationalStatus, string? AssistanceReason, string? CurrentStep,
    string? CommandState, bool NeedsReconcile);
public sealed record TourUsage(bool HasRegistrations, bool HasAllowedBranches, bool HasOperationalHistory, bool HasRobotOwnership)
{
    public bool LocksScheduleAndRoute => HasRegistrations || HasAllowedBranches || HasOperationalHistory || HasRobotOwnership;
}
/// <summary><see cref="ReadyBlockers"/> lists every READY condition the Tour fails now; empty when it can be marked READY.</summary>
public sealed record TourPermissions(bool CanEditMetadata, bool CanChangeScheduleAndRoute, bool CanCancel, bool CanDelete = false,
    bool CanMarkReady = false, bool CanReopen = false, IReadOnlyList<ConflictBlocker>? ReadyBlockers = null,
    bool CanChangeCapacity = false, bool CanChangeOperator = false, int MaxCapacity = 0);
public sealed record TourReservationView(string RobotCode, DateTimeOffset StartsAt, DateTimeOffset EndsAt,
    int MeasuredDurationSeconds, DateTimeOffset? ReleasedAt, int ExpectedDurationSeconds);
/// <summary>One shift on one day: <see cref="Time"/> is the Tour start, the reservation is the whole shift.</summary>
public sealed record TourSlotView(string Time, DateTimeOffset StartsAt, bool Available, string? ReasonCode, string? Reason,
    DateTimeOffset? ReservationStartsAt, DateTimeOffset? ReservationEndsAt, DateTimeOffset RegistrationClosesAt,
    string ShiftCode, string ShiftName, int MaxDurationSeconds);
public sealed record TourSlotDay(DateOnly Date, IReadOnlyList<TourSlotView> Slots);
public sealed record TourSlotsView(Guid RouteRevisionId, string RobotCode, int? MeasuredDurationSeconds,
    int? ExpectedDurationSeconds, IReadOnlyList<TourSlotDay> Days, int RecommendedMaxSeconds, int MaxCapacity = 0);
/// <summary>A configured shift on one day, for drawing the calendar before a route or robot is chosen.</summary>
public sealed record TourShiftView(string Code, string Name, DateTimeOffset StartsAt, DateTimeOffset EndsAt,
    DateTimeOffset TourStartsAt, string Time, int MaxDurationSeconds, TourShiftBlockView? Block);
/// <summary>The Admin block closing a shift; <see cref="Scope"/> says whether it covers the whole day.</summary>
public sealed record TourShiftBlockView(Guid Id, string Scope, string Reason);
public static class ScheduleBlockScope { public const string Day = "DAY"; public const string Shift = "SHIFT"; }
public sealed record TourShiftDay(DateOnly Date, IReadOnlyList<TourShiftView> Shifts);
public sealed record TourShiftsView(IReadOnlyList<TourShiftDay> Days, int RecommendedMaxSeconds);
public sealed record TourTargetView(RouteTestParticipantView? Operator, TourReservationView? Reservation);
/// <summary>A Tour scheduled from a revision has null Route/ActiveRoute and carries RouteRevision instead.</summary>
public sealed record TourDetails(TourSummary Tour, RouteDetails? Route, RouteDetails? ActiveRoute,
    string? FallbackVideoUrl, DateTimeOffset? StartedAt, DateTimeOffset? EndedAt, string? EndReason,
    TourUsage Usage, TourPermissions Permissions, RouteRevisionView? RouteRevision,
    RouteTestParticipantView? Operator, TourReservationView? Reservation,
    TourExecutionView? Execution = null, TourAllowedActions? AllowedActions = null);
/// <summary>The running state of a Tour: null fields until Start; <see cref="DwellDeadlineAt"/> is display only (ADR-0043 D12).</summary>
public sealed record TourExecutionView(string State, string? OperationalStatus, string? AssistanceReason, string? CurrentStep,
    Guid? CurrentLegId, string? CurrentLegKind, Guid? CurrentRevisionStopId, Guid? LastArrivedRevisionStopId,
    DateTimeOffset? DwellDeadlineAt, TourCommandView? Command);
public sealed record TourCommandView(Guid Id, string Kind, string State, string? Outcome, string? ReasonCode);
/// <summary>Advisory for the caller; Start and Next recheck under locks. <see cref="BlockedBy"/> holds check ids, or a state reason code.</summary>
public sealed record TourActionAvailability(bool Allowed, string? Reason, IReadOnlyList<string> BlockedBy);
public sealed record TourAllowedActions(TourActionAvailability Start, TourActionAvailability Next, TourActionAvailability EndEarly,
    TourActionAvailability RetryLeg, TourActionAvailability Reconcile);
public sealed record TourMutationResult(Guid Id);
/// <summary>TourEvent types and receipt actions. READY and Reopen are not operational use of the Tour; the rest are.</summary>
public static class TourLifecycleEvents
{
    public const string Ready = "TOUR_READY";
    public const string Reopened = "TOUR_REOPENED";
    public const string Started = "TOUR_STARTED";
    public const string Next = "TOUR_NEXT";
    public const string Completed = "TOUR_COMPLETED";
    public const string LegDispatchRequested = "LEG_DISPATCH_REQUESTED";
    public const string VisitClosed = "VISIT_CLOSED";
    public const string LegAccepted = "LEG_ACCEPTED";
    public const string LegRejected = "LEG_REJECTED";
    public const string LegTerminal = "LEG_TERMINAL";
    public const string EndedEarly = "TOUR_ENDED_EARLY";
    public const string LegRetried = "TOUR_LEG_RETRIED";
    public const string LegWithdrawn = "LEG_WITHDRAWN";
    public const string LegCancelRequested = "LEG_CANCEL_REQUESTED";
    public const string CommandDelivered = "COMMAND_DELIVERED";
    public const string CommandExpired = "COMMAND_EXPIRED";
    public const string CommandUnknown = "COMMAND_UNKNOWN";
    public const string CommandReconciled = "COMMAND_RECONCILED";
    public const string BackendRestarted = "TOUR_BACKEND_RESTARTED";
    public const string InspectionReleased = "ROBOT_INSPECTION_RELEASED";
    public const string CapacityChanged = "TOUR_CAPACITY_CHANGED";
    public const string OperatorChanged = "TOUR_OPERATOR_CHANGED";
}
