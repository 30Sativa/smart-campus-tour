using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours;

public sealed record TourInput(string Name, string? Description, Guid RouteId,
    DateTimeOffset ScheduledStartAt, string? FallbackVideoUrl);
public sealed record CreateTourInput(string Name, string? Description, Guid RouteRevisionId, string RobotCode,
    Guid OperatorUserId, DateTimeOffset ScheduledStartAt, string? FallbackVideoUrl);
public sealed record TourListRequest(string? Search, string Sort, int Page, int Size,
    string? State, DateTimeOffset? From, DateTimeOffset? To);
public sealed record TourSummary(Guid Id, string Name, string? Description, Guid RouteId, string RouteName,
    Guid ActiveRouteId, DateTimeOffset ScheduledStartAt, string State, Guid CreatedByUserId,
    DateTimeOffset CreatedAt, DateTimeOffset? UpdatedAt, string RowVersion,
    int RegistrationCount, int InvitationCount, Guid? RouteRevisionId);
public sealed record TourUsage(bool HasRegistrations, bool HasAllowedBranches, bool HasOperationalHistory, bool HasRobotOwnership)
{
    public bool LocksScheduleAndRoute => HasRegistrations || HasAllowedBranches || HasOperationalHistory || HasRobotOwnership;
}
public sealed record TourPermissions(bool CanEditMetadata, bool CanChangeScheduleAndRoute, bool CanCancel, bool CanDelete = false);
public sealed record TourReservationView(string RobotCode, DateTimeOffset StartsAt, DateTimeOffset EndsAt,
    int MeasuredDurationSeconds, DateTimeOffset? ReleasedAt);
public sealed record TourTargetView(RouteTestParticipantView? Operator, TourReservationView? Reservation);
/// <summary>A Tour scheduled from a revision has null Route/ActiveRoute and carries RouteRevision instead.</summary>
public sealed record TourDetails(TourSummary Tour, RouteDetails? Route, RouteDetails? ActiveRoute,
    string? FallbackVideoUrl, DateTimeOffset? StartedAt, DateTimeOffset? EndedAt, string? EndReason,
    TourUsage Usage, TourPermissions Permissions, RouteRevisionView? RouteRevision,
    RouteTestParticipantView? Operator, TourReservationView? Reservation);
public sealed record TourMutationResult(Guid Id);
